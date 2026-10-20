# ADR-0021 — Recepción automática de materias primas desde las facturas de compra en Chipax

**Estado:** aceptado (aprobado por el usuario el 14-10-2026; Fase 13) · **Fecha:** 14-10-2026 · **Refs:** REQ-MP-2.x, 7.1–7.10, ADR-0002, ADR-0006, ADR-0017, SECURITY T5 y §6, AGENTS reglas 2, 5, 6, 7 y 10.

## Contexto

Hoy las materias primas entran a mano: Recepción, con materia prima, cantidad y referencia (REQ-MP-2.x). El usuario pidió (14-10-2026) que **las facturas de compra de ciertos proveedores registren el stock solas**, leyéndolas desde **Chipax**, el software contable de la empresa, sincronizado con el SII.

Lo que ofrece la API v2 de Chipax (revisado en su OpenAPI publicado en `api.chipax.com/v2/swagger-docs`, 14-10-2026):

- **Autenticación:** `POST /v2/login` con `app_id` y `secret_key` (de Ajustes → Credenciales API en Chipax) devuelve un JWT con su vencimiento. Se usa en la cabecera `Authorization: JWT <token>`.
- **Facturas de compra:** `GET /v2/compras` entrega una lista paginada con **solo la cabecera**: `rut_emisor`, `razon_social`, `tipo` (33, 34, 56, 61…), `folio`, `fecha_emision`, montos, `estado` (recibido/aceptado/rechazado) y `anulado`/`deleted`. Filtra por `fechaInicial`/`fechaFinal`, `folio` y `conXml=true`. **No filtra por proveedor.**
- **Detalle por línea:** **solo está en el XML del DTE**. Cada compra trae `urlXmlPublica`, una URL firmada que no lleva `Authorization`, vence a los 7 días (responde `410`) y responde `404 xml_not_available` mientras el XML no se sincroniza. El XML trae las líneas `<Detalle>` (código, nombre, cantidad, unidad y precio del ítem).
- **Límites:** un GET con filtros cada 5 s por empresa y endpoint; al superarlo, `429` con `Retry-After`. La ayuda de Chipax habla además de 60 peticiones por minuto.

## Decisión

1. **Servicio propio `compras` en Compose** (perfil `chipax`), separado de `app` y del `worker` de IA, igual que este (ADR-0006, ADR-0017).
   - Solo él recibe `CHIPAX_APP_ID` y `CHIPAX_SECRET_KEY`; `app`, el navegador, los logs y la auditoría nunca los ven.
   - Corre cada 30 min (parámetro `chipax_intervalo_min`) y cuando alguien pide «Sincronizar ahora». Esa petición es una fila en la BD que el servicio toma, como la cola de IA. Hay una sola a la vez: pedir otra mientras hay una pendiente o en curso devuelve esa.
   - En desarrollo, las credenciales van en `.env.compras.local`, y `npm run dev` arranca el servicio si ese archivo existe.
   - Tiene su **rol de BD propio** (`neltume_compras`): lee proveedores, mapeos, materias primas y `movimiento` (lo exige el trigger de saldo no negativo); inserta compras, líneas, movimientos y auditoría. Un trigger le permite **solo movimientos `recepcion` de materias primas**.
2. **Solo proveedores habilitados.** Una tabla de proveedores (RUT y nombre), editable en la app. Las facturas de otros RUT se ignoran sin guardarse.
3. **Proceso de cada corrida:**
   - Pide `/compras` por fecha de emisión (últimos 45 días; sin `conXml`, que en la API real no funciona), página a página, respetando el límite (≥ 5 s entre peticiones y `Retry-After` ante `429`).
   - Filtra por RUT habilitado y descarta las anuladas, borradas o rechazadas.
   - Descarga el XML y lee sus líneas `<Detalle>`.
   - **Al habilitar un proveedor no se lee hacia atrás:** solo entran las facturas emitidas desde ese día. Así no se duplica lo que ya se recibió a mano.
4. **Mapeo por proveedor: solo hay certeza con coincidencia exacta** (análogo a la regla 2).
   - Una línea entra sola si existe un mapeo para (RUT del proveedor + código del ítem; o, si la factura no trae código, + nombre del ítem normalizado).
   - El mapeo indica la materia prima y el **factor de conversión** (unidades nuestras por unidad facturada; por ejemplo, 1 m³ = 424 pulgadas madereras).
   - Sin mapeo, la línea queda **«por asociar»**. Una persona la asocia una sola vez («Asociar y recibir»): se crea su recepción y el mapeo sirve para las facturas siguientes. También puede marcarla **«no es materia prima»** (flete, servicios), y eso queda recordado.
   - Si la unidad facturada cambia respecto de la del mapeo, la línea queda «por revisar» y no se recibe sola.
5. **Notas de crédito y débito (61, 56): «por revisar», sin movimientos.** Una nota de crédito puede ser solo de precio; si hubo devolución, una persona registra el ajuste con motivo.
6. **Idempotencia.** Cada compra es única por (RUT, tipo, folio) y cada línea por (compra, N.º de línea). La recepción lleva la clave `chipax:<rut>:<tipo>:<folio>:<línea>` (`movimiento.idempotencia_clave`, única). Repetir una corrida o una caída no duplica stock.
7. **Si Chipax rechaza o anula después** una factura ya recibida, no se borra nada (movimientos inmutables, regla 5). La compra queda con el aviso «rechazada en Chipax: revisar» y una persona hace el ajuste con motivo.
8. **Trazabilidad (regla 7).** Cada corrida (inicio, fin, conteos y errores, sin datos de la factura) y cada recepción automática quedan en `audit_log` con actor `sistema` y origen `importacion`. Como `movimiento.usuario_id` es obligatorio, **la recepción automática queda a nombre de quien habilitó al proveedor**: es quien decidió que sus facturas entren solas. No se crea un usuario técnico, porque alguien podría ponerle clave y entrar con él. Cada asociación, cada «no es materia prima» y cada cambio de proveedores o mapeos quedan con el usuario que los hizo.
9. **Precios de compra.** La línea guarda su precio unitario neto, visible solo con `costos.ver`. No alimenta la lista de precios de venta ni el BOM; el costeo queda para después.
10. **El XML es dato no confiable:**
    - se lee sin DTD ni entidades externas, con tope de 2 MB, y solo se toman los campos del encabezado y de `<Detalle>`;
    - las URL firmadas y el token nunca se guardan ni se registran;
    - se reconoce el XML suelto (`<DTE>`) y el envoltorio `<EnvioDTE>`, en ISO-8859-1 o UTF-8.
11. **Recepción manual sigue disponible,** con un aviso cuando la materia prima ya entra sola desde Chipax (para no registrarla dos veces).

## Alternativas descartadas

- **Leer solo la cabecera** (sin XML): no dice qué insumo ni cuánto, y no permite mover stock.
- **Todo automático, sin «por asociar»:** obligaría a adivinar la materia prima a partir del nombre que escribe el proveedor, y la regla 2 lo prohíbe.
- **Correr dentro de `app` o del `worker` de IA:** pondría las credenciales de Chipax donde no corresponde y le daría permisos de stock al worker.
- **Webhooks de Chipax:** la API no los ofrece, y además abrirían una entrada pública (regla 10).

## Consecuencias

- Las facturas de los proveedores habilitados suben el stock de materias primas sin intervención, una vez que cada ítem está asociado.
- Lo nuevo y ambiguo queda visible en «Por asociar» y «Por revisar»; nunca se completa en silencio.
- Dependencias externas: la disponibilidad y los límites de Chipax, y el tiempo que tarda en tener el XML. Si Chipax falla, la corrida se reintenta y la recepción manual sigue funcionando.
- Cosas nuevas que mantener:
  - un servicio, un rol de BD, dos variables secretas y cuatro tablas;
  - una pestaña nueva en Materias primas;
  - pruebas con un Chipax simulado: `npm test` nunca llama al servicio real, y la prueba con credenciales reales corre aparte.

## Respuestas del usuario (14-10-2026) y lo que falta verificar

- **Proveedores (definidos el 20-10-2026):** Slipnaxos, Flor del Lago, Madesa, Ferretería Jaramillo, Ferretería Don Jorge, Agrícola Villarrica, Portal Huincha, Forestal Rucanahuel y la Cooperativa de Servicios para Pequeños Industriales y Artesanos de Villarrica. Se habilitan por RUT en Materias primas → Compras (Chipax); `npm run compras:proveedores -- "nombre"…` busca el RUT de cada uno entre los emisores de las facturas de Chipax, sin escribir nada. Agrícola Villarrica factura en Chipax como Maderas Villarica SpA (confirmado por el usuario el 20-10-2026). Los nueve se habilitaron en desarrollo el 20-10-2026 con `scripts/habilitar-proveedores.mts`.
- **Factura y llegada:** si la factura llega antes que el insumo, se acepta; el stock real se igualará cuando llegue.
- **Credenciales:** las genera el usuario desde la cuenta Chipax de la empresa y se cargan solo en el entorno del servicio, nunca en el repositorio.
- **Verificado con credenciales reales (14-10-2026, `npm run compras:probar`):**
  - el login devuelve el JWT en `token`;
  - `/compras` pagina con `page` (50 por página) y `paginationAttributes`;
  - **la API real responde en camelCase** (`rutEmisor`, `razonSocial`, `fechaEmision`), no en el snake_case del OpenAPI publicado, y no trae `deleted`. El cliente acepta ambas formas;
  - **`conXml=true` devuelve 0 facturas aunque el XML exista**, así que no se usa: el XML que aún no está responde `404` y se reintenta;
  - el XML viene de `manhattan.chipax.com`, en ISO-8859-1, con `<Detalle>` y código de ítem.
- **Hallazgo a resolver en Chipax:** en la cuenta de la empresa hay XML para las facturas antiguas (octubre de 2025), pero las de julio a septiembre de 2026 responden «no disponible». Mientras Chipax no sincronice esos XML, esas facturas quedan «XML pendiente» y no mueven stock. Hay que revisarlo con Chipax (sincronización de documentos recibidos).
