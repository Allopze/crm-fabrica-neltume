# ADR-0014 — Pedidos por destino y evaluación completa de ítems

**Estado:** aprobado por el usuario el 07-10-2026 al pedir proceder con el análisis de precisión · **Refs:** REQ-COT-2.14/2.15 · AI.md §2, §6 · TASKS T7.6

## Contexto

Qwen3.7-Flash acertó todos los ítems claros y accesorios del set fijo del 07-10-2026, pero «2 para baño y 1 para dormitorio, algo económico» produjo cero ítems. La detección de omisiones exigía un nombre de producto o modelo y no pidió la segunda lectura. Además, el evaluador comprobaba solo los ítems `ok` de forma exhaustiva: un pendiente adicional o una cantidad equivocada en `a_pedido` podía pasar inadvertida.

## Decisión

- Una cantidad explícita junto a «para baño/dormitorio/pieza/habitación/cocina/living/oficina» cuenta como pedido elíptico omitido. Se pide la misma única segunda lectura ya existente.
- Si el grupo sigue omitido, el backend lo conserva como ítem `desconocido`, `por_confirmar`, con la cantidad literal y todos los atributos de producto en null. La alerta indica que el producto no se identificó. No asigna artículo, precio ni descuento; la interpretación cruda de la IA queda guardada.
- El evaluador consume cada ítem esperado una sola vez y falla ante ítems sobrantes o duplicados en cualquier estado. Compara código, cantidad y referencia cuando el caso los especifica. El resumen exige cero ítems sobrantes en casos claros y de accesorios; los casos que solo indican `todos` mantienen su semántica amplia.
- La evaluación reveló dos anclajes demasiado estrictos que se ajustan dentro de REQ-COT-2.13/2.15: «ambas de 80x200» respalda los dos ítems, y «su marco» puede conservar la herencia si es una cita literal de «con su marco».
- Se agregan casos sintéticos reservados para este patrón y se conservan los 57 previos. La evaluación con modelo real se limita a Qwen3.7-Flash, modelos Groq, modelos gratuitos de Command Code y GPT-6 Luna, conforme a la autorización del usuario.

## Consecuencias

Un pedido sin producto explícito deja una línea revisable en vez de desaparecer. La tasa nueva no se compara directamente con informes anteriores: el evaluador ahora detecta errores adicionales. Las pruebas con modelos reales siguen fuera de `npm test` y pueden consumir cuota; los pedidos reales que se añadan se anonimizan antes de guardarse como casos.
