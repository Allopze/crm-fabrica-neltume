# API.md — Contratos HTTP

Base `/api/v1`, JSON UTF-8, solo detrás de Cloudflare Access. Todos los handlers van envueltos en `conPermiso` (SECURITY §2). Los importes van en CLP enteros y las fechas en ISO 8601; el formato chileno se aplica en la UI y en el PDF.

## 1. Convenciones

- **Autenticación:** cookie de sesión `HttpOnly`. Las mutaciones exigen la cabecera `X-CSRF-Token`.
- **Paginación:** `?limite=` (por defecto 50, máximo 200) y `?cursor=` (opaco). Respuesta: `{ "datos": [...], "siguiente": "<cursor>|null" }`.
- **Idempotencia:** la cabecera `Idempotency-Key` (UUID) es **obligatoria** donde dice *Idem*. Una repetición con el mismo cuerpo devuelve la respuesta original; con otro cuerpo, 422 `IDEMPOTENCIA_CONFLICTO`.
- **Concurrencia:** las ediciones de cotización llevan `version`; si no coincide, 409 `VERSION_OBSOLETA`.
- **Entrada:** Zod estricto. Cualquier campo no esperado da 400. Los campos de importe (`precio*`, `total`, `iva`, `subtotal`) **nunca** se aceptan, salvo `precio_unitario` al fijar un ítem `a_pedido` (SECURITY T2).

## 2. Errores

`{ "error": { "codigo": "STOCK_INSUFICIENTE", "mensaje": "…", "detalles": {…}, "correlacion_id": "…" } }`

| HTTP | Códigos |
|---|---|
| 400 | `VALIDACION`, `CAMPO_NO_PERMITIDO`, `TEXTO_DEMASIADO_LARGO` |
| 401 | `NO_AUTENTICADO` |
| 403 | `SIN_PERMISO`, `CSRF` |
| 404 | `NO_ENCONTRADO` (también cuando no hay permiso de lectura sobre el recurso, contra IDOR) |
| 409 | `VERSION_OBSOLETA`, `ITEMS_POR_CONFIRMAR`, `NO_APROBADA`, `VENCIDA`, `YA_TIENE_PEDIDO`, `ORDEN_CERRADA`, `STOCK_INSUFICIENTE`, `INSUMOS_INSUFICIENTES`, `SIN_BOM` |
| 422 | `IDEMPOTENCIA_CONFLICTO`, `ULTIMO_ADMIN` |
| 429 | `LIMITE_IA`, `LIMITE_LOGIN` |
| 503 | `IA_NO_DISPONIBLE` (solo informativo; el borrador queda `ia_fallida`) |

## 3. Endpoints

### Sesión y administración (REQ-ADM)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| POST `/sesion` | público | | Login; 429 tras 5 intentos |
| DELETE `/sesion` | sesión | | Logout |
| GET `/salud` | público | | `{ estado: ok\|degradado }` |
| GET `/usuarios` · POST `/usuarios` · PATCH `/usuarios/:id` | `usuarios.gestionar` | | La desactivación respeta REQ-ADM-2.4 (422 `ULTIMO_ADMIN`) |
| GET `/roles` · POST `/roles` · PUT `/roles/:id/permisos` | `usuarios.gestionar` | | |
| GET `/auditoria?actor&recurso&accion&resultado&desde&hasta&antesDe&limite` | `auditoria.ver` | | Paginado por id (más nuevo primero); fechas en días de Santiago |
| GET `/metricas/ia` | `auditoria.ver` | | Latencia, costo y tasa de fallas |
| GET `/feriados?anio` · POST `/feriados` (`fecha, nombre`) · DELETE `/feriados/:fecha` | sesión / `config.editar` | | Legales calculados más adicionales; solo los adicionales se agregan o quitan (REQ-COT-6.6) |

### Catálogo, precios e importación (REQ-STK-1, REQ-COT-1)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| POST `/importaciones` (multipart .xlsx ≤ 5 MB) | `catalogo.editar` + `precios.editar` | ✔ | Informe de creadas, actualizadas y rechazadas |
| GET `/importaciones/:id` | `catalogo.editar` | | |
| GET `/articulos?modelo&madera&ancho&alto&tipo&q` | `stock.ver` | | Incluye el disponible |
| GET `/articulos/:codigo` | `stock.ver` | | Costos solo si hay `costos.ver` |
| PATCH `/articulos/:codigo` (`activo`, `stock_minimo`) | `catalogo.editar` / `config.editar` | | |
| GET `/listas-precio` · GET `/listas-precio/:version` | `stock.ver` | | Costos y margen solo con `costos.ver` |
| POST `/listas-precio` (`{ cambios:[{codigo, precio_neto}], recargos:[…] }`) | `precios.editar` | ✔ | Crea la versión N+1 |

### Stock de puertas (REQ-STK-2..7)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| GET `/stock?…filtros` | `stock.ver` | | Existencia, reservado y disponible |
| GET `/stock/alertas` | `stock.ver` | | Puertas con disponible bajo su mínimo, con `faltan`; las más urgentes primero (REQ-STK-6.1) |
| GET `/movimientos?articulo&tipo&desde&hasta` | `stock.ver` | | Paginado |
| POST `/movimientos/entradas` (`articulo, cantidad, orden_id`) | `stock.mover` | ✔ | |
| POST `/movimientos/salidas` (`articulo, cantidad, pedido_id`) | `stock.mover` | ✔ | 409 `STOCK_INSUFICIENTE`; libera la reserva |
| POST `/movimientos/ajustes` (`articulo\|materia_prima, cantidad±, motivo`) | `stock.ajustar` | ✔ | El motivo es obligatorio |
| PUT/PATCH/DELETE `/movimientos/:id` | — | | **No existen** (405) |

### Materias primas y producción (REQ-MP)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| GET `/materias-primas` · POST · PATCH `/:id` (`activo`) | `stock.ver` / `mp.editar` | | |
| PATCH `/materias-primas/:id/minimo` (`stockMinimo`) | `config.editar` | | Mínimo de reposición (REQ-MP-6.2) |
| GET `/materias-primas/alertas` | `stock.ver` | | Bajo su mínimo, con `faltan`; las más urgentes (proporcionalmente) primero (REQ-MP-6.1) |
| POST `/recepciones` (`materia_prima, cantidad, referencia`) | `mp.mover` | ✔ | |
| GET `/bom?modelo` · PUT `/bom/:modelo` (`lineas[], origen`) | `stock.ver` / `mp.editar` | | Crea una nueva vigencia |
| GET/POST `/ordenes` · GET `/ordenes/:id` | `produccion.gestionar` | ✔ (POST) | |
| POST `/ordenes/:id/cerrar` | `produccion.gestionar` | ✔ | Consumo + entrada, todo o nada; 409 `SIN_BOM`, `INSUMOS_INSUFICIENTES`, `ORDEN_CERRADA` |

### Cotizaciones, clientes y pedidos (REQ-COT)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| POST `/cotizaciones/interpretaciones` (`texto, cliente_id?`) | `cotizaciones.crear` | ✔ | 202 `{ id, estado: interpretando }`; 429 `LIMITE_IA` |
| POST `/cotizaciones` (`clienteId?, items:[{codigo, cantidad} \| {detalle, cantidad}]`) | `cotizaciones.crear` | ✔ | Cotización manual (REQ-COT-5) |
| GET `/cotizaciones?estado&q&desde&hasta&antesDe&limite` | `cotizaciones.crear` | | `q`: número o nombre de cliente (este solo con `clientes.ver`); fechas de creación en días de Santiago; paginado por número (REQ-COT-10.1) |
| GET `/cotizaciones/:id` | `cotizaciones.crear` | | Texto original, interpretación, ítems, avisos de stock y diferencia de lista. Sin permiso: el mismo 404 que si no existiera (REQ-COT-10.2) |
| PATCH `/cotizaciones/:id` (`cliente_id, notas, version`) | `cotizaciones.crear` | | Solo en borrador |
| POST `/cotizaciones/:id/items` · PATCH `/…/items/:itemId` · DELETE `/…/items/:itemId` | `cotizaciones.crear` | | Resolver: `{ codigo, cantidad }` o `{ precio_unitario }` si es `a_pedido`; recalcula |
| POST `/cotizaciones/:id/recalcular` | `cotizaciones.crear` | | Pasa a la lista vigente (REQ-COT-6.3) |
| POST `/cotizaciones/:id/descuento` (`porcentaje` en puntos 0–99,99, `motivo`, `version`) | `descuentos.aplicar` | | Solo borradores; 0 lo quita; auditado (REQ-COT-7.1, 7.2) |
| POST `/cotizaciones/:id/aprobar` (`version`) | `cotizaciones.aprobar` | ✔ | 409 `ITEMS_POR_CONFIRMAR` |
| GET `/cotizaciones/:id/pdf` | `cotizaciones.aprobar` + `clientes.ver` | | 409 `NO_APROBADA`; sin permiso, 404; lleva datos del cliente; auditado |
| GET/POST `/clientes` · GET/PATCH `/clientes/:id` | `clientes.ver` / `clientes.editar` | | RUT validado |
| POST `/pedidos` (`cotizacionId, direccionDespacho?, medioTransporte?`) | `pedidos.gestionar` | ✔ | Crea la nota de pedido y las reservas; 409 `VENCIDA`, `YA_TIENE_PEDIDO`, `NO_APROBADA` |
| GET `/pedidos` · GET `/pedidos/:id` | `pedidos.gestionar` | | Muestra reservado y faltante por ítem, origen (`cotizacion` / `nota_tienda`) y totales |
| POST `/pedidos/:id/cancelar` (`motivo`) | `pedidos.gestionar` | ✔ | Libera las reservas; 409 `NO_EDITABLE` si ya está cancelada o despachada |
| GET `/pedidos/:id/pdf` | `pedidos.gestionar` + `clientes.ver` | | Nota de pedido; auditado |
| PATCH `/pedidos/:id` (`direccionDespacho?, medioTransporte?, entregaComprometida?, observaciones?`) | `pedidos.gestionar` | | Hasta despachar; 409 `NO_EDITABLE` |
| POST `/pedidos/:id/produccion` | `pedidos.gestionar` + `produccion.gestionar` | ✔ | Pendiente → en producción; crea la orden por el faltante de catálogo (REQ-COT-8.5) |
| POST `/pedidos/:id/completar-reserva` | `pedidos.gestionar` | ✔ | Reserva el faltante con el stock disponible (REQ-STK-7.5) |
| POST `/pedidos/:id/lista` (`confirmarAPedido`) | `pedidos.gestionar` | ✔ | 409 `STOCK_INSUFICIENTE` si falta reservar; los ítems a pedido se confirman |
| POST `/pedidos/:id/despachar` | `pedidos.gestionar` | ✔ | Libera la reserva y descuenta el stock (REQ-STK-4.4) |
| POST `/pedidos/nota-tienda/vista-previa` (multipart: `archivo` PDF ≤ 5 MB, `clienteId?`) | `pedidos.gestionar` | | Lee y valida la nota de la tienda sin escribir; 422 `NOTA_ILEGIBLE` (ADR-0008) |
| POST `/pedidos/nota-tienda` (multipart: `archivo`, `clienteId` de tipo tienda, `direccionDespacho?`, `medioTransporte?`, `entregaComprometida?`, `observaciones?`) | `pedidos.gestionar` | ✔ | El servidor vuelve a leer el PDF; 409 `YA_IMPORTADA`; precio de lista sin recargo (REQ-COT-8.6–8.9) |

### Webhooks
No hay. El único canal es la webapp (ADR-0003). Un test verifica que no existen rutas `/webhooks/*`.

## 4. Ejemplo: interpretación

```http
POST /api/v1/cotizaciones/interpretaciones
Idempotency-Key: 6f1c…
X-CSRF-Token: …
{ "texto": "3 puertas Neltume en raulí de 90x210" }
→ 202 { "id": "c0a8…", "estado": "interpretando" }
GET /api/v1/cotizaciones/c0a8… → 200 { "estado": "borrador", "items": [
  { "codigo": "NEL-R-4-B", "cantidad": 3, "estado_item": "ok",
    "precio_unitario": 0, "total_linea": 0, "aviso_stock": "disponible 1, faltan 2" } ], "…": "…" }
```

(Los importes del ejemplo son marcadores; los reales salen de la lista).
