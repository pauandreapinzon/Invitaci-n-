import { AdherenceSnapshot, Protocol, RiskLevel, SymptomObservation, Vitals } from '@medfollow/clinical-engine';

export interface PatientBrief {
  firstName: string;
  ageYears: number;
  sex?: string | null;
  pregnant?: boolean;
  comorbidities: string[];
  language: string;
}

export interface ProtocolBrief {
  code: string;
  name: string;
  plainLanguageSummary: string;
  redFlagsForPatient: string[];
}

export type PatientIntent = 'SYMPTOM_REPORT' | 'QUESTION' | 'CONSENT' | 'HUMAN_REQUEST' | 'SMALL_TALK' | 'OTHER';

export interface ExtractionRequest {
  text: string;
  patient: PatientBrief;
  protocol: ProtocolBrief;
  /** Ultimos mensajes de la conversacion, del mas antiguo al mas reciente. */
  recentMessages: Array<{ author: string; text: string }>;
  totalDoses: number;
}

export interface ExtractionResult {
  symptoms: SymptomObservation[];
  vitals: Vitals;
  adherence?: AdherenceSnapshot;
  intent: PatientIntent;
  /** Resumen clinico de una linea para la bitacora. */
  summary: string;
  model: string;
  latencyMs: number;
  /** true si la extraccion la produjo el motor heuristico y no un LLM. */
  deterministic: boolean;
}

export interface ExplainDiagnosisRequest {
  diagnosisText: string;
  protocol: ProtocolBrief;
  instructions?: string | null;
  medications: Array<{ name: string; dose: string; frequencyHours: number; durationDays: number }>;
  patient: PatientBrief;
}

export interface ComposeReplyRequest {
  patient: PatientBrief;
  protocol: ProtocolBrief;
  riskLevel: RiskLevel;
  /** Mensaje obligatorio derivado del motor de reglas. Nunca se reescribe. */
  mandatoryGuidance?: string;
  /** Siguiente pregunta del protocolo que falta por responder. */
  nextQuestion?: string;
  patientMessage: string;
  recentMessages: Array<{ author: string; text: string }>;
}

export interface GeneratedText {
  text: string;
  model: string;
  latencyMs: number;
  deterministic: boolean;
}

/** Contrato que cumplen el proveedor determinista, Claude y Azure OpenAI. */
export interface AiProvider {
  readonly name: string;
  readonly available: boolean;
  extractSignals(request: ExtractionRequest): Promise<ExtractionResult>;
  explainDiagnosis(request: ExplainDiagnosisRequest): Promise<GeneratedText>;
  composeReply(request: ComposeReplyRequest): Promise<GeneratedText>;
}

export type { Protocol };
