# ADR-0020 — Abono y pagos de la nota de pedido

**Estado:** aceptado (aprobado por el usuario el 14-10-2026; Fase 12) · **Fecha:** 13-10-2026 · **Refs:** REQ-COT-8.5, 8.10–8.16, ADR-0002, ADR-0017, SECURITY T2, AGENTS reglas 5, 6, 7 y 9.

## Contexto

La fábrica no fabrica sin compromiso del cliente. Lo que dijo el usuario (13-10-2026):

- Para producir se exige un **abono mínimo del 50 %**. Se puede pagar el **total** de una vez.
- El **saldo se paga antes de despachar o retirar**.
- Si un pedido con abono se cancela, **basta con dejarlo anotado**: la app no gestiona devoluciones.

La nota de pedido ya tiene su ciclo (`pendiente → en_produccion → lista → despachada`, más `cancelada`), pero no sabe nada de pagos. Hoy se puede producir y despachar sin haber cobrado nada.

## Decisión

1. **Pagos de solo inserción.** Se crea la tabla `pago_pedido`, con un trigger que impide UPDATE, DELETE y TRUNCATE, igual que `movimiento` (ADR-0002). Cada fila guarda: monto en CLP entero, fecha del comprobante, medio de pago, N.º de comprobante opcional, quién lo registró y cuándo. Un error se corrige con un **reverso**: una fila que anula un pago (monto negativo igual al original, motivo obligatorio, uno solo por pago). No se guardan números de tarjeta ni de cuenta.
2. **Estado de pago calculado, nunca guardado.**
   - pagado = suma de los pagos;
   - saldo = total con IVA de la nota (el mismo de su PDF) − pagado;
   - abono requerido = total × `abono_pct` (parámetro, 50 por defecto), redondeado al peso hacia arriba.
   - Estados: **sin abono** (pagado < requerido) → **abonado** (requerido ≤ pagado < total) → **pagado** (saldo 0).
   - Un pago no puede superar el saldo.
3. **Dos compuertas en el ciclo.**
   - **Pasar a producción** exige el pedido *abonado* o *pagado*.
   - **Despachar** exige el pedido *pagado*.
   - Pasar de `pendiente` a `lista` cuando todo está en stock no exige abono, porque no se fabrica nada; el despacho igual exige el pago total.
   - Cada compuerta admite una **excepción en ese pedido**, con motivo obligatorio, quién y cuándo, y queda en la auditoría. Es el mismo criterio que el descuento (regla 9): una excepción manual, nunca una regla silenciosa.
4. **Permiso nuevo `pagos.registrar`** para registrar pagos, reversos y excepciones (regla 6). Cada endpoint tiene su prueba de 403 y su fila en `audit_log` (regla 7).
5. **Importe aceptado solo aquí.** El `monto` del pago es la única excepción nueva a SECURITY T2. Nunca entra en precios, descuentos ni totales de la cotización o del pedido: solo suma al pagado.
6. **Cancelación con pagos.** Se permite. Los pagos se conservan y el monto pagado queda escrito en la ficha cancelada y en la auditoría («pagado $X; sin devolución registrada»). No se registran pagos nuevos en una nota cancelada.
7. **Notas existentes.** Una columna `exige_pago` vale `false` en las notas creadas antes de esta migración y `true` en las nuevas. Así los pedidos en curso no quedan bloqueados y se ven como «sin control de pago».
8. **Documentos.**
   - El PDF de la cotización suma la línea «Condición de pago: N % de abono al confirmar y saldo antes del despacho o retiro», con N tomado del parámetro.
   - El PDF de la nota de pedido muestra lo pagado y el saldo.
9. **Tienda: por confirmar.** Se le aplica la misma regla. Si la tienda trabaja a crédito, se usa la excepción por pedido. Si se confirma que nunca abona, se agrega una marca por cliente en otra versión.

## Alternativas descartadas

- **Columna `estado_pago` editable:** se desincroniza de los montos y permite «marcar pagado» sin registrar el pago.
- **Mezclar el pago en el estado del pedido** (por ejemplo, «abonado» entre pendiente y en producción): mezcla dos ejes independientes. Un pedido puede estar *lista* y *abonado* a la vez.
- **Registrar devoluciones:** el usuario pidió solo dejarlo anotado, y la contabilidad sigue fuera del alcance, igual que la facturación.

## Consecuencias

- No se produce sin abono ni se despacha con saldo, salvo una excepción explícita y auditada.
- Una migración nueva (tabla, trigger, columnas de excepción y `exige_pago`, parámetro y permiso), endpoints con pruebas de 403 y de auditoría, y una prueba del trigger de solo inserción.
- La API acepta un importe más, acotado al pago, y SECURITY T2 lo documenta.
