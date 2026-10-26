import { evaluateCondition } from './conditions';
import { DEFAULT_PROTOCOL, GLOBAL_RULES, resolveProtocol } from './protocols/catalog';
import { SYMPTOM_BY_CODE } from './symptom-catalog';
import {
  ClinicalRule,
  EscalationChannel,
  EvaluationContext,
  FollowUpQuestion,
  Protocol,
  RISK_ORDER,
  RiskEvaluation,
  RiskLevel,
  TriggeredRule,
} from './types';

export const ENGINE_VERSION = '1.0.0';

const ESCALATION_ORDER: Record<EscalationChannel, number> = {
  NONE: 0,
  NURSE_QUEUE: 1,
  DOCTOR_REVIEW: 2,
  IMMEDIATE_CALL: 3,
  EMERGENCY_REFERRAL: 4,
};

export interface EvaluateOptions {
  protocol?: Protocol;
  /** Reglas adicionales configuradas por la institucion (cargadas desde base de datos). */
  extraRules?: ClinicalRule[];
  /** Permite inyectar el reloj en pruebas: el motor es determinista. */
  now?: Date;
}

function appliesToProtocol(rule: ClinicalRule, protocolCode: string): boolean {
  if (!rule.appliesTo || rule.appliesTo.length === 0) return true;
  return rule.appliesTo.includes(protocolCode);
}

function pickPrimary(triggered: TriggeredRule[]): TriggeredRule | undefined {
  return [...triggered].sort((a, b) => {
    const byLevel = RISK_ORDER[b.level] - RISK_ORDER[a.level];
    if (byLevel !== 0) return byLevel;
    return b.score - a.score;
  })[0];
}

/** Datos ausentes que limitan la clasificacion de riesgo. */
export function computeMissingData(ctx: EvaluationContext): string[] {
  const missing: string[] = [];
  for (const symptom of ctx.symptoms) {
    if (!symptom.present) continue;
    const definition = SYMPTOM_BY_CODE[symptom.code];
    if (definition?.requiresVital && ctx.vitals?.[definition.requiresVital] === undefined) {
      missing.push(`signo:${definition.requiresVital}`);
    }
    if (!symptom.trend) missing.push(`evolucion:${symptom.code}`);
  }
  if (!ctx.adherence) missing.push('adherencia');
  return Array.from(new Set(missing));
}

/** Preguntas pendientes del protocolo, dado lo que ya se conoce del paciente. */
export function computeNextQuestions(protocol: Protocol, ctx: EvaluationContext): FollowUpQuestion[] {
  return protocol.questions.filter((question) => {
    if (question.askIf) return evaluateCondition(question.askIf, ctx).matched;
    switch (question.expects.kind) {
      case 'vital':
        return ctx.vitals?.[question.expects.metric] === undefined;
      case 'adherence':
        return ctx.adherence === undefined;
      case 'symptom':
        return !ctx.symptoms.some((s) => s.code === (question.expects as { code: string }).code);
      default:
        return ctx.symptoms.length === 0;
    }
  });
}

/**
 * Capa 2: clasificacion de riesgo determinista.
 *
 * No usa modelos de lenguaje, azar ni servicios externos. La salida incluye
 * cada regla evaluada y la evidencia que la disparo, de modo que el equipo
 * medico (y un auditor) pueda reconstruir la decision exactamente.
 */
export function evaluateRisk(ctx: EvaluationContext, options: EvaluateOptions = {}): RiskEvaluation {
  const protocol =
    options.protocol ??
    (ctx.diagnosisCodes?.length ? resolveProtocol(ctx.diagnosisCodes.join(' ')) : DEFAULT_PROTOCOL);

  const rules = [...GLOBAL_RULES, ...protocol.rules, ...(options.extraRules ?? [])].filter((rule) =>
    appliesToProtocol(rule, protocol.code),
  );

  const triggered: TriggeredRule[] = [];
  for (const rule of rules) {
    const result = evaluateCondition(rule.when, ctx);
    if (!result.matched) continue;
    triggered.push({
      ruleId: rule.id,
      ruleVersion: rule.version,
      level: rule.level,
      score: rule.score,
      title: rule.title,
      rationale: rule.rationale,
      action: rule.action,
      escalation: rule.escalation,
      patientGuidance: rule.patientGuidance,
      evidence: result.evidence,
    });
  }

  const level: RiskLevel = triggered.reduce<RiskLevel>(
    (acc, rule) => (RISK_ORDER[rule.level] > RISK_ORDER[acc] ? rule.level : acc),
    'GREEN',
  );
  const score = Math.min(100, triggered.reduce((sum, rule) => sum + rule.score, 0));
  const escalation = triggered.reduce<EscalationChannel>(
    (acc, rule) => (ESCALATION_ORDER[rule.escalation] > ESCALATION_ORDER[acc] ? rule.escalation : acc),
    'NONE',
  );
  const primary = pickPrimary(triggered);

  return {
    level,
    score,
    engineVersion: ENGINE_VERSION,
    protocolCode: protocol.code,
    protocolVersion: protocol.version,
    evaluatedAt: (options.now ?? new Date()).toISOString(),
    triggered,
    evaluatedRuleIds: rules.map((r) => r.id),
    escalation,
    recommendedAction: primary?.action ?? 'Continuar seguimiento programado.',
    missingData: computeMissingData(ctx),
    nextQuestions: computeNextQuestions(protocol, ctx),
  };
}

/** Resumen legible de la evaluacion para la bitacora clinica y la auditoria. */
export function explainEvaluation(evaluation: RiskEvaluation): string {
  if (evaluation.triggered.length === 0) {
    return `Sin reglas disparadas (motor ${evaluation.engineVersion}, protocolo ${evaluation.protocolCode}). Riesgo ${evaluation.level}.`;
  }
  const lines = evaluation.triggered.map(
    (rule) => `- [${rule.level}] ${rule.ruleId} v${rule.ruleVersion}: ${rule.title}. Evidencia: ${rule.evidence.join('; ')}`,
  );
  return [
    `Riesgo ${evaluation.level} (score ${evaluation.score}) por motor ${evaluation.engineVersion}, protocolo ${evaluation.protocolCode} v${evaluation.protocolVersion}.`,
    ...lines,
    `Accion: ${evaluation.recommendedAction} (escalamiento ${evaluation.escalation}).`,
  ].join('\n');
}

/** Mensaje seguro para el paciente derivado de las reglas, nunca del modelo. */
export function patientSafetyMessage(evaluation: RiskEvaluation): string | undefined {
  return pickPrimary(evaluation.triggered)?.patientGuidance;
}
