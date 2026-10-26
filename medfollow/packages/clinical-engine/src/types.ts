/**
 * Tipos del motor clinico determinista.
 *
 * Capa 1 (IA) extrae senales clinicas del lenguaje natural del paciente.
 * Capa 2 (este motor) decide el nivel de riesgo con reglas deterministas,
 * versionadas y auditables. La IA nunca decide el nivel de alerta.
 */

export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export type Severity = 'MILD' | 'MODERATE' | 'SEVERE';

export type Trend = 'IMPROVING' | 'STABLE' | 'WORSENING';

export const RISK_ORDER: Record<RiskLevel, number> = {
  GREEN: 0,
  YELLOW: 1,
  RED: 2,
};

/** Sintoma normalizado a un codigo del catalogo (ver symptom-catalog.ts). */
export interface SymptomObservation {
  code: string;
  present: boolean;
  severity?: Severity;
  trend?: Trend;
  onsetDays?: number;
  /** Texto original del paciente, solo para trazabilidad clinica. */
  quote?: string;
}

export interface Vitals {
  temperatureC?: number;
  heartRate?: number;
  respiratoryRate?: number;
  spo2?: number;
  systolicBp?: number;
  diastolicBp?: number;
  glucoseMgDl?: number;
}

export interface AdherenceSnapshot {
  missedDoses: number;
  totalDoses: number;
}

export interface PatientSnapshot {
  ageYears: number;
  pregnant?: boolean;
  /** Codigos de comorbilidad: DIABETES, COPD, HTA, CKD, IMMUNOSUPPRESSION, CANCER, HEART_FAILURE... */
  comorbidities?: string[];
}

export interface EvaluationContext {
  patient: PatientSnapshot;
  /** Codigos de diagnostico del protocolo asignado (p.ej. GEN-RESP-001 o CIE-10 J02.9). */
  diagnosisCodes?: string[];
  symptoms: SymptomObservation[];
  vitals?: Vitals;
  adherence?: AdherenceSnapshot;
  /** Dia de seguimiento (1 = dia siguiente a la consulta). */
  followUpDay?: number;
}

export type VitalMetric = keyof Vitals;

export type ComparisonOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

/**
 * Condiciones serializables en JSON. Al ser datos (y no codigo) se pueden
 * versionar, revisar por un comite medico y auditar fuera del sistema.
 */
export type Condition =
  | { type: 'symptom'; code: string; present?: boolean; severityAtLeast?: Severity; trend?: Trend; onsetDaysAtLeast?: number }
  | { type: 'symptomCount'; codes: string[]; atLeast: number }
  | { type: 'vital'; metric: VitalMetric; op: ComparisonOp; value: number }
  | { type: 'vitalMissing'; metric: VitalMetric }
  | { type: 'age'; op: ComparisonOp; value: number }
  | { type: 'pregnant' }
  | { type: 'comorbidity'; anyOf: string[] }
  | { type: 'adherence'; missedDosesAtLeast: number }
  | { type: 'followUpDay'; op: ComparisonOp; value: number }
  | { type: 'all'; of: Condition[] }
  | { type: 'any'; of: Condition[] }
  | { type: 'not'; of: Condition };

export type EscalationChannel = 'NONE' | 'NURSE_QUEUE' | 'DOCTOR_REVIEW' | 'IMMEDIATE_CALL' | 'EMERGENCY_REFERRAL';

export interface ClinicalRule {
  id: string;
  version: string;
  level: RiskLevel;
  /** Puntos que aporta al risk score (0-100) cuando se dispara. */
  score: number;
  title: string;
  /** Justificacion clinica legible para el equipo de salud. */
  rationale: string;
  /** Accion operativa esperada. */
  action: string;
  escalation: EscalationChannel;
  /** Mensaje seguro para el paciente (no es diagnostico ni prescripcion). */
  patientGuidance?: string;
  /** Codigos de diagnostico/protocolo a los que aplica. Vacio = global. */
  appliesTo?: string[];
  when: Condition;
  references?: string[];
}

export interface FollowUpQuestion {
  id: string;
  /** Pregunta en lenguaje natural que la IA puede reformular, no reinterpretar. */
  text: string;
  /** Senal clinica que esta pregunta busca completar. */
  expects: { kind: 'symptom'; code: string } | { kind: 'vital'; metric: VitalMetric } | { kind: 'adherence' } | { kind: 'freeText' };
  /** Solo se pregunta si la condicion se cumple (p.ej. temperatura solo si hay fiebre). */
  askIf?: Condition;
}

export interface Protocol {
  code: string;
  name: string;
  version: string;
  specialty: string;
  /** Diagnosticos (texto o CIE-10) que mapean a este protocolo. */
  diagnosisCodes: string[];
  diagnosisKeywords: string[];
  /** Explicacion en lenguaje sencillo, base factual para la IA (evita alucinaciones). */
  plainLanguageSummary: string;
  /** Dias de seguimiento tras la consulta. */
  checkInDays: number[];
  questions: FollowUpQuestion[];
  rules: ClinicalRule[];
  /** Senales de alarma que el paciente debe conocer desde el dia 1. */
  redFlagsForPatient: string[];
}

export interface TriggeredRule {
  ruleId: string;
  ruleVersion: string;
  level: RiskLevel;
  score: number;
  title: string;
  rationale: string;
  action: string;
  escalation: EscalationChannel;
  patientGuidance?: string;
  /** Hechos concretos que hicieron verdadera la condicion (auditoria). */
  evidence: string[];
}

export interface RiskEvaluation {
  level: RiskLevel;
  score: number;
  engineVersion: string;
  protocolCode?: string;
  protocolVersion?: string;
  evaluatedAt: string;
  triggered: TriggeredRule[];
  evaluatedRuleIds: string[];
  escalation: EscalationChannel;
  /** Accion recomendada derivada de la regla de mayor severidad. */
  recommendedAction: string;
  /** Datos faltantes que impiden una clasificacion completa. */
  missingData: string[];
  /** Preguntas sugeridas para completar la evaluacion. */
  nextQuestions: FollowUpQuestion[];
}
