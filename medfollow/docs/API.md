# API

Base: `http://localhost:3000/api` · documentación interactiva (OpenAPI): `/api/docs` ·
estado del servicio: `/health` (público).

Autenticación: `Authorization: Bearer <token>` obtenido en `POST /api/auth/login`. Todas las
consultas se limitan automáticamente al hospital del usuario autenticado.

## Autenticación y equipo

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | público | Inicia sesión y devuelve el token |
| `GET` | `/auth/me` | cualquiera | Perfil del usuario autenticado |
| `GET` | `/users` | cualquiera | Equipo clínico del hospital |
| `POST` | `/users` | ADMIN | Crea usuario (exige registro médico si el rol es DOCTOR) |

## Pacientes

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/patients` | ADMIN · DOCTOR · NURSE | Registra paciente (documento y teléfono se cifran) |
| `GET` | `/patients` | cualquiera | Lista con filtro `riskLevel` y `search`, ordenada por riesgo |
| `GET` | `/patients/:id` | cualquiera | Detalle clínico; `?revealContact=true` expone el contacto y lo registra en auditoría |
| `PATCH` | `/patients/:id` | ADMIN · DOCTOR · NURSE | Actualiza datos |

## Seguimientos

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/followups` | DOCTOR · ADMIN · NURSE | Crea el plan: resuelve protocolo, registra tratamiento, agenda contactos y envía la explicación del diagnóstico |
| `GET` | `/followups` | cualquiera | Lista de planes (`patientId`, `status`) |
| `GET` | `/followups/:id` | cualquiera | Plan con adherencia, contactos y alertas |
| `PATCH` | `/followups/:id/cancel` | DOCTOR · ADMIN | Cancela el plan y sus contactos pendientes |
| `POST` | `/followups/check-ins/:checkInId/send` | NURSE · DOCTOR · ADMIN | Envía ahora un contacto programado |

## Señales clínicas y riesgo

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/symptoms` | NURSE · DOCTOR · ADMIN | Registra síntoma, signos vitales o adherencia y **reevalúa el riesgo** |
| `GET` | `/symptoms` | cualquiera | Señales registradas de un paciente |
| `GET` | `/symptoms/catalog` | cualquiera | Catálogo clínico de síntomas reconocidos |
| `GET` | `/risk-score?patientId=` | cualquiera | Riesgo vigente con reglas disparadas, evidencia y datos faltantes |
| `GET` | `/risk-score/history?patientId=` | cualquiera | Histórico de evaluaciones |
| `POST` | `/risk-score/simulate` | cualquiera | Evalúa un contexto hipotético sin persistir (validación clínica del motor) |

## Alertas

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/alerts` | cualquiera | Cola priorizada (`status`, `level`) |
| `GET` | `/alerts/summary` | cualquiera | Conteo por nivel y estado |
| `GET` | `/alerts/:id` | cualquiera | Detalle con la evaluación que la originó |
| `PATCH` | `/alerts/:id/acknowledge` | NURSE · DOCTOR · ADMIN | Toma la alerta y registra el tiempo de respuesta |
| `PATCH` | `/alerts/:id/assign/:assigneeId` | NURSE · DOCTOR · ADMIN | Asigna la alerta |
| `PATCH` | `/alerts/:id/resolve` | NURSE · DOCTOR · ADMIN | Cierra con nota de resolución |

## Conversaciones y canal

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/conversations?patientId=` | cualquiera | Conversaciones del paciente |
| `GET` | `/conversations/:id` | cualquiera | Transcripción completa (acceso auditado) |
| `PATCH` | `/conversations/:id/handover` | NURSE · DOCTOR · ADMIN | Toma el control humano de la conversación |
| `POST` | `/simulator/messages` | cualquiera | Simula un mensaje entrante ejecutando el pipeline completo |
| `GET` | `/webhooks/whatsapp` | público | Handshake de verificación de Meta |
| `POST` | `/webhooks/whatsapp` | público (firmado) | Webhook de Meta Cloud API |
| `POST` | `/webhooks/whatsapp/twilio` | público (firmado) | Webhook de Twilio |

## Protocolos, métricas y auditoría

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/protocols` | cualquiera | Protocolos disponibles con sus versiones |
| `GET` | `/protocols/:code` | cualquiera | Protocolo con todas sus reglas aplicables |
| `GET` | `/protocols/rules/global` | cualquiera | Reglas globales del motor determinista |
| `GET` | `/metrics/overview` | cualquiera | Semáforo de pacientes, alertas, contacto efectivo, adherencia y canal |
| `GET` | `/metrics/alerts-timeseries?days=` | cualquiera | Alertas por día y nivel |
| `GET` | `/metrics/top-rules?days=` | cualquiera | Reglas que más se disparan |
| `GET` | `/reports/followup?from=&to=` | ADMIN · DOCTOR | Reporte del periodo |
| `GET` | `/audit-logs` | ADMIN | Bitácora de auditoría (`patientId`, `action`) |

## Ejemplo: del plan a la alerta

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"medico@hospital.gov.co","password":"MedFollow.2026"}' | jq -r .accessToken)

PACIENTE=$(curl -s -X POST localhost:3000/api/patients -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Ana Lopez","documentId":"1234567890","phone":"+573005550000","birthDate":"1980-05-10","sex":"F"}' | jq -r .id)

curl -s -X POST localhost:3000/api/followups -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"patientId\":\"$PACIENTE\",\"diagnosisText\":\"Faringitis viral\",\"diagnosisCode\":\"J02.9\",
       \"instructions\":\"Reposo e hidratacion\",
       \"medications\":[{\"name\":\"Acetaminofen\",\"dose\":\"500 mg\",\"frequencyHours\":8,\"durationDays\":5}]}"

curl -s -X POST localhost:3000/api/simulator/messages -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"patientId\":\"$PACIENTE\",\"text\":\"ACEPTO\"}"

curl -s -X POST localhost:3000/api/simulator/messages -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"patientId\":\"$PACIENTE\",\"text\":\"Tengo 39.5 grados y me cuesta respirar, me siento peor\"}" | jq '.evaluation.level, .alertId'
```
