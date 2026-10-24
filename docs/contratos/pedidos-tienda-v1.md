# Contrato tienda → fábrica v1: lo propio de la fábrica

**Estado:** aceptado (24-10-2026), junto con ADR-0023; implementado en la Fase 19.

**Fuente de verdad:** el repo de la tienda.
- `tienda_puertas/Cotizador/docs/integracion-fabrica.md`
- `src/servidor/integracion-contrato.ts` (esquemas Zod)
- `src/servidor/integracion-firma.ts` (firma de referencia)

Este archivo no repite ese contrato. Solo anota cómo lo cumple la fábrica y los ajustes pedidos a la tienda el 24-10-2026. Un cambio de nombres, tipos, rutas, firma o formatos se acuerda en los dos repos y sube `schemaVersion`.

## 1. Lo que la fábrica acepta tal cual

- **Rutas:**
  - `POST /api/integrations/neltume/orders` (JSON, ≤ 20 MB);
  - `PUT /api/integrations/neltume/attachments/{sha256}` (jpeg, png, webp o pdf, ≤ 10 MB).
- **Firma:**
  - `X-Neltume-Signature: v1=<hex>`, con varias firmas separadas por coma durante una rotación;
  - se calcula como HMAC-SHA256 con clave = UTF-8 del secreto, sobre `UTF8(timestamp) ‖ "." ‖ bytes crudos`;
  - `X-Neltume-Timestamp` dentro de ±300 s;
  - se verifica antes de parsear y en tiempo constante; si falla, 401.
- **Vector compartido:** secreto `clave-de-ejemplo-de-32-caracteres!!`, timestamp `1700000000`, cuerpo `{"a":1}` → `v1=b0803f898b2ee4c6ca49b967fce6ecac5066ef75f4c37f9785b92a47269b7552`. Verificado con `node:crypto` el 24-10-2026.
- **Idempotencia:**
  - `X-Idempotency-Key` = `neltume-store:{sourceOrderId}:PANGUIPULLI:{revision}`, o `neltume-store:attachment:{sha256}` en los adjuntos;
  - misma clave y mismo hash del cuerpo → 200 `duplicate`; otro hash → 409 `idempotency_conflict`;
  - una revisión menor o igual a la guardada, con otro `eventId` → 409 `stale_revision`.
- **Identidad del pedido:** (`source`, `sourceOrderId`, `destinationFactoryCode`) más la revisión mayor recibida.
  - Una `order.ready` con revisión mayor que 1 de un pedido desconocido se crea.
  - Una `order.cancelled` de un pedido desconocido responde 2xx y se recuerda.
- **Éxito:** `{ "status": "accepted" | "duplicate", "eventId", "factoryOrderId", "receivedAt" }`, solo después del commit. `factoryOrderId` es el uuid de `nota_pedido`.
- **Error:** `{ "error": { "code", "message" } }`. La tienda no reintenta un 400, 409, 413, 415 o 422; sí reintenta un 401, 403, 404, 405, 408, 429 o 5xx.

## 2. Cómo usa la fábrica cada parte

| Parte | Uso en la fábrica |
|---|---|
| `order.items` con `isCustom: false` | Si `productCode` existe y está activo en el catálogo, pasa a `pedido_item` con su artículo; la medida solicitada es `dimensions.requested`, y las observaciones van al ítem. Si es desconocido (`IA-…` o una planilla más nueva), **no se rechaza**: la línea entra como ítem «a pedido», marcado «por revisar» (ADR-0023 D3) |
| `order.items` con `isCustom: true` (`ESPECIAL`) | Ítem «a pedido» (sin artículo) que una persona confirma al marcar la nota lista (ADR-0023 D4) |
| `order.commercial` | Se guarda aparte (en `recepcion_tienda.comercial`) y solo se ve con `pedidos.importes.ver`. El precio de la nota de la fábrica sale de su lista vigente sin recargo (NC-12); el de la tienda solo se compara y genera un aviso |
| `order.customer` | Solo se persisten `project` (y `name`, si se aprueba D1). `taxId`, `phone`, `address` y `businessActivity` se descartan sin guardarse (REQ-COT-8.9) |
| `approvedBy`, `issuedBy` | No se guardan |
| `delivery` | Dirección de despacho, transporte y entrega comprometida (texto en observaciones si no es fecha) |
| `documents.commercial` | Se guarda tal cual, con permiso `pedidos.importes.ver` + `clientes.ver`; cada descarga queda auditada |
| `documents.production` | Se guarda y lo descarga quien tiene `pedidos.gestionar`. Si su texto tiene un monto en pesos o no muestra `orderNumber`, el pedido igual se acepta, pero ese PDF queda retenido y se avisa; producción usa la orden de trabajo de la fábrica |
| `items[].references` | Se enlazan por `attachmentId`. Si el adjunto aún no llegó, la referencia queda «pendiente de recibir» y se completa sola con el PUT; el pedido no se rechaza |
| `order.cancelled` | Si la nota está pendiente, sin pagos y sin orden de producción, se cancela (libera la reserva). Si no, queda «anulación solicitada» y responde 202 |
| Revisión mayor | Misma regla: reemplaza una nota pendiente; si no, queda «pendiente de revisión» y responde 202 |

Límites de la fábrica: cada PDF ≤ 8 MB decodificado; cada adjunto ≤ 10 MB, con bytes mágicos acordes a su `Content-Type` (si no, 422).

## 3. Ajustes acordados con la tienda (24-10-2026; D1 aprobado: la tienda envía `null` en los datos del cliente final)

1. `productCode` es siempre el código de la línea del catálogo de la tienda (`MAR-O-2X4-A`); la tienda corrigió su ejemplo. Los códigos desconocidos no se rechazan (§2).
2. `customer.taxId`, `phone`, `address` y `businessActivity`: la tienda los enviará en `null` solo si el usuario aprueba D1; mientras tanto, la fábrica los descarta.
3. Un adjunto ausente no rechaza el pedido. Igual, la tienda sube todos los PUT antes del POST.
4. El PDF de producción no imprime importes. Un «$» escrito a mano en observaciones no se censura en la tienda: la fábrica retiene ese PDF (§2).
5. Códigos de error de la fábrica (`error.code`):

| HTTP | `error.code` |
|---|---|
| 400 | `schema_invalid` |
| 401 | `invalid_signature` (falta una cabecera, el timestamp es inválido o vencido, o la firma no coincide; el motivo va solo en el log de la fábrica) |
| 409 | `idempotency_conflict`, `stale_revision` |
| 413 | `payload_too_large` |
| 415 | `unsupported_media_type` |
| 422 | `unsupported_schema_version`, `destination_mismatch`, `document_invalid` (base64, sha256, `%PDF-` o PDF ilegible), `attachment_hash_mismatch`, `attachment_type_mismatch` |
| 503 | `not_configured` (con `Retry-After`) |
| 500 | `internal` |

## 4. Configuración de la fábrica

Variables solo del servicio `app`:
- `INTEGRACION_TIENDA_SECRETO` y `INTEGRACION_TIENDA_SECRETO_ANTERIOR`: rotación;
- `INTEGRACION_TIENDA_FABRICA=PANGUIPULLI`;
- `INTEGRACION_TIENDA_CLIENTE_RUT`: el cliente de tipo tienda.

El origen público es el hostname del Cloudflare Tunnel de la fábrica, que define el usuario. En desarrollo es `http://localhost:3000`.
