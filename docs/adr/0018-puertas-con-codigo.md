# ADR-0018 — Puertas con código, inventario inicial e historial de despachos

**Estado:** aceptado (propuesta aprobada por el usuario, 07-10-2026; Fase 11) · **Fecha:** 07-10-2026 · **Refs:** ADR-0002, ADR-0017, REQ-STK-8.x, 9.x, 10.x, REQ-STK-3.x, 4.x, 5.x, REQ-MP-4.1, AGENTS reglas 2, 5 y 8.

## Contexto

La fábrica lleva su inventario en `datos/INVENTARIO.xlsx`, **puerta por puerta**: cada puerta tiene un código de etiqueta único (`202308000000210`), modelo, medida exacta, madera, fecha de producción, ubicación (Galpón arriba, Galpón atrás, Fábrica, Tienda…), cliente si está apartada y observaciones (de segunda, manchada, pintada…). La hoja `Despachos` guarda 5.842 salidas desde 2022 con cliente y documento (factura, boleta, nota de pedido).

La app llevaba el stock **por cantidad** de artículo (ADR-0002). Con eso no se sabe qué puerta salió ni dónde está cada una. La fábrica tendría que seguir con el Excel en paralelo, y el usuario descartó tener dos sistemas.

Además, de las 405 puertas en stock solo 147 calzan exactamente con un artículo de la lista de precios. El resto son mamparas, puertas de segunda, modelos especiales o medidas fuera de grilla.

## Decisión

1. **Tabla `puerta`**: una fila por puerta física. Guarda `codigo` (único, el de la etiqueta), `articulo_id`, medida exacta (`ancho_mm`, `alto_mm`), `ubicacion`, `calidad` (`primera`/`segunda`), `observacion`, `fecha_produccion` y `origen`. Ubicación, calidad y observación se editan con auditoría. **La existencia de la puerta no se guarda**: sale de sus movimientos.
2. **Movimientos por puerta.** `movimiento.puerta_id` referencia la puerta y su artículo (FK compuesta). Toda entrada, salida o ajuste de un artículo de puertas mueve una puerta y vale ±1. Lo exigen un CHECK y un trigger, porque un CHECK no ve la familia del modelo. Los accesorios (marcos, piezas T, molduras) siguen por cantidad: la planilla de la fábrica solo controla puertas.
   - `registrarMovimientos` expande una cantidad N en N movimientos, uno por puerta. Así producción, despacho, la API y la demo siguen igual.
   - La reserva de una nota de pedido sigue siendo por artículo. La reserva de una puerta es un **apartado**: una puerta guardada para un cliente sin nota de pedido.
   - Un *constraint trigger* diferido exige que cada puerta tenga existencia 0 o 1 y apartado 0 o 1, y nunca apartado sin existencia. La regla de ADR-0002 se mantiene: stock = suma de movimientos inmutables.
3. **Códigos nuevos.** Una secuencia continúa la serie de la fábrica desde `202308000010001`, por encima de toda etiqueta existente. La carga inicial la sube si encuentra códigos mayores. Se usan cuando entra una puerta sin código: cierre de producción, entrada o ajuste positivo.
4. **Qué puertas salen.** Al despachar o dar de baja, el usuario elige los códigos. Si no los indica, salen las más antiguas (por fecha de producción) que no estén apartadas, primero las de primera. Elegir una puerta apartada la libera en la misma operación.
5. **Artículos fuera de catálogo.** Las puertas que no calzan con la lista quedan en artículos marcados `fuera_catalogo` (también en `modelo` y `madera` si no existían), con la medida exacta en el código (`MOL-O-780X2066`) y **sin precio**.
   - No entran al catálogo de la IA, al mapeo del cotizador ni a la cotización manual (regla 2: nada se completa en silencio).
   - Se venden con una salida que lleva el documento como referencia.
   - Si una reimportación de la lista trae ese modelo o madera, deja de estar fuera de catálogo.
6. **Historial `despacho_historico`**, de solo inserción (trigger y sin UPDATE/DELETE para la app). Guarda cada fila de `Despachos` tal cual. Las filas con datos malos (sin código numérico, código repetido, fecha imposible) entran marcadas como dudosas. Los importes de las columnas sin encabezado no se guardan. Los nombres de cliente solo se muestran con `clientes.ver`.
7. **Carga inicial por consola**: `npm run cargar-inventario -- <archivo> [--simular] [--agregar]`, en una transacción.
   - Es idempotente: no repite puertas (por código) ni filas del historial (por huella de la fila).
   - Las puertas con cliente entran apartadas.
   - Se detiene si ya hay puertas en stock que no vienen de la planilla, salvo `--agregar`.
   - El informe y `audit_log` llevan solo conteos y números de fila, sin precios ni nombres de clientes.
8. **Migración 0019.** Convierte el stock de puertas que ya existía (por cantidad) en puertas con código de la serie: un ajuste negativo por artículo y uno positivo por puerta, con el motivo de la conversión. Recién después activa el trigger que exige la puerta.

## Consecuencias

- Una sola fuente: la planilla de la fábrica deja de usarse después de la carga inicial.
- Cada despacho sabe qué puertas salieron, y cada puerta muestra su historia completa, incluido el despacho antiguo.
- Una entrada de 50 puertas crea 50 movimientos. Es poco para el volumen esperado: miles por año.
- `pedidos-ciclo` y los tests de triggers pasan a contar movimientos de una puerta.
- Las puertas fuera de catálogo no se cotizan. Si se venden seguido, se agregan a la lista de precios y pasan al catálogo con la siguiente importación.

## Alternativas

- Stock por cantidad y el Excel para la ubicación y el código: descartado, son dos sistemas en paralelo.
- Cargar solo lo que calza con el catálogo: descartado, por la misma razón.
- Agregar las mamparas y las de segunda a la lista de precios antes de cargar: queda para cuando la fábrica fije sus precios.
- Importar el historial como movimientos: descartado, dejaría el stock en negativo porque no tiene entradas que lo respalden.
