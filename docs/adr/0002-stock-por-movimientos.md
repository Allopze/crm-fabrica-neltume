# ADR-0002 — Stock como suma de movimientos inmutables

**Estado:** aceptado · **Fecha:** 05-10-2026 · **Refs:** REQ-STK-2..7, REQ-MP-2, 4, 5, AGENTS regla 5

## Contexto
Neltume no tiene control formal de inventario y la regla de dominio exige trazabilidad total: nunca editar saldos.

## Decisión
- Una sola tabla `movimiento` para puertas y materias primas (artículo XOR materia prima), con tipos `entrada_produccion`, `recepcion`, `salida_despacho`, `consumo_produccion`, `ajuste`, `reserva` y `liberacion`.
- El saldo (existencia, reservado y disponible) es una vista que suma movimientos; no hay columna de saldo editable.
- La inmutabilidad se impone en la BD: un trigger rechaza UPDATE y DELETE, y el rol de la app no tiene esos permisos.
- Las correcciones solo se hacen con `ajuste` con motivo. Cada POST de movimiento exige `Idempotency-Key`.
- La reserva es un movimiento, creado al pasar a nota de pedido, sin dejar nunca el disponible en negativo.

## Consecuencias
- Auditoría e historial completos sin trabajo extra; el conteo físico se concilia con ajustes.
- El cálculo de saldo crece con el volumen. Con el volumen esperado (miles de movimientos al año) una vista indexada basta. Si hiciera falta, se agrega una vista materializada o snapshots mensuales, sin cambiar la regla.

## Alternativas
Saldo editable más bitácora (descartado: viola la regla de dominio) · tablas separadas por tipo de ítem (descartado: duplica la lógica).
