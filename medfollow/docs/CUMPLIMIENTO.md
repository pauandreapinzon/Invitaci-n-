# Seguridad y cumplimiento

Marco aplicable en Colombia: **Ley 1581 de 2012** y **Decreto 1377 de 2013** (protección de datos
personales y datos sensibles de salud), **Resolución 1995 de 1999** (historia clínica y
trazabilidad) y **Ley 23 de 1981** (ética médica).

## Controles implementados

| Control | Implementación |
|---|---|
| Cifrado de datos sensibles en reposo | AES-256-GCM sobre documento de identidad, teléfono y contenido de cada mensaje (`EncryptionService`). La clave vive fuera de la base de datos: un volcado de la base no revela PHI. |
| Autenticidad del dato cifrado | GCM con etiqueta de autenticación: un registro alterado falla al descifrar en lugar de devolver datos corruptos (verificado por prueba). |
| Seudonimización | El teléfono se busca por HMAC-SHA256, de modo que el webhook identifica al paciente sin almacenar el número en claro en los índices. |
| Consentimiento informado digital | Texto versionado (`2026.1`) enviado por el canal, con registro de la aceptación, el mensaje que la constituye y la fecha. `RETIRO` revoca y cancela los seguimientos activos. |
| Control de acceso por roles | Guardas globales JWT + rol (ADMIN, DOCTOR, NURSE) y aislamiento multi-tenant por hospital tomado del token, no del cliente. |
| Trazabilidad completa | `AuditLog` registra autenticación, lectura y escritura de datos de pacientes, lectura de conversaciones, evaluaciones de riesgo, creación y cierre de alertas, consentimiento y envíos. |
| Reconstrucción de decisiones clínicas | Cada `RiskScore` guarda versión del motor y del protocolo, reglas evaluadas, reglas disparadas con su evidencia y el snapshot de entrada. |
| Minimización en la interfaz | El dashboard muestra el teléfono enmascarado; ver el dato completo es una acción explícita que queda auditada. |
| Autenticidad del canal | Validación de firma `X-Hub-Signature-256` (Meta) y `X-Twilio-Signature` (Twilio) con comparación en tiempo constante. |
| Límites de abuso | Rate limiting global y específico en los webhooks; `helmet` y CORS restringido por configuración. |
| Seguridad de credenciales | Contraseñas con bcrypt (coste 12); la aplicación se niega a arrancar en producción sin las claves PHI. |
| Segregación clínica | La IA no decide alertas; en riesgo rojo el mensaje al paciente es texto literal de la regla, y ningún mensaje con dosis, prescripción o diagnóstico sale al paciente. |

## Lo que falta para un despliegue institucional

Esta es una implementación de referencia. Antes de tratar datos reales de pacientes se requiere:

1. **TLS 1.3 y HSTS** en el borde (balanceador o ingress); la aplicación habla HTTP detrás del proxy.
2. **Gestión de claves en Key Vault / HSM** con rotación programada y reencriptado de PHI, en lugar
   de variables de entorno.
3. **Bitácora inmutable**: `AuditLog` es append-only por diseño de la aplicación, pero debe
   respaldarse en almacenamiento WORM o con firma encadenada, y retenerse según la Resolución 1995.
4. **Política de retención y supresión** por tipo de dato, con el procedimiento de atención de
   derechos del titular (consulta, rectificación, supresión, revocatoria).
5. **Aprobación del comité médico** de cada protocolo y regla, con registro de quién aprueba y
   cuándo (los campos `approvedBy` y `approvedAt` ya existen en el modelo).
6. **Acuerdos de tratamiento de datos** con los proveedores de IA y de WhatsApp, incluyendo
   residencia de datos; con Azure OpenAI o Claude en entorno empresarial, y desactivando el envío de
   identificadores directos al modelo.
7. **Pruebas de seguridad** (pentest, análisis de dependencias, revisión de secretos) y plan de
   respuesta a incidentes con notificación a la SIC.
8. **Validación clínica prospectiva** del motor de reglas: sensibilidad y especificidad medidas
   contra desenlaces reales, con el indicador del PRD (detectar más del 90 % de las alertas críticas
   definidas por protocolo) verificado sobre datos del hospital.
9. **Registro sanitario / clasificación como software de dispositivo médico** según el uso previsto
   declarado; el alcance actual (monitoreo y escalamiento, sin diagnóstico ni prescripción) debe
   mantenerse explícito en la documentación del producto.
