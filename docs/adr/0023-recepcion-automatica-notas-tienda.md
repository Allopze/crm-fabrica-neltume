# ADR-0023 — Recepción automática de las notas de pedido de la tienda

**Estado:** aceptado (aprobado por el usuario el 24-10-2026, con D1–D5 en sus valores por defecto; Fase 19) · **Refs:** REQ-COT-8.5–8.9, 8.17, REQ-STK-7.x, REQ-NFR-5, NC-12, AGENTS reglas 2, 5, 6, 7, 8 y 10, SECURITY T2, T6 y T9 · **Modifica:** ADR-0003 (suma un canal de entrada) · **Complementa:** ADR-0008 (la carga del PDF queda como respaldo) · **Complementado por:** ADR-0024 (la prueba de conexión, en los dos sentidos, con su propia ruta firmada) · **Contrato:** [`docs/contratos/pedidos-tienda-v1.md`](../contratos/pedidos-tienda-v1.md)

## Contexto

**Cómo llegan hoy los pedidos (auditoría del 24-10-2026):**
- La tienda (`tienda_puertas/Cotizador`) genera **una nota por fábrica** desde el 23-10-2026: Panguipulli hace las puertas sólidas y Santiago las enchapadas. Cada fábrica tiene su propio correlativo (Panguipulli parte en 577).
- La nota sale a precio de fábrica (margen 0) e incluye:
  - los datos del cliente final (nombre, RUT, giro, dirección y teléfono);
  - el despacho, las líneas con su código de catálogo y la medida pedida en mm (hoja o vano);
  - las observaciones.
- La tienda envía la nota como PDF y la fábrica tiene dos caminos:
  - subirla aquí con vista previa y confirmación (ADR-0008);
  - o transcribirla a Excel para preparar el trabajo, que es lo que hace Bea.
- **El lector de ADR-0008 ya no lee el formato nuevo.** Con `ejemplo-nota-pedido-panguipulli-577.pdf` falla con «La nota no tiene ítems con código del catálogo», porque ahora el código va dentro de «Referencia de catálogo: NEL-O-3-A · …». La nota antigua (`ejemplo-nota-pedido-1.pdf`) se sigue leyendo. Hoy, por lo tanto, solo queda transcribir.
- La planilla Excel de Bea **no está en el repo**. `datos/NOTA DE PEDIDO_PTAS SOLIDAS_N°.xlsx` es la nota con precios de la fábrica, y la app ya la reemplaza. No se sabe qué columnas transcribe Bea (pendiente P1).

**Qué se reutiliza:**

| Necesidad | Lo que existe |
|---|---|
| Pedido de la tienda | `nota_pedido` + `pedido_item`, con origen `nota_tienda`, `ref_externa` y el cliente de tipo `tienda` (ADR-0008) |
| Alta, reserva y auditoría | `insertarPedido` (`src/domain/pedidos/pedidos.ts`). Bloquea los artículos y reserva lo disponible |
| Precio | La lista vigente sin recargo (NC-12), con aviso si la nota trae otro precio (`prepararNotaTienda`) |
| Orden de trabajo | Ciclo `pendiente → en_produccion → lista → despachada`. Pasar a producción crea la `orden_produccion` por el faltante (REQ-COT-8.5). A la tienda no se le exige abono (REQ-COT-8.17) |
| Medidas especiales | `pedido_item.medida_solicitada` y los ítems «a pedido» (`articulo_id` nulo), que una persona confirma al marcar la nota lista |
| PDF | react-pdf con los componentes de `src/domain/pdf/comun.tsx` |
| Auditoría | `registrarAuditoria` y las denegaciones anónimas agregadas (ADR-0016) |

**Huecos:**
- No hay ningún documento operativo sin precios. Quien tiene `pedidos.gestionar` ve los importes en la lista, en la ficha, en `GET /pedidos/:id` y en el PDF de la nota.
- No hay entrada sin sesión, salvo el login.

## Decisión

> **Nota del 24-10-2026.** La tienda ya implementó su lado con su propio contrato v1 (`tienda_puertas/Cotizador/docs/integracion-fabrica.md`), que se adopta como fuente de verdad (ver [contrato](../contratos/pedidos-tienda-v1.md)). Respecto de lo que sigue, cambian cinco cosas:
> - se agrega `PUT /api/integrations/neltume/attachments/{sha256}`, con las referencias del cliente;
> - `order.cancelled` entra en v1 con la misma regla que las revisiones, y D5 queda resuelta así;
> - la idempotencia usa la clave `neltume-store:{sourceOrderId}:PANGUIPULLI:{revision}`;
> - los precios de la tienda llegan en `order.commercial`, separados de los ítems;
> - el cuerpo llega hasta 20 MB, y cada PDF hasta 8 MB.
>
> Además, un PDF de producción con montos se retiene, en vez de rechazar el pedido.

### 1. Un canal nuevo y solo uno
- `POST /api/integrations/neltume/orders`, en la ruta acordada con la tienda, fuera de `/api/v1`.
- Lo envuelve `integracion()`, una tercera envoltura junto a `conPermiso` y `publico`. El test estructural la admite **solo** bajo `src/app/api/integrations/**`.
- Sin sesión, cookies ni CSRF. La única credencial es la firma HMAC.
- Sigue sin haber `/webhooks/*`, ni correo, ni mensajería (ADR-0003). Lo que cambia es que «único canal: la webapp» pasa a «la webapp y la API firmada de la tienda».

### 2. Autenticación y orden de validación
Primero lo barato; ninguna nota ni documento se escribe antes del paso 8 (solo la auditoría de los rechazos).

1. Cuerpo ≤ 20 MB (413 `payload_too_large`) y `Content-Type: application/json` (415). Sin secreto configurado, 503 `not_configured`.
2. Las tres cabeceras (401):
   - `X-Neltume-Timestamp` dentro de ±300 s;
   - `X-Neltume-Signature` = `v1=` + HMAC-SHA256 de `timestamp + "." + bytes del cuerpo`, comparada con `timingSafeEqual`;
   - `X-Idempotency-Key` = `eventId` (se verifica en el paso 3).

   La firma se calcula sobre los bytes crudos, **antes** de parsear el JSON. Durante una rotación se acepta también el secreto anterior.
3. JSON y esquema Zod estricto y versionado (`schemaVersion` "1.0"): 400. El esquema vive en `src/domain/integracion-tienda/contrato.ts`.
4. `destinationFactoryCode` = `PANGUIPULLI` (configurable): si no, 422 `destination_mismatch`. Una `schemaVersion` desconocida, 422 `unsupported_schema_version`.
5. Documentos: base64 estricto, ≤ 8 MB cada uno, `sha256` coincidente, firma `%PDF-` y `pdfjs-dist` capaz de abrirlos; si no, 422 `document_invalid`. El comercial debe mostrar el `orderNumber`. Si el de producción trae montos en pesos o no muestra el número, el pedido entra igual, pero ese PDF queda retenido y no se sirve.
6. Cada `productCode` se busca en el catálogo activo. Un código desconocido **no** rechaza el pedido: esa línea entra como ítem «a pedido, por revisar» (decisión D3).
7. Idempotencia y revisión (§4).
8. Transacción única (§3).

Cada rechazo de autenticación se audita como denegación anónima agregada (ADR-0016) y queda en el log JSON con motivo e IP, nunca con el secreto, la firma ni el cuerpo. Los rechazos 4xx autenticados se auditan con `resultado = error`, el `sourceOrderId` y el código.

### 3. Una sola transacción, o nada
`recepcion_tienda` → `nota_pedido` + `pedido_item` + reservas (vía `insertarPedido`) → `documento_tienda` ×2 → auditoría.
- Si algo falla, la transacción se revierte, se responde 5xx y la tienda reintenta con el mismo `eventId`.
- Nunca se responde éxito sin el commit.

### 4. Idempotencia persistente y revisiones
- Tabla `recepcion_tienda`:
  - únicos `event_id` y (`source_order_id`, `revision`);
  - `hash_contenido`: SHA-256 del cuerpo sin `issuedAt`;
  - `nota_pedido_id`, `estado` (`incorporada`, `pendiente_revision`, `anulacion_solicitada`, `aplicada`, `descartada`, `cancelada`, `registrada`), `payload` jsonb (el mensaje sin PDF, sin lo comercial y, del cliente final, solo el proyecto) y `comercial` jsonb aparte.
- El INSERT usa `ON CONFLICT DO NOTHING` dentro de la transacción. Una petición simultánea espera al índice único y termina como duplicada, sin depender de «consultar primero».
- Mismo evento o misma revisión con el mismo contenido → 200 `duplicate` con el mismo `factoryOrderId`. Con otro contenido → 409.
- **Revisión mayor (D2):**
  - Si la nota vigente sigue `pendiente`, sin pagos y sin orden de producción, se aplica sola: se cancela la anterior con el motivo «reemplazada por la revisión N de la tienda» (lo que libera su reserva) y se crea la nueva, ligada con `reemplaza_id`. Responde 201.
  - Si no, queda `pendiente_revision` y responde 202. La ficha muestra «La tienda envió la revisión N» con sus diferencias y dos acciones con motivo: **Aplicar** (cancelar y crear, igual que arriba) o **Descartar**. Así no se sobrescribe nada que ya está en producción.
- Una revisión menor que la vigente → 409 `REVISION_OBSOLETA`.
- Unicidad de la nota: hoy es (`cliente_id`, `ref_externa`). Pasa a (`cliente_id`, `ref_externa`, `revision_externa`) para que una revisión con el mismo número quepa.
- La nota subida en PDF (ADR-0008) cuenta como revisión 1. Si llega por API una nota que ya se subió en PDF, se responde 200 `duplicate` con esa nota.

### 5. Cómo entra al flujo de la fábrica
- La nota se crea con origen `tienda_api`, `ref_externa` = `orderNumber` y `revision_externa`.
- **Cliente:** el de tipo `tienda` cuyo RUT dice `INTEGRACION_TIENDA_CLIENTE_RUT`; si falta, 503.
- **Datos:** `proyecto` = `customer.projectName`. El despacho, el transporte y las observaciones van tal como vienen. `entrega_comprometida` = `committedDate`; si solo llega `committedText`, el texto se suma a las observaciones.
- **Ítems:**
  - `catalog` → artículo, descripción del catálogo, cantidad, y la medida solicitada en el formato de la app («800 × 2000 mm, hoja»), con las observaciones del ítem.
  - `special` → ítem «a pedido» (D4).
- **Precio:** la lista vigente sin recargo (NC-12), como en ADR-0008. El precio de la tienda solo se compara (aviso) y queda en `payload`; nunca entra en precios ni totales (SECURITY T2).
- **Estado:** `pendiente`, con la reserva de lo disponible (regla 5, REQ-STK-7.1). **No se pasa a producción, no se marca lista ni se aprueba nada solo.** Pasar a producción sigue siendo la acción humana de siempre, que crea la orden por el faltante.
- **Autor:** un usuario técnico «Integración tienda», creado por la migración. Está inactivo, así que no puede iniciar sesión, y tiene un rol sin permisos. Firma `creado_por` y los movimientos de reserva, que exigen usuario. En la auditoría va `actor_tipo = sistema`, `origen = api`.

### 6. Documentos
- Tabla `documento_tienda`: `recepcion_id`, `tipo` (`comercial`/`produccion`), `contenido` bytea, `sha256`, `bytes`, `nombre_origen` (solo informativo), `retenido` y `motivo_retencion`. Los adjuntos del cliente van en `adjunto_tienda`, por su sha256.
- Es de solo inserción (trigger): un documento no se cambia, se agrega otro con la revisión nueva.
- Al estar en la BD, entra en los respaldos sin rutas de disco que manipular.
- Rutas, ambas con `cache-control: private, no-store`, `x-content-type-options: nosniff` y `content-security-policy: sandbox`, y auditadas:
  - `GET /api/v1/pedidos/:id/documentos/produccion` (`pedidos.gestionar`);
  - `GET /api/v1/pedidos/:id/documentos/comercial` (`pedidos.importes.ver` + `clientes.ver`).
- El nombre de descarga lo arma la app («Neltume - Nota de la tienda N.º 577 rev 1 (producción).pdf»).

### 7. Orden de trabajo sin precios, para toda nota
- `GET /api/v1/pedidos/:id/orden-trabajo` (`pedidos.gestionar`): un PDF de la fábrica armado desde los datos estructurados, no desde el PDF de la tienda.
- Contiene: N.º de nota de la fábrica, N.º y revisión de la nota de la tienda, proyecto, despacho, transporte, entrega, observaciones y, por línea, código, descripción, medida solicitada, cantidad y por fabricar, con casilla «Listo» y firmas.
- **No lleva** columnas, totales ni metadatos de importes, ni datos personales del cliente final.
- Sirve también para las notas que vienen de una cotización.
- Es lo que reemplaza la planilla de Bea, una vez confirmadas sus columnas (P1).
- Botón «Orden de trabajo» en la ficha, junto al PDF actual.

### 8. Importes solo con permiso
- Permiso nuevo: `pedidos.importes.ver`. La migración se lo da al rol `administrador`.
- Sin ese permiso:
  - `GET /pedidos`, `GET /pedidos/:id`, la lista, la ficha y el panel no devuelven precio, total, pagado, saldo ni pagos (los omite el servidor, no la vista);
  - `GET /pedidos/:id/pdf` (la nota con precios) y el documento comercial dan 404.
- Así se puede crear un perfil «Producción» como datos, sin código, con `pedidos.gestionar`, `produccion.gestionar` y `stock.ver`. Ese perfil ve y opera la nota y su orden de trabajo sin ver un peso.

### 9. Configuración
Solo en el servicio `app`, nunca en el navegador, los logs ni la BD:

| Variable | Uso |
|---|---|
| `INTEGRACION_TIENDA_SECRETO` | ≥ 43 caracteres base64url (32 bytes). Vacía = endpoint desactivado → 503 |
| `INTEGRACION_TIENDA_SECRETO_ANTERIOR` | Opcional, durante una rotación |
| `INTEGRACION_TIENDA_FABRICA` | `PANGUIPULLI` |
| `INTEGRACION_TIENDA_CLIENTE_RUT` | RUT del cliente de tipo tienda |

RUNBOOK suma dos cosas:
- la rotación del secreto;
- una regla opcional de Cloudflare que solo deja llegar a `/api/integrations/*` desde la IP de salida del servidor de la tienda. La firma basta, pero el borde descarta el ruido.

### 10. Lo que se mantiene
- La carga manual del PDF (ADR-0008) queda como respaldo si la API cae. Hay que adaptar su lector al formato nuevo de la tienda («Referencia de catálogo: …», «Precio fábrica»).
- La IA no participa.
- La fábrica no lee la base de la tienda ni comparte usuarios con ella.

## Decisiones (aprobadas el 24-10-2026, con sus valores por defecto)

- **D1 — Datos del cliente final.**
  - Hoy REQ-COT-8.9 prohíbe guardarlos, y la nota comercial los trae (nombre, RUT, giro, dirección y teléfono). Por defecto: no se guardan como datos estructurados (la tienda hoy los envía en `order.customer`; se le pidió mandar `null` y la fábrica los descarta igual), y el **PDF comercial se guarda tal cual**, visible solo con `pedidos.importes.ver` + `clientes.ver` y con cada descarga auditada.
  - Requiere enmendar REQ-COT-8.9 y SECURITY §4: se conserva un documento de otra empresa con datos personales, con la finalidad de producir y despachar.
  - Alternativa: no guardar el comercial y conservar solo su hash.
- **D2 — Revisiones.** Por defecto se aplican solas solo si la nota está pendiente, sin pagos y sin orden; si no, se aplican o descartan a mano. Alternativa: siempre a mano.
- **D3 — Código desconocido o inactivo** (cambiado el 24-10-2026, a pedido de la tienda). Puede ser un producto dado de alta con IA en la tienda (`IA-XXXXXXXXXX`) o venir de una planilla más nueva que la de la fábrica. Un 422 es permanente y el pedido no llegaría nunca.
  - Por defecto, la nota entra igual y esa línea queda como ítem «a pedido», armado con los campos estructurados (modelo, madera, familia, medidas, descripción, referencia de catálogo).
  - La línea lleva una marca visible «código X no está en el catálogo de la fábrica: revisar», y una persona la confirma al marcar la nota lista, como los demás ítems a pedido (regla 2: nunca se completa en silencio).
  - Precio: el de `order.commercial` si viene, o $0 con el aviso «precio por definir», como D4.
  - Alternativa: rechazarla con 422.
- **D4 — Líneas especiales** (`ESPECIAL`, también las «por definir»). Por defecto, ítem «a pedido» con el precio de la tienda si viene, o $0 con el aviso «precio por definir». Se confirman al marcar la nota lista, como hoy. Alternativa: rechazarlas hasta que tengan precio.
- **D5 — Anulación y renumeración.** El contrato de la tienda trae `order.cancelled` en v1. Una renumeración llega como revisión nueva.
  - Por defecto, la anulación sigue la regla de D2: cancela una nota pendiente, sin pagos y sin orden de producción.
  - Si no, queda «anulación solicitada» para una persona, que decide qué hacer con lo producido.

## Pendientes (no bloquean)

- **P1:** una muestra de la planilla Excel de Bea, para comparar sus columnas con la orden de trabajo (§7).
- **P2:** quién en la fábrica tendrá el perfil «Producción».
- **P3:** el host público de la fábrica y la IP de salida de la tienda para la regla de Cloudflare.

## Cambios en documentos (hechos en la Fase 19)

| Documento | Cambio |
|---|---|
| AGENTS.md | «Único canal de entrada: la webapp» pasa a «la webapp y la API firmada de la tienda (ADR-0023)» |
| SPEC | REQ-COT-8.18–8.24 nuevos (recepción, idempotencia, revisiones, documentos, orden de trabajo, importes con permiso); REQ-COT-8.9 enmendado (D1); no-objetivos y §8 |
| API | La sección «Webhooks» pasa a «Integraciones» con el endpoint y su contrato. Agrega las rutas de documentos y orden de trabajo y el filtrado por `pedidos.importes.ver` |
| SECURITY | Permiso nuevo y matriz; T6 pasa a aplicar (firma, ventana, idempotencia); T11 «nota falsificada o PDF hostil por API»; §6 superficie pública; §4 datos del cliente final |
| DATA-MODEL | `recepcion_tienda`, `documento_tienda`, `adjunto_tienda`, `pedido_item.observacion`/`revisar`/`referencias`, `nota_pedido.revision_externa`/`reemplaza_id`/origen `tienda_api` y unicidad nueva |
| DESIGN, UX | Envoltura `integracion()`; en la ficha: origen y revisión, documentos, orden de trabajo y revisión pendiente |
| TESTING | `I integracion-tienda` y E2E `21-recepcion-tienda` |
| RUNBOOK, `.env.example`, Compose | Variables de §9, rotación y regla de Cloudflare |
| ADR-0003 y ADR-0008 | Anotados como «modificado» y «complementado» por ADR-0023 |

## Fase 19 (en TASKS.md)

- **T19.0** Documentos de la tabla anterior.
- **T19.1 (60)** Migración: tablas, columnas, unicidad, triggers de solo inserción, permiso y usuario técnico.
- **T19.2 (75)** Dominio puro, con pruebas U `integracion.firma` (vector compartido del contrato §5) y `integracion.contrato`:
  - firma y ventana;
  - esquema Zod;
  - chequeos de PDF (hash, `%PDF-`, número de la nota, sin montos en el de producción);
  - mapeo de ítems y medidas.
- **T19.3 (90)** `recibirNotaTienda`: transacción, idempotencia, revisiones (D2), aplicar o descartar revisión.
- **T19.4 (60)** Ruta y `integracion()`, test estructural, 401/400/413/415/422/409/503 y auditoría de rechazos.
- **T19.5 (75)** `pedidos.importes.ver` en la API, las páginas y el panel; rutas de documentos.
- **T19.6 (60)** PDF «Orden de trabajo» y su prueba U `pdf.contenido` (sin `$` ni datos personales).
- **T19.7 (60)** UI de la ficha y la lista.
- **T19.8 (90)** Pruebas de los 16 casos pedidos:
  - I `integracion-tienda`: Panguipulli 201; Santiago 422; sin cabeceras, firma inválida y timestamp vencido 401; datos obligatorios; productos, cantidades y medidas guardados; ambos PDF; comercial con y sin permiso; orden de trabajo sin precios; duplicado 200; 10 envíos simultáneos = 1 nota; fallo a mitad de la transacción sin restos; ciclo producción → lista → despacho sobre la nota recibida; revisión 2 sobre pendiente y sobre una en producción.
  - E2E 21.
- **T19.9 (60)** Lector de ADR-0008 adaptado al formato nuevo, con muestra anónima en `e2e/fixtures`.
- **T19.10 (30)** `npm run integracion:enviar-prueba`: firma y envía una nota de ejemplo, para que la tienda pruebe contra desarrollo.

**Checkpoint F19:** `npm test` completo verde, lint y build. Recorrido: una nota firmada llega sola, aparece en «Notas de pedido» con sus dos documentos, el perfil Producción imprime la orden de trabajo sin ver importes, y una revisión sobre una nota en producción espera a una persona.

## Consecuencias

- \+ Bea deja de transcribir: la nota llega con sus datos y entra al ciclo de siempre, sin botón de importar.
- \+ Aparece por primera vez un documento operativo sin precios, y los importes pasan a ser un permiso.
- − Primera superficie de escritura sin sesión. Se mitiga con firma, ventana, idempotencia, límites de tamaño, esquema estricto, PDF verificados, una sola transacción y la regla de Cloudflare.
- − La fábrica guarda documentos con datos personales de clientes de otra empresa (D1).
- − El contrato se versiona en dos repos: un cambio exige coordinarlos.

## Alternativas

- **Que la fábrica lea la base de la tienda:** acopla las dos apps y abre red entre ellas. Descartado (también en ADR-0008).
- **Una bandeja de «pedidos recibidos» con un botón de importar:** es justo el paso manual que se quiere quitar. Descartado.
- **Arreglar solo el lector de PDF:** sigue exigiendo subir el PDF y deja la fábrica atada al diseño visual de la tienda. Se hace igual, como respaldo (T19.9).
- **Correo o carpeta compartida:** sin autenticación fuerte ni idempotencia, y la empresa no usa Google Workspace (NC-11). Descartado.
- **Servicio intermediario o un tercer repo:** el usuario lo prohibió.
