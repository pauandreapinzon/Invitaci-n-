import { DeterministicAiProvider } from './deterministic.provider';
import { ComposeReplyRequest, ExtractionRequest } from '../ai.types';

const patient = {
  firstName: 'Juan',
  ageYears: 42,
  sex: 'M',
  pregnant: false,
  comorbidities: [],
  language: 'es',
};

const protocol = {
  code: 'GEN-RESP-001',
  name: 'Infeccion respiratoria alta',
  plainLanguageSummary: 'Inflamacion de las vias respiratorias altas, generalmente viral.',
  redFlagsForPatient: ['Dificultad para respirar'],
};

function extractionRequest(text: string): ExtractionRequest {
  return { text, patient, protocol, recentMessages: [], totalDoses: 3 };
}

function composeRequest(overrides: Partial<ComposeReplyRequest> = {}): ComposeReplyRequest {
  return {
    patient,
    protocol,
    riskLevel: 'GREEN',
    patientMessage: 'Me siento bien',
    recentMessages: [],
    ...overrides,
  };
}

describe('proveedor determinista de IA', () => {
  const provider = new DeterministicAiProvider();

  it('clasifica la intencion del mensaje del paciente', async () => {
    expect(provider.detectIntent('ACEPTO')).toBe('CONSENT');
    expect(provider.detectIntent('Quiero hablar con una persona')).toBe('HUMAN_REQUEST');
    expect(provider.detectIntent('Tengo fiebre y tos')).toBe('SYMPTOM_REPORT');
    expect(provider.detectIntent('Puedo bañarme?')).toBe('QUESTION');
  });

  it('extrae senales clinicas sin depender de servicios externos', async () => {
    const result = await provider.extractSignals(extractionRequest('Tengo 39 grados y me cuesta respirar'));
    expect(result.deterministic).toBe(true);
    expect(result.vitals.temperatureC).toBe(39);
    expect(result.symptoms.map((s) => s.code)).toEqual(expect.arrayContaining(['FEVER', 'DYSPNEA']));
    expect(result.summary).toContain('Dificultad para respirar');
  });

  it('incluye textualmente la indicacion obligatoria en la respuesta', async () => {
    const guidance = 'Acude al servicio de urgencias mas cercano ahora.';
    const reply = await provider.composeReply(composeRequest({ riskLevel: 'RED', mandatoryGuidance: guidance }));
    expect(reply.text).toContain(guidance);
    expect(reply.deterministic).toBe(true);
  });

  it('cierra el mensaje con la siguiente pregunta del protocolo', async () => {
    const reply = await provider.composeReply(composeRequest({ nextQuestion: 'Te has tomado la temperatura?' }));
    expect(reply.text.trim().endsWith('Te has tomado la temperatura?')).toBe(true);
  });

  it('explica el diagnostico sin alterar el esquema formulado', async () => {
    const explanation = await provider.explainDiagnosis({
      diagnosisText: 'Faringitis viral',
      protocol,
      instructions: 'Reposo e hidratacion',
      medications: [{ name: 'Acetaminofen', dose: '500 mg', frequencyHours: 8, durationDays: 5 }],
      patient,
    });
    expect(explanation.text).toContain('Faringitis viral');
    expect(explanation.text).toContain('Acetaminofen 500 mg');
    expect(explanation.text).toContain('Dificultad para respirar');
  });
});
