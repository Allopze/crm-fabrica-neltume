# ADR-0009 — Proveedor/modelo en Ajustes y claves en el worker

**Estado:** aceptado · **Fecha:** 06-10-2026 · **Refs:** REQ-ADM-4.x, REQ-COT-2.x, REQ-NFR-5 · actualiza ADR-0001 y SECURITY T5.

## Contexto

El cotizador usaba Command Code desde variables `CMD_*`. Se requiere elegir Command Code o Groq, consultar modelos y sus precios o límites desde Ajustes y mantener las claves del proveedor fuera de la app web y de la auditoría.

## Decisión

- `/administracion/ia` y `GET/PUT /api/v1/ajustes/ia` requieren `config.editar`. Ajustes guarda proveedor, modelo y confirmación ZDR de Groq. `CMD_API_KEY` y `GROQ_API_KEY` se configuran en `.env.worker.local` durante desarrollo y como variables privadas solo del servicio `worker` en producción. API/UI/logs/auditoría no reciben ni persisten nuevas claves.
- El worker actualiza y cachea el catálogo autenticado de cada proveedor. Command Code se cruza con precios publicados por millón de tokens. Groq se cruza con el catálogo autenticado y la tabla pública Free de RPM/RPD/TPM/TPD; esta es una referencia, la cuota exacta se consulta en Console. Los modelos Preview, no conversacionales o sin soporte de herramienta/precio se muestran deshabilitados con motivo.
- Ambos adaptadores fuerzan la herramienta estricta `proponer_items`. Command Code envía `x-cmd-zdr: 1`; Groq exige la confirmación de un administrador de que ZDR está activo en Console, porque la API no permite verificar ese ajuste.
- La activación de proveedor/modelo es inmediata. `npm run eval:ia` queda como verificación informativa, no como autorización técnica. Ningún cambio quita la aprobación humana de la cotización.
- El worker captura proveedor/modelo en la misma transacción que toma cada trabajo y usa la clave del proveedor desde su entorno. Una edición posterior aplica al trabajo siguiente; rotar una clave requiere reiniciar el worker. Un 429 respeta `Retry-After` hasta 30 s; valores mayores no se reintentan antes de tiempo y terminan en la ruta de cotización manual.

## Consecuencias

- Las claves nuevas no se guardan en la base ni se requieren claves RSA. En desarrollo `.env.worker.local` está ignorado por git; en producción Compose solo inyecta API keys a `worker`.
- No hay ruta de claves cifradas en la base: la configuración guarda solo proveedor, modelo, confirmación ZDR y fecha. Un borrador anterior de esta fase que cifraba claves en el navegador nunca se publicó y se retiró; si una base de desarrollo conserva datos extra en `ia.proveedores.config`, se ignoran y se eliminan al guardar Ajustes.
- Tarifas Command Code y cuotas Groq pueden cambiar; la UI muestra fecha y conserva la última copia válida si una consulta externa falla.
- El gasto real Groq no se estima a partir de límites Free. Si el proveedor no entrega un precio, `llamada_ia.costo_usd` permanece vacío.

## Fuentes oficiales

- [Command Code Provider API y catálogo](https://commandcode.ai/docs/provider)
- [Precios de Command Code](https://commandcode.ai/docs/resources/pricing-limits)
- [Modelos Groq](https://console.groq.com/docs/models) y [uso de herramientas](https://console.groq.com/docs/tool-use/overview)
- [Límites Groq](https://console.groq.com/docs/rate-limits) y [Zero Data Retention](https://console.groq.com/docs/your-data)
