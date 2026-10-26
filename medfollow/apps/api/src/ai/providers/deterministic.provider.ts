import { Injectable } from '@nestjs/common';
import { extractSignalsHeuristic, normalizeText, SYMPTOM_BY_CODE } from '@medfollow/clinical-engine';
import {
  AiProvider,
  ComposeReplyRequest,
  ExplainDiagnosisRequest,
  ExtractionRequest,
  ExtractionResult,
  GeneratedText,
  PatientIntent,
} from '../ai.types';

const CONSENT_WORDS = ['acepto', 'autorizo', 'de acuerdo', 'si acepto'];
const HUMAN_WORDS = ['hablar con alguien', 'hablar con una persona', 'quiero una enfermera', 'necesito un medico', 'llamenme', 'llamarme'];

/**
 * Proveedor determinista basado en reglas y plantillas.
 *
 * Es el proveedor por defecto y tambien el plan de contingencia de los
 * proveedores LLM: permite operar el seguimiento completo sin credenciales
 * externas y garantiza que una falla del modelo nunca deje al paciente sin
 * respuesta ni oculte una bandera roja.
 */
@Injectable()
export class DeterministicAiProvider implements AiProvider {
  readonly name = 'deterministic-rules-v1';
  readonly available = true;

  detectIntent(text: string): PatientIntent {
    const normalized = normalizeText(text);
    if (CONSENT_WORDS.some((w) => normalized.includes(w))) return 'CONSENT';
    if (HUMAN_WORDS.some((w) => normalized.includes(w))) return 'HUMAN_REQUEST';
    if (normalized.includes('?')) return 'QUESTION';
    const signals = extractSignalsHeuristic(text);
    if (signals.symptoms.length > 0 || Object.keys(signals.vitals).length > 0) return 'SYMPTOM_REPORT';
    if (signals.adherence) return 'SYMPTOM_REPORT';
    return 'SMALL_TALK';
  }

  async extractSignals(request: ExtractionRequest): Promise<ExtractionResult> {
    const startedAt = Date.now();
    const signals = extractSignalsHeuristic(request.text, { totalDoses: request.totalDoses });
    const presentLabels = signals.symptoms
      .filter((s) => s.present)
      .map((s) => SYMPTOM_BY_CODE[s.code]?.label ?? s.code);

    return {
      symptoms: signals.symptoms,
      vitals: signals.vitals,
      adherence: signals.adherence,
      intent: this.detectIntent(request.text),
      summary: presentLabels.length
        ? `Reporta: ${presentLabels.join(', ')}.`
        : 'Mensaje sin sintomas identificables en el catalogo.',
      model: this.name,
      latencyMs: Date.now() - startedAt,
      deterministic: true,
    };
  }

  async explainDiagnosis(request: ExplainDiagnosisRequest): Promise<GeneratedText> {
    const startedAt = Date.now();
    const medications = request.medications.length
      ? request.medications
          .map((m) => `- ${m.name} ${m.dose}, cada ${m.frequencyHours} horas, durante ${m.durationDays} dias`)
          .join('\n')
      : '- Sin medicamentos formulados';

    const text = [
      `Hola ${request.patient.firstName}, soy el asistente de seguimiento del hospital.`,
      '',
      `Tu diagnostico fue: ${request.diagnosisText}.`,
      request.protocol.plainLanguageSummary,
      '',
      'Tratamiento indicado por tu medico:',
      medications,
      request.instructions ? `\nIndicaciones adicionales: ${request.instructions}` : '',
      '',
      'Busca atencion inmediata si presentas:',
      ...request.protocol.redFlagsForPatient.map((flag) => `- ${flag}`),
      '',
      'Te escribire en los proximos dias para saber como vas.',
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    return { text, model: this.name, latencyMs: Date.now() - startedAt, deterministic: true };
  }

  async composeReply(request: ComposeReplyRequest): Promise<GeneratedText> {
    const startedAt = Date.now();
    const parts: string[] = [];

    if (request.riskLevel === 'RED') {
      parts.push(`${request.patient.firstName}, por lo que me cuentas necesitas valoracion presencial.`);
    } else if (request.riskLevel === 'YELLOW') {
      parts.push(`Gracias por responder, ${request.patient.firstName}. Voy a reportar esto al equipo de salud.`);
    } else {
      parts.push(`Gracias por responder, ${request.patient.firstName}.`);
    }

    if (request.mandatoryGuidance) parts.push(request.mandatoryGuidance);
    if (request.nextQuestion) parts.push(request.nextQuestion);

    return {
      text: parts.join(' '),
      model: this.name,
      latencyMs: Date.now() - startedAt,
      deterministic: true,
    };
  }
}
