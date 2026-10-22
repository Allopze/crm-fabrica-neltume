# API.md — Contratos HTTP

Base `/api/v1`, JSON UTF-8, expuesta a internet solo por Cloudflare Tunnel, sin Cloudflare Access (ADR-0010): sin sesión solo responden `POST /sesion` y `GET /salud`. Todos los handlers van envueltos en `conPermiso` (SECURITY §2). Los importes van en CLP enteros y las fechas en ISO 8601; el formato chileno se aplica en la UI y en el PDF.

## 1. Convenciones

- **Autenticación:** cookie de sesión `HttpOnly`. Las mutaciones exigen la cabecera `X-CSRF-Token`.
- **Paginación:** `?limite=` (por defecto 50, máximo 200) y `?cursor=` (opaco). Respuesta: `{ "datos": [...], "total": n, "siguiente": "<cursor>|null" }`; `total` cuenta lo que cumple los filtros, sin la página (UX §1).
- **Idempotencia:** la cabecera `Idempotency-Key` (UUID) es **obligatoria** donde dice *Idem*. Una repetición con el mismo cuerpo devuelve la respuesta original; mientras la primera sigue en curso, 409 `IDEMPOTENCIA_EN_CURSO` (reintentar con la misma clave); con otro cuerpo u otra ruta, 422 `IDEMPOTENCIA_CONFLICTO` (DESIGN §5).
- **Concurrencia:** las ediciones de cotización llevan `version`; si no coincide, 409 `VERSION_OBSOLETA`.
- **Entrada:** Zod estricto. Cualquier campo no esperado da 400. Los campos de importe (`precio*`, `total`, `iva`, `subtotal`) **nunca** se aceptan, salvo `precio_unitario` al fijar un ítem `a_pedido` y el `monto` de un pago (ADR-0020) de la nota de pedido, que solo suma al pagado (SECURITY T2).

## 2. Errores

`{ "error": { "codigo": "STOCK_INSUFICIENTE", "mensaje": "…", "detalles": {…}, "correlacion_id": "…" } }`

| HTTP | Códigos |
|---|---|
| 400 | `VALIDACION`, `CAMPO_NO_PERMITIDO`, `TEXTO_DEMASIADO_LARGO` |
| 401 | `NO_AUTENTICADO` |
| 403 | `SIN_PERMISO`, `CSRF` |
| 404 | `NO_ENCONTRADO` (también cuando no hay permiso de lectura sobre el recurso, contra IDOR) |
| 409 | `VERSION_OBSOLETA`, `IDEMPOTENCIA_EN_CURSO`, `ITEMS_POR_CONFIRMAR`, `NO_APROBADA`, `VENCIDA`, `YA_TIENE_PEDIDO`, `ORDEN_CERRADA`, `STOCK_INSUFICIENTE`, `INSUMOS_INSUFICIENTES`, `SIN_BOM`, `BOM_INCOMPLETO` |
| 413 | `CUERPO_GRANDE`: más de 1 MB, o 6 MB en `/importaciones` y `/pedidos/nota-tienda*`; se rechaza sin leer el cuerpo, o al pasar el límite si llega por trozos (ADR-0011) |
| 422 | `IDEMPOTENCIA_CONFLICTO`, `ULTIMO_ADMIN` |
| 429 | `LIMITE_IA`, `LIMITE_LOGIN` |
| 503 | `IA_NO_DISPONIBLE` (solo informativo; el borrador queda `ia_fallida`) |

## 3. Endpoints

### Sesión y administración (REQ-ADM)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| POST `/sesion` | público | | Login; 429 tras 5 intentos |
| DELETE `/sesion` | sesión | | Logout |
| PUT `/sesion/clave` (`claveActual, claveNueva`) | sesión | | Cambia la contraseña propia; una clave actual incorrecta cuenta como fallo de login (429 tras 5); cierra las otras sesiones; 204 (REQ-ADM-1.4) |
| GET `/salud` | público | | `{ estado: ok\|degradado }` |
| GET `/usuarios` · POST `/usuarios` · PATCH `/usuarios/:id` | `usuarios.gestionar` | | La desactivación respeta REQ-ADM-2.4 (422 `ULTIMO_ADMIN`) |
| PUT `/usuarios/:id/clave` (`claveNueva`) | `usuarios.gestionar` | | Restablece la contraseña y cierra todas las sesiones de ese usuario; 204; auditado sin hash (REQ-ADM-2.5) |
| GET `/roles` · POST `/roles` · PUT `/roles/:id/permisos` | `usuarios.gestionar` | | |
| GET `/auditoria?actor&recurso&accion&resultado&desde&hasta&antesDe&limite` | `auditoria.ver` | | Paginado por id (más nuevo primero); fechas en días de Santiago |
| GET `/metricas/ia` | `auditoria.ver` | | Latencia, costo y tasa de fallas |
| GET `/feriados?anio` · POST `/feriados` (`fecha, nombre`) · DELETE `/feriados/:fecha` | sesión / `config.editar` | | Legales calculados más adicionales; solo los adicionales se agregan o quitan (REQ-COT-6.6) |
| GET `/ajustes/ia` | `config.editar` | | Proveedor/modelo activos y cachés. Las claves solo están en el entorno del worker y nunca se devuelven (REQ-ADM-4.x) |
| PUT `/ajustes/ia` (`proveedorActivo?`, `modelo?`, `groqZdrConfirmado`) | `config.editar` | | Guarda proveedor/modelo y metadatos auditables; activar modelo requiere catálogo compatible y confirmación ZDR si Groq. API keys no se aceptan en el cuerpo |

### Catálogo, precios e importación (REQ-STK-1, REQ-COT-1)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| POST `/importaciones` (multipart .xlsx ≤ 5 MB) | `catalogo.editar` + `precios.editar` | ✔ | Informe de creadas, actualizadas y rechazadas |
| GET `/importaciones/:id` | `catalogo.editar` | | |
| PATCH `/articulos/:codigo` (`activo`, `stock_minimo`) | `catalogo.editar` / `config.editar` | | |
| GET `/listas-precio` · GET `/listas-precio/:version` | `stock.ver` | | Costos y margen solo con `costos.ver` |
| POST `/listas-precio` (`{ cambios:[{codigo, precio_neto}], recargos:[…] }`) | `precios.editar` | ✔ | Crea la versión N+1 |
| GET `/alias-modelos` · POST `/alias-modelos` (`alias, modelo, tipo`) · DELETE `/alias-modelos/:alias` | `stock.ver` / `catalogo.editar` | | Alias seguros y dudosos de modelos (REQ-COT-2.11) |

### Stock de puertas (REQ-STK-2..7)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| GET `/stock?…filtros` | `stock.ver` | | Existencia, reservado y disponible |
| GET `/stock/alertas` | `stock.ver` | | Puertas con disponible bajo su mínimo, con `faltan`; las más urgentes primero (REQ-STK-6.1) |
| GET `/movimientos?articulo&tipo&desde&hasta` | `stock.ver` | | Paginado |
| POST `/movimientos/entradas` (`codigo, cantidad? , puertas?, ubicacion?, referencia?`) | `stock.mover` | ✔ | Una puerta por unidad: con `puertas` (etiquetas), esos códigos; si no, los siguientes de la serie. Responde `{ id, puertas }` (REQ-STK-8.2). Los accesorios entran por cantidad |
| POST `/movimientos/salidas` (`codigo? , cantidad? , puertas?, referencia?`) | `stock.mover` | ✔ | Con `puertas`, esas (una apartada se libera); si no, las más antiguas no apartadas, primero las de primera. `referencia` = documento. 409 `STOCK_INSUFICIENTE`; 400 si una puerta es de otro artículo (REQ-STK-8.3) |
| POST `/movimientos/ajustes` (`codigo? \| materiaPrimaId, cantidad±, motivo, puertas?, ubicacion?`) | `stock.ajustar` | ✔ | El motivo es obligatorio. Positivo con `puertas`: crea o devuelve esas puertas al stock |
| PUT/PATCH/DELETE `/movimientos/:id` | — | | **No existen** (405) |
| GET `/puertas?q&estado&ubicacion&calidad&articulo&fueraCatalogo&cursor&limite` | `stock.ver` | | `estado`: `stock` (por defecto), `disponibles`, `apartadas`, `fuera`, `todas`; el nombre de un apartado solo con `clientes.ver` (REQ-STK-8.6) |
| GET `/puertas/:codigo` · PATCH (`ubicacion?, calidad?, observacion?`) | `stock.ver` / `stock.mover` | | Ficha con movimientos y despacho histórico; la edición se audita con antes y después (REQ-STK-8.4) |
| POST `/puertas/:codigo/apartar` (`para`) · POST `/puertas/:codigo/liberar` (`motivo`) | `stock.mover` | ✔ | Reserva o libera esa puerta (REQ-STK-8.5) |
| GET `/despachos-historicos?q&codigo&cursor&limite` | `stock.ver` | | Planilla anterior a la app, de solo lectura; `cliente` y su búsqueda solo con `clientes.ver` (REQ-STK-10.2) |

### Materias primas y producción (REQ-MP)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| GET `/materias-primas` · POST · PATCH `/:id` (`activo`) | `stock.ver` / `mp.editar` | | |
| PATCH `/materias-primas/:id/minimo` (`stockMinimo`) | `config.editar` | | Mínimo de reposición (REQ-MP-6.2) |
| GET `/materias-primas/alertas` | `stock.ver` | | Bajo su mínimo, con `faltan`; las más urgentes (proporcionalmente) primero (REQ-MP-6.1) |
| GET `/compras` · GET `/compras/:id` (ADR-0021) | `stock.ver` | | Por asociar, por revisar, facturas recientes y última sincronización; una factura con sus líneas; `precioUnitario` solo con `costos.ver` (REQ-MP-7.10) |
| POST `/compras/lineas/:id/asociar` (`materiaPrimaId`, `factor`) · POST `/compras/lineas/:id/ignorar` | `mp.mover` (+ `mp.editar` para guardar el mapeo) | ✔ | Crea la recepción y el mapeo, o recuerda «no es materia prima»; 409 `NO_EDITABLE` si la línea no está por asociar (REQ-MP-7.3) |
| GET · POST `/proveedores-compra` (`rut`, `nombre`) · PATCH `/proveedores-compra/:rut` (`activo`) · GET `/mapeos-compra` · PATCH `/mapeos-compra/:id` (`materiaPrimaId?`, `factor?`, `ignorar?`) | `stock.ver` / `mp.editar` | ✔ (POST) | Proveedores habilitados (RUT validado; `habilitado_desde` = hoy, también al reactivar) y mapeos; editar un mapeo vale para las facturas que vengan (REQ-MP-7.1, 7.2) |
| POST `/compras/sincronizar` · GET `/compras/sincronizacion` | `mp.mover` / `stock.ver` | ✔ | 202: encola una corrida (una a la vez: si hay una pendiente o en curso, devuelve esa) y muestra la última: inicio, fin, resultado y conteos (REQ-MP-7.7) |
| POST `/recepciones` (`materia_prima, cantidad, referencia`) | `mp.mover` | ✔ | |
| GET `/bom?modelo` · PUT `/bom/:modelo` (`lineas[], origen`) | `stock.ver` / `mp.editar` | | Crea una nueva vigencia. Cada línea es `{materiaPrimaId, cantidad}` o `{maderaPuerta: true, cantidad}` (factor sobre las pulgadas del artículo, una vez por BOM; ADR-0012) |
| PUT `/maderas/:codigo/insumo` (`materiaPrimaId` o null) | `mp.editar` | | Materia prima de la que se descuenta esa madera (REQ-MP-3.5); 204; auditado |
| POST `/bom/aplicar` (`modelos[]`, `operacion`: `{tipo: factor, factor}` · `{tipo: insumo, materiaPrimaId, cantidad}` · `{tipo: quitar, materiaPrimaId}`) | `mp.editar` | ✔ | Mismo cambio en la receta general de varios modelos, como versiones nuevas; responde `actualizados`, `sinCambio`, `sinReceta` (REQ-MP-3.6) |
| GET/POST `/ordenes` · GET `/ordenes/:id` | `produccion.gestionar` | ✔ (POST) | |
| POST `/ordenes/:id/cerrar` (`consumosManuales?, ubicacion?`) | `produccion.gestionar` | ✔ | Consumo + entrada, todo o nada; responde los códigos de las puertas nuevas (REQ-STK-8.2); 409 `SIN_BOM`, `BOM_INCOMPLETO` (madera sin materia prima asociada o artículo sin pulgadas), `INSUMOS_INSUFICIENTES`, `ORDEN_CERRADA` |

### Cotizaciones, clientes y pedidos (REQ-COT)
| Método y ruta | Permiso | Idem | Notas |
|---|---|---|---|
| POST `/cotizaciones/interpretaciones` (`texto, cliente_id?`) | `cotizaciones.crear` | ✔ | 202 `{ id, estado: interpretando }`; 429 `LIMITE_IA` |
| POST `/cotizaciones` (`clienteId?, items:[{codigo, cantidad} \| {detalle, cantidad}]`) | `cotizaciones.crear` | ✔ | Cotización manual (REQ-COT-5) |
| GET `/cotizaciones?estado&q&desde&hasta&antesDe&limite` | `cotizaciones.crear` | | `q`: número o nombre de cliente (este solo con `clientes.ver`); fechas de creación en días de Santiago; paginado por número (REQ-COT-10.1) |
| GET `/cotizaciones/:id` | `cotizaciones.crear` | | Texto original, interpretación, ítems, avisos de stock, diferencia de lista y `pistas` (`cliente` solo con `clientes.ver`, `repetidas`, `plazo`; REQ-COT-2.18–2.20). Sin permiso: el mismo 404 que si no existiera (REQ-COT-10.2) |
| GET `/cotizaciones/:id/estado` | `cotizaciones.crear` | | `{ estado, version }` para el sondeo ligero mientras la IA interpreta (UX §3) |
| PATCH `/cotizaciones/:id` (`cliente_id, notas, clienteDetectadoPor?, version`) | `cotizaciones.crear` | | Solo en borrador; `clienteDetectadoPor` (`rut`/`correo`/`telefono`) exige cliente y solo va a la auditoría (REQ-COT-2.18) |
| POST `/cotizaciones/:id/items` · PATCH `/…/items/:itemId` · DELETE `/…/items/:itemId` | `cotizaciones.crear` | | Agregar `{ codigo, cantidad }` o una línea libre `{ detalle, cantidad }` (por confirmar, REQ-COT-5.2); resolver con `{ codigo, cantidad }` o `{ precio_unitario }` si es `a_pedido`; recalcula |
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
| POST `/pedidos/:id/despachar` (`puertas?`) | `pedidos.gestionar` | ✔ | Libera la reserva y descuenta el stock puerta por puerta; las `puertas` elegidas de un artículo deben ser exactamente las de sus ítems, y sin ellas salen las más antiguas. Responde `puertasDespachadas` (REQ-STK-4.4, 8.3) |
| POST `/pedidos/:id/pagos` (`monto, fecha, medio, referencia?`) | `pagos.registrar` | ✔ | Pago de solo inserción; 409 `SOBREPAGO` si supera el saldo, `NO_EDITABLE` si está cancelada (REQ-COT-8.10, 8.11) |
| POST `/pedidos/:id/pagos/:pagoId/reverso` (`motivo`) | `pagos.registrar` | ✔ | Anula un pago con un registro de monto opuesto; 409 `YA_REVERTIDO` |
| POST `/pedidos/:id/excepcion-pago` (`tipo`: `abono`/`saldo`, `motivo`) | `pagos.registrar` + `pedidos.gestionar` | ✔ | Habilita producir sin abono o despachar con saldo en esa nota (REQ-COT-8.13) |
| Pagos en `/produccion`, `/despachar` y las consultas (ADR-0020) | — | | 409 `ABONO_PENDIENTE` y `SALDO_PENDIENTE` sin la excepción; `GET /pedidos/:id` suma pagos, pagado, saldo, estado de pago e historial; `GET /pedidos` filtra por `estado` y `estadoPago` |
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
