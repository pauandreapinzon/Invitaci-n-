import { Condition, VitalMetric } from './types';

/**
 * Catalogo canonico de sintomas de medicina general.
 * Los sinonimos permiten (a) extraccion heuristica determinista sin LLM y
 * (b) acotar el vocabulario que el LLM puede devolver, evitando alucinaciones.
 */
export interface SymptomDefinition {
  code: string;
  label: string;
  synonyms: string[];
  /** Si existe, al detectarse se solicita esta medicion al paciente. */
  requiresVital?: VitalMetric;
  isRedFlag?: boolean;
}

export const SYMPTOM_CATALOG: SymptomDefinition[] = [
  { code: 'FEVER', label: 'Fiebre', synonyms: ['fiebre', 'calentura', 'temperatura alta', 'destemplado', 'febril'], requiresVital: 'temperatureC' },
  { code: 'DYSPNEA', label: 'Dificultad para respirar', synonyms: ['dificultad para respirar', 'me cuesta respirar', 'ahogado', 'ahogo', 'falta de aire', 'no puedo respirar', 'disnea', 'respiro con dificultad'], isRedFlag: true },
  { code: 'CHEST_PAIN', label: 'Dolor toracico', synonyms: ['dolor en el pecho', 'dolor toracico', 'me duele el pecho', 'opresion en el pecho', 'pecho apretado', 'punzada en el pecho', 'siento presion en el pecho'], isRedFlag: true },
  { code: 'ALTERED_CONSCIOUSNESS', label: 'Alteracion del estado de conciencia', synonyms: ['confundido', 'desorientado', 'no responde', 'somnoliento', 'me desmaye', 'perdi el conocimiento', 'desmayo'], isRedFlag: true },
  { code: 'SEIZURE', label: 'Convulsion', synonyms: ['convulsion', 'ataque', 'temblores incontrolables'], isRedFlag: true },
  { code: 'BLEEDING', label: 'Sangrado activo', synonyms: ['sangrado', 'estoy sangrando', 'sangre en heces', 'vomito con sangre', 'hemorragia'], isRedFlag: true },
  { code: 'NECK_STIFFNESS', label: 'Rigidez de cuello', synonyms: ['rigidez en el cuello', 'no puedo mover el cuello', 'cuello tieso'], isRedFlag: true },
  { code: 'PETECHIAE', label: 'Brotes o manchas en la piel', synonyms: ['manchas rojas', 'manchas en la piel', 'puntos rojos', 'brote', 'petequias', 'moretones', 'morados en la piel'], isRedFlag: true },
  { code: 'SORE_THROAT', label: 'Dolor de garganta', synonyms: ['dolor de garganta', 'garganta irritada', 'me duele la garganta', 'odinofagia'] },
  { code: 'COUGH', label: 'Tos', synonyms: ['tos', 'tosiendo', 'tos seca', 'tos con flema'] },
  { code: 'HEADACHE', label: 'Dolor de cabeza', synonyms: ['dolor de cabeza', 'cefalea', 'migrana', 'me duele la cabeza'] },
  { code: 'VOMITING', label: 'Vomito', synonyms: ['vomito', 'vomitando', 'devuelvo', 'nauseas con vomito'] },
  { code: 'DIARRHEA', label: 'Diarrea', synonyms: ['diarrea', 'deposiciones liquidas', 'descomposicion'] },
  { code: 'ABDOMINAL_PAIN', label: 'Dolor abdominal', synonyms: ['dolor de barriga', 'dolor abdominal', 'me duele el estomago', 'me duele la barriga', 'me duele el abdomen', 'colicos'] },
  { code: 'DEHYDRATION_SIGNS', label: 'Signos de deshidratacion', synonyms: ['no puedo tomar liquidos', 'boca seca', 'no he orinado', 'orino muy poco', 'sin tolerar liquidos'] },
  { code: 'DYSURIA', label: 'Ardor al orinar', synonyms: ['ardor al orinar', 'me arde al orinar', 'disuria', 'orinar duele'] },
  { code: 'FLANK_PAIN', label: 'Dolor lumbar o en costado', synonyms: ['dolor en la cintura', 'dolor lumbar', 'dolor en el costado', 'dolor en los rinones', 'me duele la cintura', 'me duele el costado', 'me duelen los rinones', 'me duele la espalda baja'] },
  { code: 'RASH', label: 'Erupcion cutanea', synonyms: ['sarpullido', 'ronchas', 'alergia en la piel', 'urticaria'] },
  { code: 'DIZZINESS', label: 'Mareo', synonyms: ['mareo', 'mareado', 'vertigo', 'me siento debil'] },
  { code: 'FATIGUE', label: 'Fatiga', synonyms: ['cansancio', 'fatiga', 'sin fuerzas', 'agotado'] },
  { code: 'NASAL_CONGESTION', label: 'Congestion nasal', synonyms: ['congestion nasal', 'nariz tapada', 'mocos', 'rinorrea'] },
  { code: 'EAR_PAIN', label: 'Dolor de oido', synonyms: ['dolor de oido', 'me duele el oido', 'otalgia'] },
  { code: 'MEDICATION_SIDE_EFFECT', label: 'Posible efecto adverso del medicamento', synonyms: ['el medicamento me cayo mal', 'reaccion al medicamento', 'efecto secundario', 'me dio alergia la pastilla'] },
  { code: 'NO_SYMPTOMS', label: 'Sin sintomas / mejoria', synonyms: ['estoy bien', 'mejor', 'mucho mejor', 'ya no tengo nada', 'sin molestias', 'normal'] },
];

export const SYMPTOM_BY_CODE: Record<string, SymptomDefinition> = SYMPTOM_CATALOG.reduce(
  (acc, s) => {
    acc[s.code] = s;
    return acc;
  },
  {} as Record<string, SymptomDefinition>,
);

export const RED_FLAG_SYMPTOMS = SYMPTOM_CATALOG.filter((s) => s.isRedFlag).map((s) => s.code);

/** Condicion reutilizable: cualquier bandera roja presente. */
export const ANY_RED_FLAG: Condition = {
  type: 'any',
  of: RED_FLAG_SYMPTOMS.map((code) => ({ type: 'symptom', code, present: true }) as Condition),
};
