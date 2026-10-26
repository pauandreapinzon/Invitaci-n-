export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'medium' });
}

export function relativeTime(value?: string | null): string {
  if (!value) return 'sin contacto';
  const diffMinutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMinutes < 1) return 'ahora';
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

export const ESCALATION_LABELS: Record<string, string> = {
  NONE: 'Sin escalamiento',
  NURSE_QUEUE: 'Cola de enfermeria',
  DOCTOR_REVIEW: 'Revision medica',
  IMMEDIATE_CALL: 'Llamada inmediata',
  EMERGENCY_REFERRAL: 'Remision a urgencias',
};

export const ALERT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Abierta',
  ACKNOWLEDGED: 'Tomada',
  IN_PROGRESS: 'En gestion',
  RESOLVED: 'Resuelta',
  DISMISSED: 'Descartada',
};

export const CHECKIN_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Programado',
  SENT: 'Enviado',
  ANSWERED: 'Respondido',
  MISSED: 'Sin respuesta',
  SKIPPED: 'Omitido',
};

export const AUTHOR_LABELS: Record<string, string> = {
  PATIENT: 'Paciente',
  AI: 'Asistente',
  NURSE: 'Enfermeria',
  DOCTOR: 'Medico',
  SYSTEM: 'Sistema',
};

export const SOURCE_LABELS: Record<string, string> = {
  AI_EXTRACTION: 'IA',
  HEURISTIC: 'Reglas',
  NURSE: 'Enfermeria',
  DOCTOR: 'Medico',
  PATIENT_FORM: 'Formulario',
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'programado',
  ACTIVE: 'activo',
  COMPLETED: 'completado',
  CANCELLED: 'cancelado',
};
