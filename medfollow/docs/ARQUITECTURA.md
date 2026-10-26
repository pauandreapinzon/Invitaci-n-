# Arquitectura

## Visión general

```
            HOSPITAL (HIS / historia clínica)
                      │  (fase 2: HL7 / FHIR)
                      ▼
        ┌─────────────────────────────┐
        │  API MedFollow (NestJS)     │
        │  autenticación · RBAC       │
        │  auditoría · cifrado PHI    │
        └───────┬──────────────┬──────┘
                │              │
   ┌────────────▼───┐   ┌──────▼─────────────┐
   │ Capa de IA     │   │ Motor clínico      │
   │ (capa 1)       │──►│ determinista       │
   │ Claude / Azure │   │ (capa 2, auditable)│
   │ / heurístico   │   └──────┬─────────────┘
   └────────┬───────┘          │
            │                  ▼
   ┌────────▼───────┐   ┌──────────────────┐
   │ WhatsApp       │   │ Alertas y cola   │
   │ Meta / Twilio  │   │ de escalamiento  │
   └────────┬───────┘   └──────┬───────────┘
            ▼                  ▼
        Paciente        Dashboard clínico (Next.js)
```

## Flujo completo de un mensaje

`ConversationOrchestrator.handleInbound` ejecuta, en orden:

1. **Idempotencia** — si el `providerMessageId` ya se procesó, se descarta la reentrega.
2. **Persistencia** — el mensaje se cifra (AES-256-GCM) y se guarda; se actualiza el último contacto.
3. **Consentimiento** — sin autorización vigente no hay evaluación clínica. `ACEPTO` la otorga y
   `RETIRO` la revoca, cancelando los planes activos y dejando constancia en auditoría.
4. **Capa 1 (IA)** — extracción de síntomas, signos vitales, adherencia e intención. Se fusiona
   siempre con la extracción heurística: una señal detectada por reglas no se pierde aunque el
   modelo falle o devuelva menos información.
5. **Registro de señales** — cada síntoma y signo se guarda con su origen (`AI_EXTRACTION`,
   `HEURISTIC`, `NURSE`, `DOCTOR`) y la frase original del paciente.
6. **Contacto programado** — si había un seguimiento enviado, se marca como respondido (indicador de
   contacto efectivo).
7. **Capa 2 (motor determinista)** — se arma el contexto clínico vigente (última observación por
   síntoma en 48 h, último valor por signo vital en 24 h, adherencia y día de seguimiento) y se
   clasifica el riesgo. Se persiste el `RiskScore` con las reglas disparadas, su evidencia, las
   reglas evaluadas y el snapshot de entrada.
8. **Alerta y escalamiento** — se crea la alerta (con deduplicación por mismas reglas en 6 h) y, si
   el escalamiento es `IMMEDIATE_CALL` o `EMERGENCY_REFERRAL`, se notifica a la central del hospital.
9. **Respuesta** — en riesgo rojo se envía el texto literal de la regla; en verde y amarillo el
   modelo redacta, con la indicación obligatoria incrustada y pasando por la barrera de contenido.
10. **Auditoría** — cada paso deja huella en `AuditLog`.

## Componentes

### `@medfollow/clinical-engine`

TypeScript puro, sin dependencias de infraestructura. Es el núcleo auditable:

- `types.ts` — condiciones serializables en JSON (`all`, `any`, `not`, síntoma, signo vital, edad,
  comorbilidad, adherencia, día de seguimiento).
- `conditions.ts` — evaluador puro: la misma entrada produce siempre la misma salida y devuelve la
  evidencia concreta que hizo verdadera cada condición.
- `protocols/` — reglas globales (banderas rojas) y protocolos por diagnóstico, con versión propia.
- `extraction.ts` — extracción heurística en español (negación, severidad, evolución, duración,
  signos vitales con rango fisiológico, dosis omitidas, intensificadores intercalados).
- `engine.ts` — clasificación, puntaje, escalamiento, datos faltantes y siguiente pregunta.

### API (NestJS)

Módulos: `auth`, `users`, `patients`, `protocols`, `followups`, `conversations`, `symptoms`, `risk`,
`alerts`, `ai`, `whatsapp`, `orchestrator`, `channel`, `scheduler`, `metrics`, `audit`.

Transversales: guardas JWT y de rol globales, `ValidationPipe` estricto, `helmet`, rate limiting,
`PrismaService`, `EncryptionService` y `AuditService`.

### Programador

`SchedulerService` (cron):

- cada minuto despacha los contactos vencidos (idempotente: solo toma los `PENDING` cuya hora llegó,
  respeta el horario silencioso y limita el lote para no saturar el canal);
- cada hora marca como *no contactado* lo que lleva 24 h sin respuesta, abriendo una alerta
  operativa, y cierra los planes terminados.

### Dashboard (Next.js + MUI)

Panel con semáforo de pacientes e indicadores, cola de alertas priorizada, detalle del paciente con
la trazabilidad regla por regla, historial de conversación, catálogo de protocolos, reportes
exportables y simulador del canal.

## Modelo de datos

`Hospital`, `User`, `Patient`, `Consent`, `Protocol`, `FollowUpPlan`, `Medication`,
`FollowUpCheckIn`, `Conversation`, `Message`, `SymptomObservation`, `VitalReading`,
`AdherenceEvent`, `RiskScore`, `Alert`, `AuditLog`.

Decisiones:

- **Multi-tenant por hospital**: toda consulta se filtra por `hospitalId` tomado del token.
- **PHI cifrada**: documento, teléfono y contenido de los mensajes se guardan cifrados; el teléfono
  además se seudonimiza con HMAC-SHA256 para poder buscarlo sin almacenarlo en claro.
- **Versionado**: `RiskScore` guarda versión de motor y de protocolo, reglas evaluadas y evidencia,
  de modo que una decisión pasada se puede reconstruir aunque las reglas cambien después.

## Arquitectura de referencia para producción

Lo implementado aquí corresponde a la fase 1. Para despliegue institucional el PRD propone Azure con
AKS, Key Vault (claves PHI), Application Insights, PostgreSQL gestionado, Redis y RabbitMQ para
colas, más Grafana/Prometheus. La aplicación ya está preparada para ese entorno: configuración por
variables de entorno, estado solo en PostgreSQL, `/health` con estado de dependencias, apagado
ordenado y proveedores de IA y canal intercambiables por configuración.
