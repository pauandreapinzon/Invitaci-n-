import { extractSignalsHeuristic } from '../extraction';
import { evaluateRisk } from '../engine';
import { resolveProtocol } from '../protocols/catalog';

/**
 * Pruebas de la arquitectura hibrida completa:
 * texto libre del paciente -> senales (capa 1) -> riesgo (capa 2).
 */
describe('pipeline conversacional', () => {
  const patient = { ageYears: 45, comorbidities: [] as string[] };

  it('convierte un mensaje de WhatsApp en una alerta roja trazable', () => {
    const protocol = resolveProtocol('Faringitis viral');
    const signals = extractSignalsHeuristic('Me siento peor, tengo 39.5 grados y me cuesta respirar');
    const result = evaluateRisk(
      { patient, symptoms: signals.symptoms, vitals: signals.vitals, adherence: signals.adherence, followUpDay: 2 },
      { protocol },
    );

    expect(signals.vitals.temperatureC).toBe(39.5);
    expect(result.level).toBe('RED');
    expect(result.triggered.some((t) => t.ruleId === 'GLOBAL-RED-007')).toBe(true);
  });

  it('un mensaje de mejoria no genera escalamiento', () => {
    const protocol = resolveProtocol('Faringitis viral');
    const signals = extractSignalsHeuristic('Estoy mucho mejor, ya casi no me duele la garganta y he tomado todo');
    const result = evaluateRisk(
      { patient, symptoms: signals.symptoms, vitals: signals.vitals, adherence: signals.adherence, followUpDay: 3 },
      { protocol },
    );
    expect(result.level).toBe('GREEN');
    expect(result.escalation).toBe('NONE');
  });

  it('registra el incumplimiento de dosis como riesgo amarillo', () => {
    const protocol = resolveProtocol('Infeccion urinaria');
    const signals = extractSignalsHeuristic('Olvide una dosis ayer pero sigo igual');
    const result = evaluateRisk(
      { patient, symptoms: signals.symptoms, vitals: signals.vitals, adherence: { missedDoses: 2, totalDoses: 6 }, followUpDay: 2 },
      { protocol },
    );
    expect(signals.adherence?.missedDoses).toBe(1);
    expect(result.level).toBe('YELLOW');
  });
});
