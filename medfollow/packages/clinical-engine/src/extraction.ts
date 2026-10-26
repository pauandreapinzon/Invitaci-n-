import { SYMPTOM_CATALOG } from './symptom-catalog';
import { AdherenceSnapshot, Severity, SymptomObservation, Trend, Vitals } from './types';

export interface ExtractedSignals {
  symptoms: SymptomObservation[];
  vitals: Vitals;
  adherence?: AdherenceSnapshot;
  overallTrend?: Trend;
  /** Sinonimos del catalogo que coincidieron (trazabilidad de la extraccion). */
  matches: Array<{ code: string; matchedText: string; negated: boolean }>;
}

const NEGATIONS = ['no ', 'sin ', 'ya no', 'nada de', 'ninguna', 'ningun', 'tampoco', 'niego'];
const SEVERE_WORDS = ['insoportable', 'muy fuerte', 'muy intenso', 'severo', 'severa', 'terrible', 'horrible', 'mucho dolor', 'duele mucho', 'duele muchisimo', 'intenso', 'intensa', 'bastante fuerte'];
const MODERATE_WORDS = ['moderado', 'moderada', 'regular', 'algo de', 'mas o menos'];
const MILD_WORDS = ['leve', 'poquito', 'un poco', 'ligero', 'ligera'];
const WORSENING_WORDS = ['peor', 'empeorado', 'empeorando', 'mas fuerte que ayer', 'ha aumentado', 'mas grave'];
const IMPROVING_WORDS = ['mejor', 'mejorando', 'mejoria', 'ha bajado', 'menos', 'ya casi nada'];
const STABLE_WORDS = ['igual', 'lo mismo', 'sin cambios', 'estable'];

/**
 * Palabras de intensidad que los pacientes intercalan dentro de una expresion
 * ("me duele MUCHO la cintura"). Se retiran solo para localizar el sinonimo;
 * la severidad y la negacion se siguen evaluando sobre el texto original.
 */
const FILLER_WORDS = new Set(['mucho', 'mucha', 'muchisimo', 'bastante', 'demasiado', 'harto', 'algo', 'medio', 'super', 'muy', 'tanto']);

interface StrippedText {
  text: string;
  /** map[i] = posicion en el texto original del caracter i del texto reducido. */
  map: number[];
}

export function stripFillers(normalized: string): StrippedText {
  const parts = normalized.split(/(\s+)/);
  let text = '';
  const map: number[] = [];
  let position = 0;

  for (const part of parts) {
    const isWhitespace = /^\s+$/.test(part);
    if (isWhitespace) {
      if (text.length > 0 && !text.endsWith(' ')) {
        text += ' ';
        map.push(position);
      }
      position += part.length;
      continue;
    }
    if (FILLER_WORDS.has(part)) {
      position += part.length;
      continue;
    }
    for (let i = 0; i < part.length; i += 1) {
      text += part[i];
      map.push(position + i);
    }
    position += part.length;
  }

  return { text: text.trim(), map };
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWord(haystack: string, words: string[]): boolean {
  return words.some((w) => haystack.includes(w));
}

/** Detecta negacion en la ventana de 24 caracteres previos a la coincidencia. */
function isNegated(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - 24), index);
  return NEGATIONS.some((n) => window.includes(n));
}

function detectSeverity(window: string): Severity | undefined {
  if (hasWord(window, SEVERE_WORDS)) return 'SEVERE';
  if (hasWord(window, MODERATE_WORDS)) return 'MODERATE';
  if (hasWord(window, MILD_WORDS)) return 'MILD';
  return undefined;
}

export function detectTrend(text: string): Trend | undefined {
  const normalized = normalizeText(text);
  if (hasWord(normalized, WORSENING_WORDS)) return 'WORSENING';
  if (hasWord(normalized, STABLE_WORDS)) return 'STABLE';
  if (hasWord(normalized, IMPROVING_WORDS)) return 'IMPROVING';
  return undefined;
}

function detectOnsetDays(text: string): number | undefined {
  const normalized = normalizeText(text);
  if (/desde ayer|desde anoche/.test(normalized)) return 1;
  if (/anteayer|hace dos dias|hace 2 dias/.test(normalized)) return 2;
  const weeks = normalized.match(/hace (?:una|1) semana/);
  if (weeks) return 7;
  const match = normalized.match(/(?:hace|desde hace|llevo|van) (\d{1,2}) dias?/);
  if (match) {
    const days = Number(match[1]);
    if (days >= 0 && days <= 60) return days;
  }
  return undefined;
}

export function extractVitals(text: string): Vitals {
  const normalized = normalizeText(text);
  const vitals: Vitals = {};

  const temp = normalized.match(/(\d{2}(?:[.,]\d)?)\s*(?:grados|grado|c\b|celsius|oc)/) ?? normalized.match(/temperatura (?:de |en )?(\d{2}(?:[.,]\d)?)/);
  if (temp) {
    const value = Number(temp[1].replace(',', '.'));
    if (value >= 34 && value <= 43) vitals.temperatureC = value;
  }

  const spo2 = normalized.match(/(?:saturacion|satura|oximetro|spo2)[^\d]{0,12}(\d{2,3})/);
  if (spo2) {
    const value = Number(spo2[1]);
    if (value >= 50 && value <= 100) vitals.spo2 = value;
  }

  const hr = normalized.match(/(?:pulso|frecuencia cardiaca|latidos|fc)[^\d]{0,12}(\d{2,3})/);
  if (hr) {
    const value = Number(hr[1]);
    if (value >= 30 && value <= 220) vitals.heartRate = value;
  }

  const rr = normalized.match(/(?:frecuencia respiratoria|respiraciones|fr)[^\d]{0,12}(\d{1,2})/);
  if (rr) {
    const value = Number(rr[1]);
    if (value >= 6 && value <= 60) vitals.respiratoryRate = value;
  }

  const bp = normalized.match(/(?:presion|tension)?[^\d]{0,12}(\d{2,3})\s*(?:\/|sobre)\s*(\d{2,3})/);
  if (bp) {
    const systolic = Number(bp[1]);
    const diastolic = Number(bp[2]);
    if (systolic >= 50 && systolic <= 260 && diastolic >= 30 && diastolic <= 160) {
      vitals.systolicBp = systolic;
      vitals.diastolicBp = diastolic;
    }
  }

  const glucose = normalized.match(/(?:glucometria|glicemia|glucemia|azucar)[^\d]{0,12}(\d{2,3})/);
  if (glucose) {
    const value = Number(glucose[1]);
    if (value >= 20 && value <= 700) vitals.glucoseMgDl = value;
  }

  return vitals;
}

const NUMBER_WORDS: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/** Convierte "dos" o "2" en 2; devuelve undefined si no es una cantidad. */
function parseCount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const digits = Number(raw);
  if (Number.isFinite(digits)) return digits;
  return NUMBER_WORDS[raw];
}

export function extractAdherence(text: string, totalDoses = 3): AdherenceSnapshot | undefined {
  const normalized = normalizeText(text);
  if (/(?:no he (?:podido )?tomar|no (?:los |las )?he tomado|no tome|deje de tomar|no he comprado|no consegui)/.test(normalized)) {
    return { missedDoses: totalDoses, totalDoses };
  }
  const countMatch =
    normalized.match(/(?:olvide|falte|me falto|perdi|no tome) (\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) dosis/) ??
    normalized.match(/(?:se me (?:olvidaron|olvido|paso)) (\d{1,2}|una|dos|tres|cuatro|cinco) dosis/);
  if (countMatch) {
    const missed = parseCount(countMatch[1]);
    if (missed !== undefined) {
      // "una dosis ayer y otra hoy" suma la segunda omision mencionada.
      const extra = /\by (?:otra|una mas|otra mas)\b/.test(normalized) ? 1 : 0;
      return { missedDoses: Math.min(missed + extra, Math.max(totalDoses, missed + extra)), totalDoses };
    }
  }
  if (/olvide (?:la )?dosis|se me (?:olvido|paso) (?:la )?dosis/.test(normalized)) {
    return { missedDoses: 1, totalDoses };
  }
  if (/(?:si,? (?:todas|todos|las he tomado|completo)|he tomado (?:todo|todas)|estoy tomando (?:todo|todas)|si las tome|tomo todo)/.test(normalized)) {
    return { missedDoses: 0, totalDoses };
  }
  return undefined;
}

/**
 * Extraccion heuristica determinista de senales clinicas.
 *
 * Cumple dos funciones:
 *  1. Red de seguridad: corre siempre, incluso si el LLM falla o no esta
 *     disponible, de modo que una bandera roja nunca depende del modelo.
 *  2. Modo offline/desarrollo: permite operar el flujo completo sin credenciales.
 */
export function extractSignalsHeuristic(text: string, options: { totalDoses?: number } = {}): ExtractedSignals {
  const normalized = normalizeText(text);
  const overallTrend = detectTrend(normalized);
  const onsetDays = detectOnsetDays(normalized);
  const matches: ExtractedSignals['matches'] = [];
  const symptomsByCode = new Map<string, SymptomObservation>();

  const stripped = stripFillers(normalized);

  for (const definition of SYMPTOM_CATALOG) {
    for (const synonym of definition.synonyms) {
      const normalizedSynonym = normalizeText(synonym);
      const strippedIndex = stripped.text.indexOf(normalizedSynonym);
      if (strippedIndex === -1) continue;
      // Se traduce la posicion al texto original para leer severidad y negacion.
      const index = stripped.map[strippedIndex] ?? strippedIndex;

      const negated = isNegated(normalized, index);
      matches.push({ code: definition.code, matchedText: synonym, negated });

      const window = normalized.slice(Math.max(0, index - 32), index + normalizedSynonym.length + 44);
      const existing = symptomsByCode.get(definition.code);
      const observation: SymptomObservation = {
        code: definition.code,
        present: !negated,
        severity: detectSeverity(window) ?? existing?.severity,
        trend: overallTrend ?? existing?.trend,
        onsetDays: onsetDays ?? existing?.onsetDays,
        quote: synonym,
      };
      // Una mencion afirmativa prevalece sobre una negada del mismo sintoma.
      if (!existing || (!existing.present && observation.present)) {
        symptomsByCode.set(definition.code, observation);
      }
      break;
    }
  }

  const vitals = extractVitals(normalized);
  // Una temperatura mayor o igual a 38 confirma fiebre aunque no se nombre.
  if (vitals.temperatureC !== undefined && vitals.temperatureC >= 38 && !symptomsByCode.has('FEVER')) {
    symptomsByCode.set('FEVER', { code: 'FEVER', present: true, trend: overallTrend, onsetDays, quote: `${vitals.temperatureC} C` });
  }

  return {
    symptoms: Array.from(symptomsByCode.values()),
    vitals,
    adherence: extractAdherence(normalized, options.totalDoses ?? 3),
    overallTrend,
    matches,
  };
}
