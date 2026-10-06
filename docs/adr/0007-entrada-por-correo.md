# ADR-0007 — Entrada de pedidos por correo (Gmail)

**Estado:** rechazado (06-10-2026): la empresa no usa Google Workspace; se descarta la entrada por correo y sigue vigente ADR-0003 · **Fecha:** 06-10-2026 · **Refs:** ADR-0003, REQ-COT-2.x, 4.4, 11 (nuevo), SECURITY T1, T4, T6 · **Reemplazaba en parte:** ADR-0003 (no aplica)

## Contexto
ADR-0003 dejó la webapp como único canal: el vendedor copia el texto del correo a mano. Fase 4 (P3) pide evaluar un canal automático. Ya se cumplen los prerrequisitos técnicos: el cotizador interno pasó la evaluación de AI.md §6 con `gemini-3.5-flash` (ADR-0001) y existen la cola `trabajo_ia`, la redacción de datos personales y la revisión humana obligatoria. El usuario eligió **correo** (no WhatsApp).

## Decisión propuesta
1. **Un buzón dedicado** de Google Workspace (p. ej. `pedidos@…`). Solo ese buzón se lee; nunca el correo personal de nadie.
2. **Lectura por consulta saliente, sin webhooks.** El worker consulta la Gmail API cada 2 minutos (`users.messages.list` con la etiqueta `Pedidos/Nuevo`). Así no se expone ningún endpoint público nuevo: Cloudflare Tunnel sigue publicando solo la app (SECURITY §6). Se descarta Pub/Sub push porque exige un endpoint de entrada.
3. **Credenciales mínimas.** OAuth con el alcance `gmail.modify`, usado solo para leer y mover etiquetas; no envía ni borra. El refresh token vive en `.env` (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_BUZON`), nunca en el repositorio.
4. **Cada correo crea un borrador**, igual que pegar el texto:
   - Se extrae el cuerpo en texto plano, sin citas de respuestas previas, firmas, HTML ni adjuntos, con un máximo de 4.000 caracteres.
   - Se crea una cotización `interpretando` con `origen = 'correo'` y se encola en `trabajo_ia`.
   - El mensaje pasa a la etiqueta `Pedidos/Procesado`.
   - El id de Gmail es único en la BD: un mismo correo nunca crea dos borradores.
5. **Nada sale sin una persona** (REQ-COT-4.4). No hay respuesta automática ni acuse de recibo; el PDF se envía a mano como hoy.
6. **Remitente.**
   - Se guarda el correo del remitente como dato personal (SECURITY §4); al LLM solo va el cuerpo, ya enmascarado.
   - Si el remitente coincide con el correo de un cliente, se sugiere ese cliente y la persona lo confirma.
   - Si `Authentication-Results` no trae DKIM o SPF `pass` con DMARC alineado, el borrador lleva la alerta «remitente no verificado» (SECURITY T6). No hay lista blanca: cualquier cliente puede escribir, pero todo pasa por revisión.
7. **Topes.** Máximo 30 correos por hora; el exceso queda en el buzón para el ciclo siguiente. Comparte el tope diario y el presupuesto de IA (`LLM_TOPE_DIARIO_USD`, `LLM_PRESUPUESTO_MENSUAL_USD`). Si se alcanza el tope, el borrador queda en `ia_fallida` y se cotiza a mano.
8. **Auditoría.** Actor `sistema` con origen `correo`. Cada correo leído, descartado o convertido deja una fila en `audit_log` con el id de Gmail, nunca el cuerpo.

## Consecuencias
- El vendedor ya no copia y pega. Los pedidos por correo aparecen en el panel como «Para revisar» con la marca «correo».
- Superficie nueva: un token OAuth con acceso a un buzón. Mitigaciones: buzón dedicado, alcance mínimo, sin envío, rotación documentada en el RUNBOOK y revocación desde la consola de Google.
- Correos que no son pedidos (spam, publicidad) generan borradores «sin ítems». Se descartan con un clic, sin costo de aprobación y con un costo de IA acotado por los topes. Si resulta molesto, se agrega un filtro de Gmail o una lista de remitentes descartados.
- Los adjuntos (planos, PDF, fotos) no se interpretan en esta versión: el borrador avisa «tiene N adjuntos, revisar en el correo».

## Requisitos nuevos (se agregan a SPEC.md al aprobar)
- **REQ-COT-11.1:** WHEN llega un correo al buzón de pedidos THE SYSTEM SHALL crear un borrador con su texto y encolarlo para la IA, una sola vez por correo.
- **REQ-COT-11.2:** THE SYSTEM SHALL no responder ni enviar nada al remitente sin acción humana.
- **REQ-COT-11.3:** IF el remitente no pasa DKIM/SPF/DMARC THEN THE SYSTEM SHALL marcar el borrador como «remitente no verificado».
- **REQ-COT-11.4:** THE SYSTEM SHALL enviar al LLM solo el cuerpo enmascarado, nunca el remitente ni los adjuntos.
- **REQ-COT-11.5:** IF se supera el tope por hora o el de gasto THEN THE SYSTEM SHALL dejar los correos para el ciclo siguiente o el borrador en `ia_fallida`, sin perder ninguno.

## Tareas tentativas (se pasan a TASKS.md al aprobar)
Migración `correo_entrante` y `cotizacion.origen = 'correo'` · adaptador Gmail en `src/correo/` con un doble determinista para las pruebas · extracción del texto (citas, firmas, HTML) con tests de casos reales anonimizados · ciclo de consulta en el worker con tope y auditoría · marca «correo» y «remitente no verificado» en el panel y la revisión · E2E 15 con el doble de Gmail · RUNBOOK: crear el buzón, el cliente OAuth y la rotación del token.

## Qué necesito de ti para aprobar
1. Confirmar que existe o se puede crear un buzón dedicado de Google Workspace, y quién crea el cliente OAuth en Google Cloud.
2. Aprobar este ADR («APROBADO ADR-0007»); recién ahí se actualizan SPEC, SECURITY y TASKS y empieza el código.

## Alternativas
- **IMAP con contraseña de aplicación:** más simple, pero Google la restringe y da acceso total al buzón.
- **Pub/Sub push:** latencia menor, pero exige un endpoint público.
- **Reenvío a un servicio de entrada (SendGrid/Mailgun):** agrega un proveedor y un webhook.
- **WhatsApp Business API:** el usuario lo dejó para después; tiene costo por conversación y otra superficie.
