import { evaluateRisk, explainEvaluation } from '../engine';
import { EvaluationContext } from '../types';
import { getProtocolByCode, resolveProtocol } from '../protocols/catalog';

const basePatient = { ageYears: 34, comorbidities: [] as string[] };

function ctx(partial: Partial<EvaluationContext>): EvaluationContext {
  return { patient: basePatient, symptoms: [], ...partial };
}

describe('motor clinico determinista', () => {
  it('clasifica como RED la triada del caso de uso 4 del PRD', () => {
    const result = evaluateRisk(
      ctx({
        symptoms: [
          { code: 'DYSPNEA', present: true, trend: 'WORSENING' },
          { code: 'FEVER', present: true, trend: 'WORSENING' },
        ],
        vitals: { temperatureC: 39.4 },
        followUpDay: 2,
      }),
      { protocol: getProtocolByCode('GEN-RESP-001') },
    );

    expect(result.level).toBe('RED');
    expect(result.triggered.map((t) => t.ruleId)).toEqual(expect.arrayContaining(['GLOBAL-RED-001', 'GLOBAL-RED-007']));
    expect(result.escalation).toBe('EMERGENCY_REFERRAL');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('escala a RED ante dificultad respiratoria aislada', () => {
    const result = evaluateRisk(ctx({ symptoms: [{ code: 'DYSPNEA', present: true }] }));
    expect(result.level).toBe('RED');
    expect(result.recommendedAction).toContain('inmediato');
  });

  it('mantiene GREEN cuando el paciente reporta mejoria', () => {
    const result = evaluateRisk(
      ctx({
        symptoms: [{ code: 'NO_SYMPTOMS', present: true }],
        adherence: { missedDoses: 0, totalDoses: 6 },
        followUpDay: 3,
      }),
    );
    expect(result.level).toBe('GREEN');
    expect(result.escalation).toBe('NONE');
    expect(result.score).toBe(0);
  });

  it('marca YELLOW por baja adherencia sin banderas rojas', () => {
    const result = evaluateRisk(
      ctx({ symptoms: [{ code: 'SORE_THROAT', present: true, trend: 'STABLE' }], adherence: { missedDoses: 2, totalDoses: 6 } }),
    );
    expect(result.level).toBe('YELLOW');
    expect(result.triggered.map((t) => t.ruleId)).toContain('GLOBAL-YELLOW-004');
    expect(result.escalation).toBe('NURSE_QUEUE');
  });

  it('detecta sospecha de pielonefritis con el protocolo de IVU', () => {
    const result = evaluateRisk(
      ctx({ symptoms: [{ code: 'FLANK_PAIN', present: true }, { code: 'DYSURIA', present: true }], vitals: { temperatureC: 38.8 }, followUpDay: 2 }),
      { protocol: getProtocolByCode('GEN-UTI-001') },
    );
    expect(result.level).toBe('RED');
    expect(result.triggered.map((t) => t.ruleId)).toContain('UTI-RED-001');
  });

  it('no aplica reglas de otros protocolos', () => {
    const result = evaluateRisk(
      ctx({ symptoms: [{ code: 'FLANK_PAIN', present: true }], vitals: { temperatureC: 38.8 } }),
      { protocol: getProtocolByCode('GEN-RESP-001') },
    );
    expect(result.triggered.map((t) => t.ruleId)).not.toContain('UTI-RED-001');
  });

  it('prioriza poblacion de riesgo con fiebre', () => {
    const result = evaluateRisk(
      ctx({ patient: { ageYears: 71, comorbidities: ['DIABETES'] }, symptoms: [{ code: 'FEVER', present: true, trend: 'STABLE' }], vitals: { temperatureC: 38.2 } }),
    );
    expect(result.level).toBe('YELLOW');
    expect(result.triggered.map((t) => t.ruleId)).toContain('GLOBAL-YELLOW-006');
  });

  it('escala a RED ante hipoglucemia y a YELLOW ante hiperglucemia en diabetico', () => {
    const hypo = evaluateRisk(ctx({ symptoms: [], vitals: { glucoseMgDl: 48 } }));
    expect(hypo.level).toBe('RED');
    expect(hypo.triggered.map((t) => t.ruleId)).toContain('GLOBAL-RED-011');

    const hyper = evaluateRisk(
      ctx({ patient: { ageYears: 57, comorbidities: ['DIABETES'] }, symptoms: [], vitals: { glucoseMgDl: 260 } }),
    );
    expect(hyper.level).toBe('YELLOW');
    expect(hyper.triggered.map((t) => t.ruleId)).toContain('GLOBAL-YELLOW-007');

    const nonDiabetic = evaluateRisk(ctx({ symptoms: [], vitals: { glucoseMgDl: 260 } }));
    expect(nonDiabetic.triggered.map((t) => t.ruleId)).not.toContain('GLOBAL-YELLOW-007');
  });

  it('detecta sospecha de infeccion del sistema nervioso central', () => {
    const result = evaluateRisk(
      ctx({ symptoms: [{ code: 'FEVER', present: true }, { code: 'PETECHIAE', present: true }], vitals: { temperatureC: 38.4 } }),
    );
    expect(result.level).toBe('RED');
    expect(result.triggered.map((t) => t.ruleId)).toContain('GLOBAL-RED-010');
  });

  it('es determinista: la misma entrada produce la misma salida', () => {
    const input = ctx({ symptoms: [{ code: 'FEVER', present: true, trend: 'WORSENING' }], vitals: { temperatureC: 38.6 }, followUpDay: 2 });
    const now = new Date('2026-01-01T00:00:00.000Z');
    const a = evaluateRisk(input, { now });
    const b = evaluateRisk(input, { now });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('expone la evidencia de cada regla disparada para auditoria', () => {
    const result = evaluateRisk(ctx({ symptoms: [{ code: 'CHEST_PAIN', present: true }] }));
    const rule = result.triggered.find((t) => t.ruleId === 'GLOBAL-RED-002');
    expect(rule?.evidence.join(' ')).toContain('CHEST_PAIN');
    expect(explainEvaluation(result)).toContain('GLOBAL-RED-002');
    expect(result.evaluatedRuleIds.length).toBeGreaterThan(result.triggered.length);
  });

  it('reporta datos faltantes y la siguiente pregunta a realizar', () => {
    const result = evaluateRisk(ctx({ symptoms: [{ code: 'FEVER', present: true }] }), {
      protocol: getProtocolByCode('GEN-FEBRIL-001'),
    });
    expect(result.missingData).toContain('signo:temperatureC');
    expect(result.missingData).toContain('adherencia');
    expect(result.nextQuestions.map((q) => q.id)).toContain('Q_TEMPERATURE');
  });

  it('mapea el diagnostico escrito por el medico al protocolo correcto', () => {
    expect(resolveProtocol('Faringitis viral').code).toBe('GEN-RESP-001');
    expect(resolveProtocol('J02.9').code).toBe('GEN-RESP-001');
    expect(resolveProtocol('Infección urinaria baja').code).toBe('GEN-UTI-001');
    expect(resolveProtocol('Enfermedad diarreica aguda').code).toBe('GEN-GI-001');
    expect(resolveProtocol('Algo no catalogado').code).toBe('GEN-DEFAULT-001');
  });
});
