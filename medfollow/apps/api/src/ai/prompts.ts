import { SYMPTOM_CATALOG } from '@medfollow/clinical-engine';
import { ComposeReplyRequest, ExplainDiagnosisRequest, ExtractionRequest } from './ai.types';

/**
 * Reglas de seguridad que aplican a toda interaccion del modelo con el paciente.
 * Estan fuera del alcance del MVP: diagnosticar, prescribir y dar dosis.
 */
export const SAFETY_RULES = [
  'Nunca entregues un diagnostico medico nuevo ni confirmes o descartes enfermedades.',
  'Nunca formules, cambies, suspendas ni sugieras medicamentos, dosis o frecuencias.',
  'Nunca interpretes resultados de laboratorio ni imagenes.',
  'No prometas tiempos de atencion ni resultados clinicos.',
  'Si el paciente pide hablar con una persona, confirma que un profesional lo contactara.',
  'Habla en espanol claro, en segunda persona, con frases cortas y sin tecnicismos.',
  'No inventes informacion que no este en el contexto entregado.',
  'Si detectas una urgencia, no minimices: indica acudir a urgencias.',
].join('\n- ');

export const EXTRACTION_SYSTEM_PROMPT = `Eres un componente de extraccion de informacion clinica de una plataforma de seguimiento postconsulta.
Tu unica tarea es convertir el mensaje de un paciente en datos estructurados. NO decides el nivel de riesgo, NO das recomendaciones y NO escribes mensajes al paciente: otro componente determinista se encarga de eso.

Reglas:
- Usa exclusivamente los codigos de sintoma del catalogo entregado. Si una molestia no esta en el catalogo, omitela.
- Marca present=false solo cuando el paciente niega explicitamente el sintoma.
- severity: MILD, MODERATE o SEVERE, solo si el paciente lo expresa.
- trend: IMPROVING, STABLE o WORSENING, solo si el paciente compara con dias anteriores.
- Registra signos vitales solo si el paciente da un numero. Convierte Fahrenheit a Celsius.
- No inventes valores ni infieras cifras aproximadas.
- summary: una linea objetiva, sin interpretacion clinica.`;

export function buildSymptomVocabulary(): string {
  return SYMPTOM_CATALOG.map((s) => `${s.code} = ${s.label} (ej: ${s.synonyms.slice(0, 3).join(', ')})`).join('\n');
}

export function buildExtractionUserPrompt(request: ExtractionRequest): string {
  const history = request.recentMessages
    .slice(-6)
    .map((m) => `${m.author}: ${m.text}`)
    .join('\n');

  return `Catalogo de sintomas permitido:
${buildSymptomVocabulary()}

Paciente: ${request.patient.ageYears} anos${request.patient.pregnant ? ', en embarazo' : ''}${
    request.patient.comorbidities.length ? `, comorbilidades: ${request.patient.comorbidities.join(', ')}` : ''
  }.
Protocolo de seguimiento: ${request.protocol.name}.
Dosis programadas en el periodo: ${request.totalDoses}.

Conversacion reciente:
${history || '(sin mensajes previos)'}

Mensaje nuevo del paciente a estructurar:
"""
${request.text}
"""`;
}

export const EXPLAIN_SYSTEM_PROMPT = `Eres la enfermera digital de seguimiento de un hospital. Explicas a un paciente adulto, en espanol sencillo, que significa su diagnostico y que debe hacer tras la consulta.

Reglas de seguridad:
- ${SAFETY_RULES}

Formato de la respuesta:
1. Una frase que explique el diagnostico en lenguaje cotidiano.
2. Que esperar en los proximos dias.
3. Los cuidados indicados por el medico (solo los que aparecen en el contexto; menciona los medicamentos por nombre pero sin cambiar dosis).
4. Las senales de alarma por las que debe buscar atencion inmediata.
Maximo 160 palabras. Sin encabezados ni markdown: texto corrido apto para WhatsApp, puedes usar saltos de linea y vinetas simples con guion.`;

export function buildExplainUserPrompt(request: ExplainDiagnosisRequest): string {
  const medications = request.medications.length
    ? request.medications
        .map((m) => `${m.name} ${m.dose} cada ${m.frequencyHours} horas por ${m.durationDays} dias`)
        .join('; ')
    : 'sin medicamentos formulados';

  return `Diagnostico registrado por el medico: ${request.diagnosisText}
Resumen clinico validado del protocolo (fuente de verdad, no la contradigas): ${request.protocol.plainLanguageSummary}
Indicaciones del medico: ${request.instructions ?? 'las generales del protocolo'}
Medicamentos formulados: ${medications}
Senales de alarma del protocolo: ${request.protocol.redFlagsForPatient.join('; ')}
Nombre del paciente: ${request.patient.firstName}
Edad: ${request.patient.ageYears} anos`;
}

export const COMPOSE_SYSTEM_PROMPT = `Eres la enfermera digital de seguimiento de un hospital y escribes por WhatsApp a un paciente que esta en seguimiento postconsulta.

Reglas de seguridad:
- ${SAFETY_RULES}

Reglas de redaccion:
- Maximo 60 palabras, tono calido y respetuoso, trato de "tu".
- Si recibes una INDICACION OBLIGATORIA, incluyela sin cambiar su significado ni suavizarla.
- Si recibes una SIGUIENTE PREGUNTA, terminal el mensaje con esa pregunta (puedes reformularla, no cambiar lo que pregunta).
- Nunca afirmes que el paciente esta bien o que no es grave: eso lo define el equipo clinico.
- Sin markdown ni emojis excesivos (maximo uno).`;

export function buildComposeUserPrompt(request: ComposeReplyRequest): string {
  const history = request.recentMessages
    .slice(-6)
    .map((m) => `${m.author}: ${m.text}`)
    .join('\n');

  return `Paciente: ${request.patient.firstName}, ${request.patient.ageYears} anos.
Protocolo: ${request.protocol.name}.
Clasificacion de riesgo determinada por el motor clinico: ${request.riskLevel}.
INDICACION OBLIGATORIA: ${request.mandatoryGuidance ?? '(ninguna)'}
SIGUIENTE PREGUNTA: ${request.nextQuestion ?? '(ninguna)'}

Conversacion reciente:
${history || '(sin mensajes previos)'}

Ultimo mensaje del paciente:
"""
${request.patientMessage}
"""

Escribe unicamente el mensaje que se enviara al paciente.`;
}

/**
 * Patrones que no pueden salir hacia el paciente (prescripcion o diagnostico).
 * Si aparecen, se descarta la respuesta del modelo y se usa la plantilla determinista.
 */
const PROHIBITED_PATTERNS: RegExp[] = [
  /\b\d+\s?(mg|ml|mcg|gramos|g)\b/i,
  // Raices verbales (no palabras completas) para cubrir las conjugaciones:
  // "duplicar", "suspendiendo", "cambiale" tambien deben bloquearse.
  /\b(?:toma|tomate|tomese|aument|duplic|suspend|cambi|deja de tomar)\w*[^.]{0,40}\b(?:dosis|pastilla|tableta|medicamento|antibiotico)\b/i,
  /\b(tienes|padeces|es|sufres de)\s+(neumonia|covid|dengue|cancer|infarto|meningitis)\b/i,
  /\b(te receto|le receto|te formulo|te recomiendo tomar)\b/i,
];

export function containsProhibitedContent(text: string): boolean {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(normalized));
}
