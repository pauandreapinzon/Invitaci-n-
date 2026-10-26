# MedFollow AI

Plataforma de seguimiento clínico postconsulta para hospitales: acompaña al paciente de medicina
general por WhatsApp después de la consulta, interpreta lo que escribe, clasifica su riesgo con un
motor clínico **determinista y auditable**, y escala al equipo de salud cuando aparecen señales de
deterioro.

Implementación de referencia del PRD *MedFollow AI* (alcance MVP, fase 1 del roadmap).

---

## Qué resuelve

Después de la consulta, el hospital pierde visibilidad de la evolución del paciente. MedFollow AI
cierra esa brecha:

| Caso de uso del PRD | Cómo está implementado |
|---|---|
| Explicación del diagnóstico | Al crear el plan, se genera y envía una explicación en lenguaje sencillo basada en el resumen validado del protocolo (`POST /api/followups`). |
| Seguimiento de síntomas | Contactos programados automáticos por día de protocolo y extracción de síntomas, signos vitales y evolución desde el texto libre del paciente. |
| Adherencia al tratamiento | El paciente reporta dosis omitidas en lenguaje natural; se registran como eventos de adherencia y alimentan la regla `GLOBAL-YELLOW-004`. |
| Alerta clínica | Motor determinista: `disnea + fiebre > 39 + empeoramiento` ⇒ **alerta roja** con escalamiento y notificación a la central de enfermería. |

## La decisión de arquitectura central: IA + motor determinista

```
mensaje del paciente
   │
   ├─ CAPA 1 · IA        interpreta lenguaje natural → señales clínicas estructuradas
   │                     (Claude / Azure OpenAI / motor heurístico propio)
   │
   ├─ CAPA 2 · REGLAS    clasifica el riesgo con reglas versionadas y auditables
   │                     (paquete @medfollow/clinical-engine, sin IA, sin azar)
   │
   └─ RESPUESTA          verde/amarillo: redacción empática del modelo
                         rojo: texto literal de la regla, el modelo no interviene
```

Por qué importa: la IA **nunca** decide el nivel de alerta. Toda clasificación es reproducible,
trazable regla por regla y revisable por un comité médico sin leer código, lo que habilita la
auditoría y la aprobación regulatoria.

Garantías adicionales de la capa de IA:

- **Red de seguridad determinista**: la extracción heurística corre siempre y se fusiona con la del
  modelo, de modo que una bandera roja detectable por reglas no se pierde si el LLM falla.
- **Vocabulario cerrado**: los códigos de síntoma que no están en el catálogo clínico se descartan.
- **Barrera de contenido**: ningún mensaje con dosis, prescripción o diagnóstico llega al paciente;
  si el modelo lo produce, se sustituye por la plantilla determinista.
- **Operación sin credenciales**: sin `ANTHROPIC_API_KEY` el sistema funciona completo con el
  proveedor determinista.

## Estructura

```
medfollow/
├── packages/clinical-engine/   Motor clínico determinista (TypeScript puro, 28 pruebas)
│   ├── protocols/              Protocolos y reglas versionadas en formato auditable
│   ├── extraction.ts           Extracción heurística de señales (sin LLM)
│   └── engine.ts               Clasificación de riesgo con evidencia por regla
├── apps/api/                   API NestJS + PostgreSQL (Prisma) + Redis opcional
│   ├── ai/                     Proveedores Claude, Azure OpenAI y determinista
│   ├── whatsapp/               Canal Meta Cloud API / Twilio / consola
│   ├── orchestrator/           Pipeline conversacional completo
│   └── prisma/                 Esquema de datos y seed de demostración
└── apps/web/                   Dashboard clínico Next.js + Material UI
```

## Puesta en marcha

Requisitos: Node 20+, PostgreSQL 14+ y (opcional) Redis.

```bash
cd medfollow
npm install

# Base de datos
cp apps/api/.env.example apps/api/.env       # ajusta DATABASE_URL y genera las claves PHI
npm run db:migrate -w @medfollow/api
npm run db:seed -w @medfollow/api            # hospital, equipo y 42 pacientes de demostración

# Servicios
npm run build
npm run start -w @medfollow/api              # API en http://localhost:3000  (docs: /api/docs)
npm run start -w @medfollow/web              # Dashboard en http://localhost:3001
```

Con Docker: `docker compose up -d` levanta PostgreSQL y Redis; añade el perfil `app`
(`docker compose --profile app up`) para construir también API y dashboard.

### Usuarios de demostración

Clave `MedFollow.2026` para los tres:

| Correo | Rol | Ve |
|---|---|---|
| `admin@hospital.gov.co` | Administración | Todo, incluidos reportes y auditoría |
| `medico@hospital.gov.co` | Médico | Pacientes, planes, alertas y reportes |
| `enfermeria@hospital.gov.co` | Enfermería | Cola de alertas, pacientes y conversaciones |

El seed no inserta alertas a mano: crea pacientes y planes reales y hace pasar mensajes simulados
por el mismo pipeline de producción, de modo que las conversaciones, los puntajes y las alertas los
produce el motor real.

### Probar el flujo clínico sin WhatsApp

En el detalle de un paciente, el **simulador** ejecuta exactamente el mismo pipeline del canal real
(extracción, motor de riesgo, alertas, respuesta). Mensajes útiles para ver cada rama:

| Mensaje | Resultado esperado |
|---|---|
| `Tengo 39 grados y me cuesta respirar, me siento peor` | Rojo · `GLOBAL-RED-001` + `GLOBAL-RED-007` · remisión a urgencias |
| `Me duele el pecho desde esta mañana` | Rojo · `GLOBAL-RED-002` |
| `Olvidé dos dosis del medicamento` | Amarillo · `GLOBAL-YELLOW-004` |
| `Estoy mucho mejor, ya casi no me duele la garganta` | Verde · sin escalamiento |

## Pruebas

```bash
npm test          # 59 pruebas: 28 del motor clínico + 31 de la API
```

El motor clínico se prueba de forma aislada (sin base de datos ni red), incluyendo la reproducción
exacta del caso de uso 4 del PRD y la verificación de que la misma entrada produce siempre la misma
salida.

## Configuración

Variables en `apps/api/.env` (ver `.env.example`):

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `PHI_ENCRYPTION_KEY` / `PHI_HASH_KEY` | Cifrado AES-256-GCM de datos sensibles y seudonimización de teléfonos (32 bytes base64; obligatorias en producción) |
| `AI_PROVIDER` | `deterministic` (por defecto), `claude` o `azure-openai` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude (modelo por defecto `claude-opus-5-5`) |
| `WHATSAPP_PROVIDER` | `console` (por defecto), `meta` o `twilio` |
| `META_APP_SECRET`, `TWILIO_AUTH_TOKEN` | Validación de firma de los webhooks |
| `QUIET_HOURS_START` / `QUIET_HOURS_END` | Franja sin mensajes automáticos |

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — capas, modelo de datos y flujo de un mensaje
- [`docs/MOTOR_CLINICO.md`](docs/MOTOR_CLINICO.md) — reglas, protocolos y cómo agregar una regla
- [`docs/API.md`](docs/API.md) — endpoints
- [`docs/CUMPLIMIENTO.md`](docs/CUMPLIMIENTO.md) — normativa colombiana, controles implementados y brechas pendientes
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — estado frente a las cuatro fases del PRD

## Fuera de alcance (por diseño)

El sistema **no** diagnostica, **no** prescribe, **no** ajusta tratamientos, **no** hace
telemedicina y **no** sustituye la historia clínica. Es una capa de monitoreo remoto que detecta y
escala; la decisión clínica siempre es del profesional de salud.
