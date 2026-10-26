import { extractSignalsHeuristic, extractVitals, detectTrend, extractAdherence } from '../extraction';

describe('extraccion heuristica de senales clinicas', () => {
  it('detecta fiebre reportada en lenguaje coloquial', () => {
    const signals = extractSignalsHeuristic('Hoy tengo fiebre y me duele la cabeza');
    const codes = signals.symptoms.filter((s) => s.present).map((s) => s.code);
    expect(codes).toContain('FEVER');
    expect(codes).toContain('HEADACHE');
  });

  it('detecta disnea a partir de la expresion "me siento ahogado" (caso de uso 2 del PRD)', () => {
    const signals = extractSignalsHeuristic('Doctor, me siento ahogado desde anoche');
    const dyspnea = signals.symptoms.find((s) => s.code === 'DYSPNEA');
    expect(dyspnea?.present).toBe(true);
    expect(dyspnea?.onsetDays).toBe(1);
  });

  it('respeta la negacion explicita', () => {
    const signals = extractSignalsHeuristic('No tengo fiebre, solo un poco de tos');
    expect(signals.symptoms.find((s) => s.code === 'FEVER')?.present).toBe(false);
    expect(signals.symptoms.find((s) => s.code === 'COUGH')?.present).toBe(true);
  });

  it('extrae temperatura y la convierte en fiebre confirmada', () => {
    const signals = extractSignalsHeuristic('Me tome la temperatura y tengo 39 grados');
    expect(signals.vitals.temperatureC).toBe(39);
    expect(signals.symptoms.find((s) => s.code === 'FEVER')?.present).toBe(true);
  });

  it('ignora numeros fuera de rango fisiologico', () => {
    expect(extractVitals('tengo 88 grados').temperatureC).toBeUndefined();
    expect(extractVitals('saturacion 97').spo2).toBe(97);
  });

  it('lee presion arterial y glucometria', () => {
    const vitals = extractVitals('la presion me dio 85/55 y la glucometria 260');
    expect(vitals.systolicBp).toBe(85);
    expect(vitals.diastolicBp).toBe(55);
    expect(vitals.glucoseMgDl).toBe(260);
  });

  it('clasifica la evolucion reportada', () => {
    expect(detectTrend('me siento peor que ayer')).toBe('WORSENING');
    expect(detectTrend('estoy mucho mejor')).toBe('IMPROVING');
    expect(detectTrend('sigo igual')).toBe('STABLE');
  });

  it('registra incumplimiento de dosis (caso de uso 3 del PRD)', () => {
    expect(extractAdherence('Olvide una dosis anoche')?.missedDoses).toBe(1);
    expect(extractAdherence('Si, las he tomado todas')?.missedDoses).toBe(0);
    expect(extractAdherence('No he podido tomar el antibiotico')?.missedDoses).toBe(3);
  });

  it('entiende cantidades escritas en palabras', () => {
    expect(extractAdherence('Olvide dos dosis del antibiotico')?.missedDoses).toBe(2);
    expect(extractAdherence('Olvide una dosis ayer y otra hoy')?.missedDoses).toBe(2);
  });

  it('reconoce manchas rojas como posible bandera roja cutanea', () => {
    const signals = extractSignalsHeuristic('Me salieron unas manchas rojas en la piel y sigo con fiebre');
    expect(signals.symptoms.find((s) => s.code === 'PETECHIAE')?.present).toBe(true);
    expect(signals.symptoms.find((s) => s.code === 'FEVER')?.present).toBe(true);
  });

  it('reconoce la forma verbal con la que los pacientes describen el dolor', () => {
    const chest = extractSignalsHeuristic('Me duele el pecho desde anoche');
    expect(chest.symptoms.find((s) => s.code === 'CHEST_PAIN')?.present).toBe(true);

    const flank = extractSignalsHeuristic('Me duele mucho la cintura del lado derecho y tengo fiebre');
    expect(flank.symptoms.find((s) => s.code === 'FLANK_PAIN')?.present).toBe(true);
    expect(flank.symptoms.find((s) => s.code === 'FLANK_PAIN')?.severity).toBe('SEVERE');
  });

  it('detecta severidad en la ventana de contexto', () => {
    const signals = extractSignalsHeuristic('tengo un dolor de garganta insoportable');
    expect(signals.symptoms.find((s) => s.code === 'SORE_THROAT')?.severity).toBe('SEVERE');
  });
});
