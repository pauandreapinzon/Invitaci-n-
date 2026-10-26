import {
  ComparisonOp,
  Condition,
  EvaluationContext,
  Severity,
  SymptomObservation,
  Trend,
  VitalMetric,
  Vitals,
} from './types';

const SEVERITY_ORDER: Record<Severity, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };

export interface ConditionResult {
  matched: boolean;
  /** Hechos que soportan el resultado, para auditoria clinica. */
  evidence: string[];
  /** Metricas requeridas por la condicion que no estan disponibles. */
  missing: string[];
}

function compare(op: ComparisonOp, left: number, right: number): boolean {
  switch (op) {
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    case 'eq':
      return left === right;
    default:
      return false;
  }
}

const OP_LABEL: Record<ComparisonOp, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
};

const VITAL_LABEL: Record<VitalMetric, string> = {
  temperatureC: 'Temperatura (C)',
  heartRate: 'Frecuencia cardiaca (lpm)',
  respiratoryRate: 'Frecuencia respiratoria (rpm)',
  spo2: 'Saturacion de oxigeno (%)',
  systolicBp: 'Presion sistolica (mmHg)',
  diastolicBp: 'Presion diastolica (mmHg)',
  glucoseMgDl: 'Glucemia (mg/dL)',
};

export function vitalLabel(metric: VitalMetric): string {
  return VITAL_LABEL[metric] ?? metric;
}

function findSymptom(ctx: EvaluationContext, code: string): SymptomObservation | undefined {
  return ctx.symptoms.find((s) => s.code === code);
}

function none(): ConditionResult {
  return { matched: false, evidence: [], missing: [] };
}

/**
 * Evalua una condicion de forma pura y determinista.
 * No hay aleatoriedad, red, reloj ni modelo de lenguaje involucrado:
 * la misma entrada produce siempre la misma salida (requisito de auditoria).
 */
export function evaluateCondition(condition: Condition, ctx: EvaluationContext): ConditionResult {
  switch (condition.type) {
    case 'symptom': {
      const observation = findSymptom(ctx, condition.code);
      const wantPresent = condition.present !== false;
      if (!observation) {
        // Sin observacion no se puede afirmar presencia; la ausencia explicita si se puede inferir.
        return wantPresent ? { matched: false, evidence: [], missing: [`sintoma:${condition.code}`] } : none();
      }
      if (observation.present !== wantPresent) return none();

      const evidence: string[] = [
        `Sintoma ${condition.code} reportado como ${observation.present ? 'presente' : 'ausente'}` +
          (observation.severity ? ` (severidad ${observation.severity})` : '') +
          (observation.trend ? ` (evolucion ${observation.trend})` : ''),
      ];

      if (condition.severityAtLeast) {
        if (!observation.severity) return { matched: false, evidence: [], missing: [`severidad:${condition.code}`] };
        if (SEVERITY_ORDER[observation.severity] < SEVERITY_ORDER[condition.severityAtLeast]) return none();
      }
      if (condition.trend) {
        if (!observation.trend) return { matched: false, evidence: [], missing: [`evolucion:${condition.code}`] };
        if (observation.trend !== condition.trend) return none();
      }
      if (condition.onsetDaysAtLeast !== undefined) {
        if (observation.onsetDays === undefined) return { matched: false, evidence: [], missing: [`duracion:${condition.code}`] };
        if (observation.onsetDays < condition.onsetDaysAtLeast) return none();
        evidence.push(`Duracion de ${condition.code}: ${observation.onsetDays} dia(s)`);
      }
      return { matched: true, evidence, missing: [] };
    }

    case 'symptomCount': {
      const hits = condition.codes.filter((code) => findSymptom(ctx, code)?.present);
      if (hits.length >= condition.atLeast) {
        return { matched: true, evidence: [`${hits.length} de ${condition.codes.length} sintomas presentes: ${hits.join(', ')}`], missing: [] };
      }
      return none();
    }

    case 'vital': {
      const value = ctx.vitals?.[condition.metric];
      if (value === undefined || value === null) {
        return { matched: false, evidence: [], missing: [`signo:${condition.metric}`] };
      }
      if (!compare(condition.op, value, condition.value)) return none();
      return {
        matched: true,
        evidence: [`${vitalLabel(condition.metric)} = ${value} (umbral ${OP_LABEL[condition.op]} ${condition.value})`],
        missing: [],
      };
    }

    case 'vitalMissing': {
      const value = ctx.vitals?.[condition.metric];
      const isMissing = value === undefined || value === null;
      return isMissing ? { matched: true, evidence: [`${vitalLabel(condition.metric)} no reportado`], missing: [] } : none();
    }

    case 'age': {
      if (!compare(condition.op, ctx.patient.ageYears, condition.value)) return none();
      return { matched: true, evidence: [`Edad ${ctx.patient.ageYears} anos (umbral ${OP_LABEL[condition.op]} ${condition.value})`], missing: [] };
    }

    case 'pregnant':
      return ctx.patient.pregnant ? { matched: true, evidence: ['Paciente en embarazo'], missing: [] } : none();

    case 'comorbidity': {
      const list = ctx.patient.comorbidities ?? [];
      const hits = condition.anyOf.filter((c) => list.includes(c));
      return hits.length
        ? { matched: true, evidence: [`Comorbilidad relevante: ${hits.join(', ')}`], missing: [] }
        : none();
    }

    case 'adherence': {
      if (!ctx.adherence) return { matched: false, evidence: [], missing: ['adherencia'] };
      if (ctx.adherence.missedDoses < condition.missedDosesAtLeast) return none();
      return {
        matched: true,
        evidence: [`${ctx.adherence.missedDoses} dosis omitidas de ${ctx.adherence.totalDoses} programadas`],
        missing: [],
      };
    }

    case 'followUpDay': {
      if (ctx.followUpDay === undefined) return { matched: false, evidence: [], missing: ['diaSeguimiento'] };
      if (!compare(condition.op, ctx.followUpDay, condition.value)) return none();
      return { matched: true, evidence: [`Dia de seguimiento ${ctx.followUpDay}`], missing: [] };
    }

    case 'all': {
      const results = condition.of.map((c) => evaluateCondition(c, ctx));
      const matched = results.every((r) => r.matched);
      return {
        matched,
        evidence: matched ? results.flatMap((r) => r.evidence) : [],
        missing: results.flatMap((r) => r.missing),
      };
    }

    case 'any': {
      const results = condition.of.map((c) => evaluateCondition(c, ctx));
      const firstMatch = results.find((r) => r.matched);
      return {
        matched: Boolean(firstMatch),
        evidence: firstMatch ? firstMatch.evidence : [],
        missing: firstMatch ? [] : results.flatMap((r) => r.missing),
      };
    }

    case 'not': {
      const inner = evaluateCondition(condition.of, ctx);
      return { matched: !inner.matched, evidence: inner.matched ? [] : ['Condicion negada no se cumple'], missing: [] };
    }

    default:
      return none();
  }
}

/** Representacion legible de una condicion, para la vista de auditoria del dashboard. */
export function describeCondition(condition: Condition): string {
  switch (condition.type) {
    case 'symptom': {
      const parts = [`${condition.present === false ? 'sin ' : ''}${condition.code}`];
      if (condition.severityAtLeast) parts.push(`severidad >= ${condition.severityAtLeast}`);
      if (condition.trend) parts.push(`evolucion = ${condition.trend}`);
      if (condition.onsetDaysAtLeast !== undefined) parts.push(`duracion >= ${condition.onsetDaysAtLeast}d`);
      return parts.join(' y ');
    }
    case 'symptomCount':
      return `al menos ${condition.atLeast} de [${condition.codes.join(', ')}]`;
    case 'vital':
      return `${condition.metric} ${OP_LABEL[condition.op]} ${condition.value}`;
    case 'vitalMissing':
      return `${condition.metric} no reportado`;
    case 'age':
      return `edad ${OP_LABEL[condition.op]} ${condition.value}`;
    case 'pregnant':
      return 'embarazo';
    case 'comorbidity':
      return `comorbilidad en [${condition.anyOf.join(', ')}]`;
    case 'adherence':
      return `dosis omitidas >= ${condition.missedDosesAtLeast}`;
    case 'followUpDay':
      return `dia de seguimiento ${OP_LABEL[condition.op]} ${condition.value}`;
    case 'all':
      return `(${condition.of.map(describeCondition).join(' Y ')})`;
    case 'any':
      return `(${condition.of.map(describeCondition).join(' O ')})`;
    case 'not':
      return `NO ${describeCondition(condition.of)}`;
    default:
      return 'condicion desconocida';
  }
}

export type { Vitals, Trend };
