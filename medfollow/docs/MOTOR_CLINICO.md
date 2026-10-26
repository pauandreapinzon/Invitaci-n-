# Motor clínico determinista

El motor es la pieza que decide el nivel de riesgo. No usa modelos de lenguaje, azar, reloj ni red:
dada la misma entrada produce siempre la misma salida, y devuelve la evidencia de cada regla que se
disparó. Esto es lo que permite auditar una alerta y someter las reglas a aprobación médica.

## Anatomía de una regla

```ts
{
  id: 'GLOBAL-RED-007',
  version: '1.0.0',
  level: 'RED',
  score: 80,
  title: 'Fiebre alta con dificultad respiratoria y empeoramiento',
  rationale: 'Tríada de deterioro clínico: fiebre > 39 °C, disnea y evolución desfavorable.',
  action: 'Escalamiento rojo inmediato con notificación al médico tratante.',
  escalation: 'EMERGENCY_REFERRAL',
  patientGuidance: 'Tus síntomas requieren atención presencial inmediata...',
  when: { type: 'all', of: [
    { type: 'vital', metric: 'temperatureC', op: 'gt', value: 39 },
    { type: 'symptom', code: 'DYSPNEA', present: true },
    { type: 'any', of: [
      { type: 'symptom', code: 'DYSPNEA', trend: 'WORSENING' },
      { type: 'symptom', code: 'FEVER', trend: 'WORSENING' },
    ] },
  ] },
}
```

`when` es una estructura de datos serializable en JSON, no código: puede exportarse, revisarse en
comité y versionarse por separado.

### Condiciones disponibles

| Tipo | Ejemplo |
|---|---|
| `symptom` | presencia/ausencia, severidad mínima, evolución, duración mínima |
| `symptomCount` | al menos N de una lista de síntomas |
| `vital` | `temperatureC > 39`, `spo2 < 92`, `systolicBp < 90`, `glucoseMgDl > 250` |
| `vitalMissing` | el dato aún no se ha reportado (sirve para decidir qué preguntar) |
| `age`, `pregnant`, `comorbidity` | población de riesgo |
| `adherence` | dosis omitidas ≥ N |
| `followUpDay` | día de seguimiento desde la consulta |
| `all`, `any`, `not` | composición lógica |

### Semántica de los datos ausentes

Una condición sobre un dato que no existe **no se cumple** y además reporta qué falta. El motor
devuelve `missingData` y `nextQuestions`, lo que convierte un vacío de información en la siguiente
pregunta del seguimiento en lugar de en una clasificación silenciosamente optimista.

## Resultado de una evaluación

```json
{
  "level": "RED",
  "score": 100,
  "engineVersion": "1.0.0",
  "protocolCode": "GEN-FEBRIL-001",
  "protocolVersion": "1.0.0",
  "escalation": "EMERGENCY_REFERRAL",
  "recommendedAction": "Remisión inmediata a urgencias con aviso al médico tratante.",
  "triggered": [
    { "ruleId": "GLOBAL-RED-010", "level": "RED", "score": 70,
      "title": "Sospecha de infección del sistema nervioso central",
      "evidence": ["Síntoma FEVER reportado como presente",
                   "Síntoma PETECHIAE reportado como presente"] }
  ],
  "evaluatedRuleIds": ["GLOBAL-RED-001", "GLOBAL-RED-002", "..."],
  "missingData": ["signo:temperatureC", "evolucion:FEVER", "adherencia"]
}
```

El nivel es el máximo de las reglas disparadas, el puntaje la suma acotada a 100 y el escalamiento
el más severo. `evaluatedRuleIds` deja constancia también de lo que se evaluó y no se disparó.

## Protocolos incluidos

| Código | Protocolo | Contactos | Reglas propias |
|---|---|---|---|
| `GEN-RESP-001` | Infección respiratoria alta / faringitis | días 1, 3, 5 | 3 |
| `GEN-FEBRIL-001` | Síndrome febril sin foco | días 1, 2, 3, 5 | 2 |
| `GEN-GI-001` | Gastroenteritis aguda | días 1, 2, 4 | 3 |
| `GEN-UTI-001` | Infección de vías urinarias | días 1, 3, 5 | 3 |
| `GEN-DEFAULT-001` | Seguimiento general | días 1, 3 | — |

Las 18 reglas globales (banderas rojas de medicina general: disnea, dolor torácico, compromiso de
conciencia, sangrado, hipoxemia, taquipnea, taquicardia, hipotensión, sospecha de infección del SNC,
hipoglucemia, fiebre persistente, deshidratación, baja adherencia, evento adverso, población de
riesgo) se evalúan en todos los protocolos.

El diagnóstico escrito por el médico se mapea a protocolo por código CIE-10 o por palabra clave; si
no hay coincidencia se usa el protocolo general. Nunca se "inventa" un protocolo.

## Agregar o cambiar una regla

1. Edita `packages/clinical-engine/src/protocols/global-rules.ts` (banderas rojas transversales) o
   `catalog.ts` (regla específica de un protocolo).
2. Súbele la versión a la regla y al protocolo que la contiene.
3. Agrega la prueba correspondiente en `src/__tests__/engine.spec.ts`: toda regla nueva debe venir
   con un caso que la dispara y, cuando aplique, uno que no debe dispararla.
4. `npm test -w @medfollow/clinical-engine`, luego `npm run build -w @medfollow/clinical-engine`.

Las evaluaciones ya almacenadas conservan la versión con la que se tomaron, así que un cambio de
reglas no reescribe la historia clínica.

## Capa 1: extracción de señales

La extracción convierte texto libre en señales del catálogo cerrado (`symptom-catalog.ts`). Maneja
negación (`no tengo fiebre`), severidad (`insoportable`, `me duele mucho`), evolución (`peor que
ayer`), duración (`desde hace 3 días`), signos vitales con validación de rango fisiológico,
intensificadores intercalados (`me duele **mucho** la cintura`) y dosis omitidas escritas con
palabras (`olvidé dos dosis`).

Corre siempre, aun con un LLM configurado, y su resultado se fusiona con el del modelo tomando el
criterio conservador: un síntoma afirmado por cualquiera de los dos se considera presente.
