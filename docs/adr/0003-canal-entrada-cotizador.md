# ADR-0003 — Canal de entrada del cotizador: solo webapp

**Estado:** aceptado; **modificado por ADR-0023** (24-10-2026): además de la webapp, entra la API firmada de la tienda, solo para sus notas de pedido · **Fecha:** 05-10-2026 · **Refs:** REQ-COT-2.x, 4.4, SECURITY T6

## Contexto
El brief contemplaba la webapp, Gmail y WhatsApp. En la entrevista (Fase 0) el usuario eligió **solo webapp** y **siempre aprobación humana**.

## Decisión
- Los pedidos entran únicamente cuando un usuario autenticado pega o escribe el texto en la webapp.
- No hay webhooks, buzones ni integraciones de mensajería. La salida es un PDF que el usuario descarga y envía por su cuenta.

## Consecuencias
- Desaparecen la superficie de webhooks y el riesgo de suplantación de remitente (T6 no aplica en v1).
- Todo pedido pasa por una persona antes y después de la IA.
- El vendedor copia el texto del correo o chat a mano: es un costo operativo aceptado.
- Si en el futuro se habilita un canal, requerirá un ADR nuevo con validación de firma, lista de remitentes y borrador obligatorio.

## Alternativas
Gmail (OAuth + Pub/Sub) y WhatsApp Business API: descartados por ahora por alcance, costo y superficie de ataque.
