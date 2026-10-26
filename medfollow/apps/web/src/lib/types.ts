export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface Overview {
  patients: { active: number; green: number; yellow: number; red: number };
  alerts: { open: number; red: number; yellow: number; resolved7d: number; avgTimeToAckMinutes: number | null };
  followUps: { active: number; completed: number; checkInsSent: number; checkInsAnswered: number; contactRate: number };
  adherence: { reports: number; fullAdherence: number; adherenceRate: number };
  channel: { messagesIn7d: number; messagesOut7d: number; aiGenerated: number; deterministic: number };
}

export interface TriggeredRule {
  ruleId: string;
  ruleVersion: string;
  level: RiskLevel;
  score: number;
  title: string;
  rationale: string;
  action: string;
  escalation: string;
  evidence: string[];
}

export interface AlertListItem {
  id: string;
  level: RiskLevel;
  priority: number;
  status: string;
  title: string;
  summary: string;
  escalation: string;
  triggeredRuleIds: string[];
  createdAt: string;
  acknowledgedAt: string | null;
  timeToAckMinutes: number | null;
  patient: { id: string; fullName: string; currentRiskLevel: RiskLevel; currentRiskScore: number; birthDate: string | null };
  assignedTo?: { id: string; fullName: string } | null;
  plan?: { id: string; diagnosisText: string; protocolCode: string } | null;
}

export interface PatientListItem {
  id: string;
  fullName: string;
  phoneMasked: string;
  ageYears: number;
  sex: string | null;
  comorbidities: string[];
  currentRiskLevel: RiskLevel;
  currentRiskScore: number;
  lastContactAt: string | null;
}

export interface RiskScoreRecord {
  id: string;
  level: RiskLevel;
  score: number;
  engineVersion: string;
  protocolCode: string | null;
  protocolVersion: string | null;
  escalation: string;
  triggeredRules: TriggeredRule[];
  missingData: string[];
  evaluatedAt: string;
}

export interface PatientDetail extends PatientListItem {
  phone?: string;
  pregnant: boolean;
  birthDate: string | null;
  plans: Array<{
    id: string;
    diagnosisText: string;
    diagnosisCode: string | null;
    protocolCode: string;
    protocolVersion: string;
    instructions: string | null;
    plainLanguageExplanation: string | null;
    status: string;
    checkInDays: number[];
    consultationAt: string;
    medications: Array<{ id: string; name: string; dose: string; frequencyHours: number; durationDays: number }>;
    checkIns: Array<{ id: string; dayOffset: number; scheduledAt: string; status: string; answeredAt: string | null }>;
    doctor?: { id: string; fullName: string } | null;
  }>;
  riskScores: RiskScoreRecord[];
  alerts: Array<{ id: string; level: RiskLevel; title: string; status: string; createdAt: string }>;
  symptoms: Array<{ id: string; code: string; label: string; present: boolean; severity: string | null; trend: string | null; reportedAt: string; source: string }>;
  vitals: Array<{ id: string; metric: string; value: number; unit: string; reportedAt: string }>;
  consents: Array<{ id: string; status: string; grantedAt: string | null; textVersion: string }>;
}

export interface MessageItem {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  author: 'PATIENT' | 'AI' | 'NURSE' | 'DOCTOR' | 'SYSTEM';
  body: string;
  aiModel: string | null;
  aiLatencyMs: number | null;
  deterministic: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface ConversationDetail {
  id: string;
  channel: string;
  status: string;
  startedAt: string;
  lastMessageAt: string;
  patient: { id: string; fullName: string; currentRiskLevel: RiskLevel };
  messages: MessageItem[];
}
