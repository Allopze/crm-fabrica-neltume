# ADR-0013 — Correcciones deterministas y dudas de la IA que no bloquean

**Estado:** aceptado (A y B, aprobados por el usuario el 07-10-2026) e implementado en T7.5 · **Refs:** REQ-COT-2.14, 2.15, 2.16 · AI.md §2 · AGENTS regla 2 · TASKS T7.5

## Contexto
Hoy el backend nunca corrige a la IA (AI.md §2: «Nunca corrige»). Cualquier texto en `dudas` deja el ítem por confirmar, aunque el dato esté completo y anclado al pedido. El cotizador de la tienda (`referencia/`) hace dos cosas distintas, y con ellas logra 249 de 250 conversaciones correctas con el mismo modelo (Qwen3.7-Flash, semilla 5):
- **`anclarFrases` corrige** lo que la frase del ítem dice sin ambigüedad: una sola madera, sección, cantidad o par de medidas. Por ejemplo, «marcos mara» leído como otra madera, «media docena» leída como 0,5 o «1230 x 2600 mm» leído como 12,3 m.
- **La IA no tiene un campo `dudas`.** Lo que falta va en null y el sistema decide qué preguntar. Una duda inventada nunca bloquea.

T7.1 ataca las dudas espurias solo con el prompt; un modelo más débil puede seguir inventándolas.

## Propuesta (dos partes, aprobables por separado)
**A. Corrección determinista acotada.** Si la frase literal del ítem contiene **exactamente un** valor de un campo y la IA propuso otro, se usa el de la frase y se registra un aviso visible («Corregí la madera a Raulí, como dice la línea»). Aplica a madera, escuadría o sección, cantidad y par de medidas. Con dos o más valores en la frase, o si la frase no está tal cual en el pedido, no se corrige: queda la duda de hoy. La interpretación cruda sigue guardada en `interpretacion_ia` y la corrección queda en la alerta del borrador.

**B. Dudas que no bloquean.** Una duda de la IA solo deja el ítem por confirmar si el backend no puede verificarlo, es decir, si falta un campo, no está anclado o no existe en el catálogo. Si todo está completo, anclado y existe, la duda se muestra como nota del ítem («La IA comentó: …»), sin bloquear la aprobación. Las dudas que genera el propio backend (anclaje, mapeo) siguen bloqueando.

## Consecuencias
- A cambia la frase «nunca corrige» de AI.md §2 y REQ-COT-2.15 («sin corregirlo»). Respeta la regla 2 de AGENTS, porque el dato sale del texto del cliente y no se completa: se elige entre lo que el cliente escribió y lo que leyó la IA. Hay que actualizar SPEC y AI.md.
- B cambia cuándo un ítem queda por confirmar. Una ambigüedad real que solo la IA detecte (p. ej. «la misma de siempre») ya no bloquearía si los campos vinieron completos. Mitigación: los campos completos tienen que estar anclados al texto, así que una lectura inventada igual queda en duda.
- Ambas se miden con `eval:ia` (set fijo y generado) antes y después. Si la parte B no mejora la precisión sin bajar «ambiguos sin completar en silencio» del 100 %, se descarta.

## Implementación (T7.5)
- **A** vive en `src/domain/cotizaciones/correcciones.ts` y corre en `anclarPropuesta` antes del anclaje. Detalles: solo corrige un valor que la IA propuso (nunca un null) y no toca la madera en una línea con otro pino («pino radiata»).
- **B** vive en `mapearConDudasIa` (`mapear.ts`), que usan el worker y `eval:ia`. Si el ítem queda por confirmar, se mapea igual que antes, con las dudas de la IA, así que el texto que ve el vendedor no cambia.
