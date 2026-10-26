# Estado frente al roadmap del PRD

## Fase 1 — Primeros clientes (implementada)

| Entregable | Estado |
|---|---|
| Canal WhatsApp | Meta Cloud API y Twilio con validación de firma; canal de consola y simulador web para operar y demostrar sin credenciales |
| IA | Claude (SDK oficial, salida estructurada), Azure OpenAI y proveedor determinista; fusión con extracción heurística y barrera de contenido |
| Alertas | Motor determinista con 18 reglas globales y 11 por protocolo, escalamiento, deduplicación, cola priorizada y notificación a la central |
| Dashboard | Panel con semáforo e indicadores, cola de alertas, detalle del paciente con trazabilidad, protocolos, reportes exportables y simulador |
| Seguimiento automático | Contactos programados por protocolo, horario silencioso, detección de paciente no contactable y cierre de planes |
| Cumplimiento | Cifrado PHI, consentimiento versionado, RBAC multi-tenant y auditoría de todos los accesos |

## Fase 2 — Integraciones hospitalarias (pendiente)

HL7 v2 / FHIR R4, conexión con HIS y EMR. Preparación existente: el plan de seguimiento ya se crea
desde una API con diagnóstico codificado (CIE-10) y tratamiento estructurado, por lo que la
integración consiste en un adaptador que traduzca el mensaje del HIS a `POST /followups` y publique
de vuelta las alertas. El modelo de datos ya guarda `diagnosisCode` y versión de protocolo.

## Fase 3 — Especialidades (pendiente)

Cardiología, diabetes, EPOC e hipertensión. El motor ya soporta lo necesario: los protocolos son
datos versionados, el catálogo de signos incluye glucometría, presión arterial, saturación y
frecuencias, y existen reglas por comorbilidad. Agregar una especialidad es agregar un protocolo con
sus reglas y pruebas, sin tocar el orquestador.

## Fase 4 — Predicción clínica (pendiente)

Estratificación de riesgo y modelos predictivos. La base de datos ya acumula el insumo: cada
`RiskScore` guarda el snapshot de entrada, las reglas disparadas y el desenlace operativo de la
alerta (tiempo de respuesta y nota de resolución), que es exactamente el conjunto etiquetado que
necesita un modelo supervisado. La recomendación es mantener el motor determinista como capa de
decisión y usar el modelo para priorizar la cola, no para reemplazar la regla.
