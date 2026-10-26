import { FollowUpQuestion, Protocol } from '../types';
import { GLOBAL_RULES } from './global-rules';

/** Preguntas comunes a todos los protocolos de medicina general. */
const BASE_QUESTIONS: FollowUpQuestion[] = [
  {
    id: 'Q_GENERAL',
    // El saludo lo agrega el orquestador: la pregunta solo debe ser la pregunta.
    text: 'Cuentame, como te has sentido hoy?',
    expects: { kind: 'freeText' },
  },
  {
    id: 'Q_TEMPERATURE',
    text: 'Te has tomado la temperatura? Cual fue el valor en grados centigrados?',
    expects: { kind: 'vital', metric: 'temperatureC' },
    askIf: { type: 'all', of: [
      { type: 'symptom', code: 'FEVER', present: true },
      { type: 'vitalMissing', metric: 'temperatureC' },
    ] },
  },
  {
    id: 'Q_ADHERENCE',
    text: 'Has podido tomar los medicamentos que te formularon en los horarios indicados?',
    expects: { kind: 'adherence' },
  },
  {
    id: 'Q_TREND',
    text: 'Comparado con ayer, sientes que estas mejor, igual o peor?',
    expects: { kind: 'freeText' },
  },
];

export const RESPIRATORY_PROTOCOL: Protocol = {
  code: 'GEN-RESP-001',
  name: 'Infeccion respiratoria alta / faringitis',
  version: '1.0.0',
  specialty: 'Medicina general',
  diagnosisCodes: ['J02.9', 'J06.9', 'J00'],
  diagnosisKeywords: ['faringitis', 'amigdalitis', 'resfriado', 'gripa', 'infeccion respiratoria', 'rinofaringitis', 'ira'],
  plainLanguageSummary:
    'Es una inflamacion de la garganta y las vias respiratorias altas, casi siempre causada por un virus. Suele mejorar en 3 a 7 dias con descanso, abundante liquido y los medicamentos para el dolor y la fiebre que te formularon. Los antibioticos no sirven cuando la causa es viral.',
  checkInDays: [1, 3, 5],
  questions: [
    ...BASE_QUESTIONS,
    {
      id: 'Q_RESP_SWALLOW',
      text: 'Puedes tragar liquidos y alimentos sin dificultad?',
      expects: { kind: 'symptom', code: 'DEHYDRATION_SIGNS' },
      askIf: { type: 'symptom', code: 'SORE_THROAT', present: true },
    },
    {
      id: 'Q_RESP_BREATH',
      text: 'Has sentido falta de aire o que te cuesta respirar?',
      expects: { kind: 'symptom', code: 'DYSPNEA' },
    },
  ],
  redFlagsForPatient: [
    'Dificultad para respirar o falta de aire',
    'Fiebre mayor a 39 C que no baja con el medicamento',
    'No poder tragar liquidos o saliva',
    'Dolor en el pecho',
    'Somnolencia excesiva o confusion',
  ],
  rules: [
    {
      id: 'RESP-YELLOW-001',
      version: '1.0.0',
      level: 'YELLOW',
      score: 25,
      title: 'Odinofagia severa con riesgo de intolerancia oral',
      rationale: 'Dolor de garganta severo con imposibilidad de tragar liquidos sugiere absceso periamigdalino o deshidratacion incipiente.',
      action: 'Valoracion presencial en menos de 24 horas.',
      escalation: 'DOCTOR_REVIEW',
      appliesTo: ['GEN-RESP-001'],
      when: { type: 'all', of: [
        { type: 'symptom', code: 'SORE_THROAT', present: true, severityAtLeast: 'SEVERE' },
        { type: 'symptom', code: 'DEHYDRATION_SIGNS', present: true },
      ] },
    },
    {
      id: 'RESP-YELLOW-002',
      version: '1.0.0',
      level: 'YELLOW',
      score: 20,
      title: 'Sin mejoria al quinto dia',
      rationale: 'La falta de mejoria despues de 5 dias en una infeccion respiratoria viral obliga a descartar sobreinfeccion bacteriana.',
      action: 'Agendar revaloracion medica.',
      escalation: 'DOCTOR_REVIEW',
      appliesTo: ['GEN-RESP-001'],
      when: { type: 'all', of: [
        { type: 'followUpDay', op: 'gte', value: 5 },
        { type: 'any', of: [
          { type: 'symptom', code: 'FEVER', present: true },
          { type: 'symptom', code: 'COUGH', present: true, trend: 'WORSENING' },
        ] },
      ] },
    },
    {
      id: 'RESP-YELLOW-003',
      version: '1.0.0',
      level: 'YELLOW',
      score: 20,
      title: 'Otalgia con fiebre',
      rationale: 'Dolor de oido con fiebre sugiere otitis media aguda, que puede requerir antibiotico.',
      action: 'Revaloracion medica en menos de 48 horas.',
      escalation: 'DOCTOR_REVIEW',
      appliesTo: ['GEN-RESP-001'],
      when: { type: 'all', of: [
        { type: 'symptom', code: 'EAR_PAIN', present: true },
        { type: 'any', of: [
          { type: 'symptom', code: 'FEVER', present: true },
          { type: 'vital', metric: 'temperatureC', op: 'gte', value: 38 },
        ] },
      ] },
    },
  ],
};

export const FEBRILE_PROTOCOL: Protocol = {
  code: 'GEN-FEBRIL-001',
  name: 'Sindrome febril sin foco',
  version: '1.0.0',
  specialty: 'Medicina general',
  diagnosisCodes: ['R50.9'],
  diagnosisKeywords: ['fiebre', 'sindrome febril', 'virosis', 'dengue', 'cuadro viral'],
  plainLanguageSummary:
    'Tienes un cuadro con fiebre cuya causa mas probable es una infeccion viral. Lo mas importante es mantenerte hidratado, controlar la fiebre con el medicamento formulado y vigilar signos de alarma. La mayoria de los casos mejora en pocos dias.',
  checkInDays: [1, 2, 3, 5],
  questions: [
    ...BASE_QUESTIONS,
    {
      id: 'Q_FEB_SKIN',
      text: 'Has notado manchas rojas, moretones o brotes en la piel?',
      expects: { kind: 'symptom', code: 'PETECHIAE' },
    },
    {
      id: 'Q_FEB_HYDRATION',
      text: 'Estas orinando con normalidad y tolerando los liquidos?',
      expects: { kind: 'symptom', code: 'DEHYDRATION_SIGNS' },
    },
  ],
  redFlagsForPatient: [
    'Fiebre que persiste mas de 3 dias',
    'Manchas o puntos rojos en la piel',
    'Sangrado por nariz o encias',
    'Dolor abdominal intenso',
    'Somnolencia, confusion o dificultad para despertar',
    'No tolerar liquidos',
  ],
  rules: [
    {
      id: 'FEB-RED-001',
      version: '1.0.0',
      level: 'RED',
      score: 70,
      title: 'Fiebre con signos de alarma hemorragicos o neurologicos',
      rationale: 'Fiebre con petequias, sangrado o compromiso de conciencia sugiere dengue grave, sepsis o infeccion del SNC.',
      action: 'Remision inmediata a urgencias con aviso al medico tratante.',
      escalation: 'EMERGENCY_REFERRAL',
      appliesTo: ['GEN-FEBRIL-001'],
      when: { type: 'all', of: [
        { type: 'any', of: [
          { type: 'symptom', code: 'FEVER', present: true },
          { type: 'vital', metric: 'temperatureC', op: 'gte', value: 38 },
        ] },
        { type: 'symptomCount', codes: ['PETECHIAE', 'BLEEDING', 'ALTERED_CONSCIOUSNESS', 'ABDOMINAL_PAIN'], atLeast: 1 },
      ] },
    },
    {
      id: 'FEB-YELLOW-001',
      version: '1.0.0',
      level: 'YELLOW',
      score: 25,
      title: 'Fiebre de mas de 72 horas',
      rationale: 'La fiebre que persiste mas de 72 horas requiere estudio de laboratorio y revaloracion presencial.',
      action: 'Agendar consulta y laboratorios en menos de 24 horas.',
      escalation: 'DOCTOR_REVIEW',
      appliesTo: ['GEN-FEBRIL-001'],
      when: { type: 'all', of: [
        { type: 'symptom', code: 'FEVER', present: true },
        { type: 'followUpDay', op: 'gte', value: 3 },
      ] },
    },
  ],
};

export const GASTRO_PROTOCOL: Protocol = {
  code: 'GEN-GI-001',
  name: 'Gastroenteritis aguda',
  version: '1.0.0',
  specialty: 'Medicina general',
  diagnosisCodes: ['A09', 'K52.9'],
  diagnosisKeywords: ['gastroenteritis', 'diarrea', 'vomito', 'intoxicacion alimentaria', 'enfermedad diarreica'],
  plainLanguageSummary:
    'Es una inflamacion del estomago y el intestino, generalmente por un virus o un alimento contaminado. Lo mas importante es reponer liquidos con suero oral en sorbos frecuentes y continuar la alimentacion suave. Suele mejorar en 2 a 4 dias.',
  checkInDays: [1, 2, 4],
  questions: [
    ...BASE_QUESTIONS,
    {
      id: 'Q_GI_FREQUENCY',
      text: 'Cuantas veces has presentado diarrea o vomito en las ultimas 24 horas?',
      expects: { kind: 'freeText' },
    },
    {
      id: 'Q_GI_HYDRATION',
      text: 'Estas logrando tomar liquidos y orinar con normalidad?',
      expects: { kind: 'symptom', code: 'DEHYDRATION_SIGNS' },
    },
  ],
  redFlagsForPatient: [
    'No poder retener ningun liquido',
    'Sangre en las heces o en el vomito',
    'Dolor abdominal intenso y localizado',
    'Orinar muy poco o nada en 8 horas',
    'Mareo al ponerse de pie',
  ],
  rules: [
    {
      id: 'GI-RED-001',
      version: '1.0.0',
      level: 'RED',
      score: 60,
      title: 'Intolerancia oral con vomito persistente',
      rationale: 'Vomito persistente con signos de deshidratacion requiere hidratacion endovenosa.',
      action: 'Remision para hidratacion endovenosa.',
      escalation: 'IMMEDIATE_CALL',
      appliesTo: ['GEN-GI-001'],
      when: { type: 'all', of: [
        { type: 'symptom', code: 'VOMITING', present: true },
        { type: 'symptom', code: 'DEHYDRATION_SIGNS', present: true },
      ] },
    },
    {
      id: 'GI-RED-002',
      version: '1.0.0',
      level: 'RED',
      score: 55,
      title: 'Dolor abdominal severo en empeoramiento',
      rationale: 'Dolor abdominal severo progresivo obliga a descartar abdomen agudo quirurgico.',
      action: 'Valoracion presencial urgente.',
      escalation: 'EMERGENCY_REFERRAL',
      appliesTo: ['GEN-GI-001'],
      when: { type: 'all', of: [
        { type: 'symptom', code: 'ABDOMINAL_PAIN', present: true, severityAtLeast: 'SEVERE' },
        { type: 'symptom', code: 'ABDOMINAL_PAIN', trend: 'WORSENING' },
      ] },
    },
    {
      id: 'GI-YELLOW-001',
      version: '1.0.0',
      level: 'YELLOW',
      score: 20,
      title: 'Diarrea prolongada',
      rationale: 'Diarrea de mas de 3 dias requiere descartar etiologia bacteriana o parasitaria.',
      action: 'Agendar revaloracion y considerar coprologico.',
      escalation: 'DOCTOR_REVIEW',
      appliesTo: ['GEN-GI-001'],
      when: { type: 'symptom', code: 'DIARRHEA', present: true, onsetDaysAtLeast: 3 },
    },
  ],
};

export const UTI_PROTOCOL: Protocol = {
  code: 'GEN-UTI-001',
  name: 'Infeccion de vias urinarias no complicada',
  version: '1.0.0',
  specialty: 'Medicina general',
  diagnosisCodes: ['N39.0'],
  diagnosisKeywords: ['infeccion urinaria', 'ivu', 'cistitis', 'vias urinarias'],
  plainLanguageSummary:
    'Es una infeccion de la vejiga y las vias urinarias causada por bacterias. El antibiotico que te formularon debe tomarse completo, incluso si te sientes mejor antes de terminarlo. Las molestias suelen mejorar en 48 a 72 horas.',
  checkInDays: [1, 3, 5],
  questions: [
    ...BASE_QUESTIONS,
    {
      id: 'Q_UTI_BURNING',
      text: 'Sigues sintiendo ardor o dolor al orinar?',
      expects: { kind: 'symptom', code: 'DYSURIA' },
    },
    {
      id: 'Q_UTI_FLANK',
      text: 'Has sentido dolor en la espalda baja o en el costado?',
      expects: { kind: 'symptom', code: 'FLANK_PAIN' },
    },
  ],
  redFlagsForPatient: [
    'Fiebre con escalofrios intensos',
    'Dolor en la espalda baja o en el costado',
    'Vomito que impide tomar el antibiotico',
    'Sangre en la orina con dolor intenso',
  ],
  rules: [
    {
      id: 'UTI-RED-001',
      version: '1.0.0',
      level: 'RED',
      score: 60,
      title: 'Sospecha de pielonefritis',
      rationale: 'Dolor lumbar o en flanco con fiebre indica compromiso renal y requiere manejo distinto al de una cistitis.',
      action: 'Valoracion medica urgente y consideracion de manejo intrahospitalario.',
      escalation: 'IMMEDIATE_CALL',
      appliesTo: ['GEN-UTI-001'],
      when: { type: 'all', of: [
        { type: 'symptom', code: 'FLANK_PAIN', present: true },
        { type: 'any', of: [
          { type: 'vital', metric: 'temperatureC', op: 'gte', value: 38.5 },
          { type: 'symptom', code: 'FEVER', present: true },
        ] },
      ] },
    },
    {
      id: 'UTI-YELLOW-001',
      version: '1.0.0',
      level: 'YELLOW',
      score: 20,
      title: 'Disuria sin mejoria al tercer dia de antibiotico',
      rationale: 'La persistencia de disuria tras 72 horas de antibiotico sugiere resistencia bacteriana.',
      action: 'Revaloracion medica y considerar urocultivo.',
      escalation: 'DOCTOR_REVIEW',
      appliesTo: ['GEN-UTI-001'],
      when: { type: 'all', of: [
        { type: 'symptom', code: 'DYSURIA', present: true },
        { type: 'followUpDay', op: 'gte', value: 3 },
      ] },
    },
    {
      id: 'UTI-YELLOW-002',
      version: '1.0.0',
      level: 'YELLOW',
      score: 25,
      title: 'Infeccion urinaria en embarazo',
      rationale: 'La bacteriuria en embarazo se asocia a parto pretermino y requiere control estricto.',
      action: 'Notificar al medico tratante para control obstetrico.',
      escalation: 'DOCTOR_REVIEW',
      appliesTo: ['GEN-UTI-001'],
      when: { type: 'all', of: [{ type: 'pregnant' }, { type: 'symptom', code: 'DYSURIA', present: true }] },
    },
  ],
};

export const DEFAULT_PROTOCOL: Protocol = {
  code: 'GEN-DEFAULT-001',
  name: 'Seguimiento general postconsulta',
  version: '1.0.0',
  specialty: 'Medicina general',
  diagnosisCodes: [],
  diagnosisKeywords: [],
  plainLanguageSummary:
    'Despues de tu consulta haremos un seguimiento para saber como evolucionas, recordarte el tratamiento y detectar a tiempo cualquier senal que requiera atencion.',
  checkInDays: [1, 3],
  questions: BASE_QUESTIONS,
  redFlagsForPatient: [
    'Dificultad para respirar',
    'Dolor en el pecho',
    'Fiebre alta que no cede',
    'Vomito que impide tomar liquidos',
    'Confusion o somnolencia excesiva',
  ],
  rules: [],
};

export const PROTOCOLS: Protocol[] = [
  RESPIRATORY_PROTOCOL,
  FEBRILE_PROTOCOL,
  GASTRO_PROTOCOL,
  UTI_PROTOCOL,
  DEFAULT_PROTOCOL,
];

/**
 * Resuelve el protocolo a partir del diagnostico escrito por el medico.
 * El mapeo es determinista por codigo CIE-10 o por palabra clave; si no hay
 * coincidencia se usa el protocolo general (nunca se inventa un protocolo).
 */
export function resolveProtocol(diagnosis?: string | null): Protocol {
  if (!diagnosis) return DEFAULT_PROTOCOL;
  const normalized = diagnosis
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const byCode = PROTOCOLS.find((p) => p.diagnosisCodes.some((code) => normalized.includes(code.toLowerCase())));
  if (byCode) return byCode;
  const byKeyword = PROTOCOLS.find((p) => p.diagnosisKeywords.some((keyword) => normalized.includes(keyword)));
  return byKeyword ?? DEFAULT_PROTOCOL;
}

export function getProtocolByCode(code: string): Protocol | undefined {
  return PROTOCOLS.find((p) => p.code === code);
}

export { GLOBAL_RULES };
