# Contrato de prueba de conexión v1 (fábrica ↔ tienda)

**Estado:** aceptado. Acordado entre los agentes de los dos repos el 25-10-2026 y aprobado por el usuario ese día (ADR-0024); implementado en la Fase 21.

**Alcance:** una familia de eventos nueva y aditiva, igual en los dos sentidos. No cambia `schemaVersion`, `/orders` ni `/attachments` (ver [`pedidos-tienda-v1.md`](pedidos-tienda-v1.md) y `tienda_puertas/Cotizador/docs/integracion-fabrica.md`). Es el único contrato en que la fábrica es la que envía.

**Fuente de verdad:** este archivo y su copia en el repo de la tienda. Un cambio de nombres, tipos, rutas, firma o formatos se acuerda en los dos repos y sube `schemaVersion`.

## 1. Ruta, firma y cabeceras

- `POST /api/integrations/neltume/connection-tests`, **la misma ruta en las dos apps**. `Content-Type: application/json`, cuerpo ≤ 2 MiB (2.097.152 bytes).
- Solo HTTPS con certificado válido y sin seguir redirecciones (HTTP únicamente para `localhost`, `127.0.0.1` y `[::1]`, en desarrollo).
- Sin sesión ni cookies: la única credencial es la firma.
- **Firma y ventana:** idénticas al v1.
  - `X-Neltume-Timestamp` dentro de ±300 s.
  - `X-Neltume-Signature: v1=<hex>` = HMAC-SHA256 de `timestamp + "." + bytes crudos del cuerpo`.
  - Se verifica sobre los bytes crudos, antes de parsear y en tiempo constante.
  - Vale el vector compartido de `pedidos-tienda-v1.md` §1.
- **Secreto:** el mismo que ya comparten para los pedidos (ADR-0024 D2). No hay variables nuevas. Si una app guarda un secreto por fábrica, exige que el que verificó la firma sea el de la fábrica que nombra `factoryCode`.
- **Idempotencia:** `X-Idempotency-Key` debe coincidir carácter a carácter con el cuerpo, y si no, 400 `schema_invalid`.
  - Tienda → fábrica: `neltume-store:connection-test:{eventId}`.
  - Fábrica → tienda: `neltume-factory:connection-test:{eventId}`.
  - Misma clave y mismo hash del cuerpo → 200 `duplicate`; misma clave y otro hash → 409 `idempotency_conflict`.

## 2. Cuerpo

```json
{
  "schemaVersion": "1.0",
  "eventType": "connection.test",
  "eventId": "6f1c2a7e-3b9d-4c51-9a0e-2d7b8f41c6aa",
  "source": "neltume-factory",
  "factoryCode": "PANGUIPULLI",
  "issuedAt": "2026-10-25T15:02:11.384Z",
  "document": { "filename": "prueba-conexion-6f1c2a7e.pdf", "mimeType": "application/pdf", "contentBase64": "JVBERi0xLjQK…", "sha256": "9c1e…(64 hex)…" }
}
```

| Campo | Tipo | Formato |
|---|---|---|
| `schemaVersion` | `"1.0"` | Una versión desconocida se rechaza antes que el resto del esquema (422) |
| `eventType` | `"connection.test"` | |
| `eventId` | UUID | En minúsculas. Único por pulsación del botón |
| `source` | `"neltume-store"` \| `"neltume-factory"` | Quien envía. **Cada receptor exige el de la otra parte**: así un mensaje capturado no sirve en el sentido contrario ni en `/orders` |
| `factoryCode` | string de hasta 40 caracteres | No es un enum: se compara aparte. Es la fábrica del enlace: el destino cuando envía la tienda, el origen cuando envía la fábrica |
| `issuedAt` | ISO 8601 UTC con `Z` | Como `toISOString()` |
| `document.filename` | string | `^[A-Za-z0-9._-]{1,100}\.pdf$`: sin espacios ni tildes |
| `document.mimeType` | `"application/pdf"` | |
| `document.contentBase64` | string | Base64 estándar con relleno y sin saltos de línea. El receptor lo valida volviendo a codificar: tiene que salir idéntico |
| `document.sha256` | string | 64 hex en minúsculas, de los bytes decodificados |

- Esquema estricto: un campo desconocido es 400.
- Sin textos libres ni datos de clientes o importes.
- El PDF tiene ≤ 1 MiB (1.048.576 bytes) decodificado.
- Recomendado, no se valida: una página con el rótulo «PRUEBA DE CONEXIÓN — no es un pedido», el emisor, la fecha y hora de Chile y el `eventId` abreviado (8 caracteres), generada con el generador de PDF propio de cada app.

## 3. Orden de validación del receptor

Primero lo barato; nada se guarda antes del último paso.

1. **Antes de la firma y sin leer el JSON:** método distinto de POST (405), secreto sin configurar (503 `not_configured`, con `Retry-After`), `Content-Type` distinto de `application/json` (415) y cuerpo > 2 MiB (413 `payload_too_large`).
   - El orden entre estos cuatro no es parte del contrato. Si falla más de uno a la vez, vale cualquiera de sus códigos.
   - Cada app prueba un fallo por vez.
2. Firma y timestamp (401 `invalid_signature`; el motivo va solo en el registro del receptor).
3. JSON ilegible (400 `schema_invalid`).
4. `schemaVersion` distinta de `"1.0"` (422 `unsupported_schema_version`), antes que el resto del esquema.
5. Esquema estricto, `source` de la otra parte, `eventType` y `X-Idempotency-Key` igual al del `eventId` (400 `schema_invalid`).
6. `factoryCode` que no es la fábrica cuyo secreto verificó la firma (422 `destination_mismatch`).
7. PDF decodificado > 1 MiB (413 `payload_too_large`).
8. Documento (422 `document_invalid`): base64 canónico, `sha256`, firma `%PDF-` y PDF **íntegro**.
   - Cada app elige cómo comprobarlo. La fábrica lo abre con pdfjs, igual que los de los pedidos. La tienda revisa su estructura: cabecera, `startxref` que apunta a un `xref` u objeto y `%%EOF` al final.
9. Idempotencia (200 `duplicate` o 409 `idempotency_conflict`).
10. Guardar y responder 201. **2xx solo después del commit.**

## 4. Respuestas

Éxito: `201 accepted` (nuevo) o `200 duplicate`.

```json
{ "status": "accepted", "eventId": "6f1c2a7e-3b9d-4c51-9a0e-2d7b8f41c6aa", "receiver": "neltume-store", "receivedAt": "2026-10-25T15:02:12.071Z" }
```

- `receiver` es la app que contesta (`neltume-factory` o `neltume-store`). El emisor lo compara con la que espera, y `eventId` con el que mandó. Un 2xx que no coincide, o cuyo cuerpo completo no es la confirmación, cuenta como fallo: «Respondió otra aplicación». Si el cuerpo no termina de llegar, es un fallo de red (§6).
- `receivedAt` es el reloj del receptor. Con él, el emisor avisa en pantalla, sin fallar, si los relojes difieren en más de 60 s (la ventana es de 300 s).

Error: `{ "error": { "code", "message" } }`, sin datos del mensaje ni secretos.

| HTTP | `error.code` |
|---|---|
| 400 | `schema_invalid` (esquema, `source` propio, clave de idempotencia que no corresponde) |
| 401 | `invalid_signature` |
| 405 | (método distinto de POST) |
| 409 | `idempotency_conflict` |
| 413 | `payload_too_large` (cuerpo > 2 MiB o PDF > 1 MiB) |
| 415 | `unsupported_media_type` |
| 422 | `unsupported_schema_version`, `destination_mismatch`, `document_invalid` |
| 503 | `not_configured` (con `Retry-After`) |
| 500 | `internal` |

## 5. Un intento, sin bandeja

- Una pulsación es un envío: sin reintentos ni cola. Si falla, se aprieta de nuevo con otro `eventId`.
- Plazo de 15 s y respuesta leída hasta 64 KB.
- El emisor muestra el resultado y su diagnóstico en el momento (§6).

## 6. Diagnóstico común de las dos pantallas

| Situación | Texto |
|---|---|
| Falta la URL o el secreto | «Falta configurar …» (el nombre de la variable, nunca su valor) |
| Red, DNS o plazo agotado | «No se pudo conectar con la otra app: …» |
| Redirección (se rechaza) | «No se pudo conectar: redirección inesperada (¿Cloudflare Access?)» |
| 401 | «La otra app rechazó la firma: el secreto no coincide o los relojes difieren en más de 5 minutos» |
| 403 | «La otra app rechazó el acceso (403): revisa el Host permitido o el acceso por Cloudflare» |
| 404 o 405 | «La otra app aún no tiene esta ruta (versión sin desplegar)» |
| 503 `not_configured` | «La otra app no tiene configurada la integración» |
| 400, 409, 413, 415 o 422 | El `error.code` tal cual |
| 429 u otro 5xx | «La otra app respondió {status}» |
| 2xx con `receiver` o `eventId` distinto, o con un cuerpo completo que no es la confirmación | «Respondió otra aplicación» |
| 2xx cuyo cuerpo no termina de llegar (se cuelga o se corta) | Como un fallo de red: «sin respuesta en N ms» o «No se pudo conectar…», nunca «Respondió otra aplicación» |
| 2xx correcto | «Aceptada en N ms» (y, si el desfase de reloj pasa de 60 s, un aviso) |

## 7. Conservación, auditoría y pantalla

- Cada app guarda lo que **recibe** y lo que **envía**, con el PDF de las últimas 20 por sentido. Qué se conserva de las anteriores lo decide cada app: la tienda guarda un año el resultado sin PDF y la fábrica lo deja en su auditoría.
- Cada app muestra ambas listas en sus Ajustes, con acceso al PDF, solo a la administración. La ruta que sirve el PDF exige sesión y no se cachea (`cache-control: private, no-store`, `x-content-type-options: nosniff`).
- Cada app decide si el PDF se abre en el visor del navegador o se descarga. Un `content-security-policy: sandbox` no impidió abrirlo en el visor de Chrome 155 (lo probó el agente de la tienda, con y sin los encabezados de su app); en Safari y Firefox no se probó.
- Auditoría:
  - Solo se audita una recepción con firma válida.
  - Lo rechazado por firma, tipo o tamaño queda en el registro sin cuerpo, para que quien no tenga el secreto no llene la base.
  - En la fábrica, los rechazos de firma se agregan por IP, como en ADR-0023 §2.
- Una prueba **no** crea pedidos, cotizaciones ni reservas, ni toca los datos de integración de los pedidos.

## 8. Configuración

| Lado | Variable | Uso |
|---|---|---|
| Fábrica | `INTEGRACION_TIENDA_SECRETO` (servicio `app`) | Firma el envío y verifica la recepción. Ya existe |
| Fábrica | `ENLACE_TIENDA_URL` (servicio `enlace`) | Origen de la app de la tienda, sin ruta |
| Tienda | `NELTUME_FABRICA_PANGUIPULLI_URL` y `NELTUME_FABRICA_PANGUIPULLI_SECRETO` | Las mismas de los pedidos; sin variables nuevas. Para recibir basta el secreto; para enviar hacen falta los dos |

- En la fábrica el envío sale por el servicio `enlace` (ADR-0024 D1). Es un detalle interno: al contrato solo le importa que el mensaje llegue firmado a la ruta.
- **Cloudflare Access:** si la app receptora está detrás de Access, `/api/integrations/*` necesita una regla Bypass (la protege la firma) o un service token (`CF-Access-Client-Id` y `CF-Access-Client-Secret`) que el emisor tendría que enviar. Sin eso, el emisor ve una redirección o un 403 de Cloudflare antes de llegar a la app.
  - Ninguna de las dos está detrás de Access: el usuario confirmó el 25-10-2026 que `https://cotizador.puertasneltume.cl` no lo tiene (el README de la tienda lo describe como una opción), y la fábrica tampoco (ADR-0010).
  - Ninguna app restringe `/api/integrations/*` por IP; si el usuario quiere filtrar, es una regla de Cloudflare con la IP de salida del otro lado.
  - La tienda valida que el `Host` esté en `NELTUME_HOSTS`.

## 9. Prueba en desarrollo

Fábrica en `http://localhost:3000` y tienda en `http://127.0.0.1:3001` (con `127.0.0.1` y no `localhost`, porque `next dev` de la tienda escucha solo en IPv4), con el mismo secreto en las dos. Se aprieta el botón de cada app y el PDF debe aparecer en la lista de la otra, con el mismo código corto de evento.
