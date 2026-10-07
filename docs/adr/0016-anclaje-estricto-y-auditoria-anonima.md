# ADR-0016 — Ítem no verificable bloquea y denegaciones anónimas agregadas

**Estado:** aceptado por el usuario (07-10-2026, auditoría integral, Fase 9) · **Fecha:** 07-10-2026 · **Refs:** REQ-COT-2.14, 2.15, REQ-ADM-3.5, AGENTS reglas 1, 2 y 7 · modifica AI.md §2 («No verificado») y ADR-0013 B.

## Contexto

La auditoría del 07-10-2026 encontró dos decisiones que contradecían reglas del proyecto:

1. **Anclaje.** Si la IA no citaba tal cual la frase de un ítem (`texto_fuente` parafraseado), el anclaje no verificaba ni la cantidad ni el modelo: solo exigía que la medida y la madera aparecieran en algún lugar del pedido. El ítem quedaba `ok` con una alerta que no bloqueaba. «1 Lican raulí 90x210» se aprobó como Neltume, y «1 Neltume» como ×7. Esto contradice REQ-COT-2.14 («IF no lo está THEN por confirmar») y la regla 2 de AGENTS (nada se completa en silencio).
2. **Auditoría anónima.** Cada petición sin sesión escribía una fila en `audit_log`, que es inmutable y se retiene 6 años. Cualquiera en internet podía hacer crecer la BD sin límite (200 GET anónimos = 200 filas), y no había forma de purgarla.

## Decisión

- **Un ítem cuya frase no está tal cual en el pedido queda `por_confirmar`** con una duda del sistema («No pude verificar este ítem contra su línea del pedido…»). Como toda duda del sistema, bloquea la aprobación (ADR-0013 B no la convierte en nota). La alerta «No pude verificar el ítem N» se mantiene en el borrador.
  - Para no castigar citas honestas, la comparación literal ignora mayúsculas, tildes, puntuación, comillas y espacios repetidos.
  - Además, un monto escrito en el pedido («$50.000», «50 lucas», «50 mil») ya no respalda una cantidad ni una medida (regla 1).
- **Denegaciones anónimas agregadas.** Una denegación sin usuario (sin sesión, fallo de login o bloqueo por intentos) se registra en `audit_log` como máximo una vez por IP, acción y motivo cada 15 minutos, con `despues.agregado = true`. Todas se escriben en el log JSON. Las denegaciones de usuarios autenticados se siguen auditando una por una.

## Consecuencias

- La tasa de cotizaciones sin editar ítems (O2) puede bajar con modelos que parafrasean. El prompt ya exige citar tal cual; `npm run eval:ia` mide el efecto. Ante la duda, la persona resuelve el ítem en la revisión, como con cualquier otro por confirmar.
- `audit_log` crece de forma acotada ante tráfico anónimo; el detalle de cada petición anónima queda solo en los logs (rotación 10 MB × 5). Cloudflare sigue siendo la primera barrera (RUNBOOK §3).
