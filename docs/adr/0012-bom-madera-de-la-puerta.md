# ADR-0012 — BOM con «madera de la puerta»

**Estado:** aceptado (opción A, aprobada por el usuario, 06-10-2026) · **Refs:** REQ-MP-3.1, 3.4, 3.5, 4.1, 4.2 · TASKS T2.7 · DATA-MODEL §2

## Contexto
El BOM era por modelo (y opcionalmente por medida), sin madera. Una Neltume en raulí y una en lenga usaban la misma receta, así que descontaban la misma tabla. El insumo principal, la madera, quedaba mal.

Al revisar los datos se vio que el Excel del cotizador ya trae las **pulgadas por artículo** (las 8.316 puertas y los accesorios) y que son **idénticas en las cuatro maderas**: en los 2.079 grupos de mismo modelo, ancho y alto no hay una sola diferencia. Lo que cambia la madera es el insumo, no la cantidad.

## Decisión (opción A)
- **Línea especial en el BOM:** una `bom_linea` puede ser la «madera de la puerta» (`madera_puerta`, sin `materia_prima_id`). Su `cantidad` es un **factor** sobre las pulgadas del artículo; 1 = tal cual, y permite ajustar la merma.
- **Asociación de cada madera:** `madera_insumo` dice de qué materia prima se descuenta cada madera (raulí → «Pulgadas de raulí», …). Se edita en Producción con `mp.editar` y queda auditada.
- **Al cerrar una orden,** por cada artículo se descuenta `pulgadas del artículo × factor × cantidad` de la materia prima de su madera. Si falta la asociación o el artículo no tiene pulgadas, el cierre se rechaza con `BOM_INCOMPLETO` (409) e indica qué falta; nunca se completa en silencio.
- **Carga inicial (T2.7):** `scripts/cargar-bom-real.mts` (lógica en `src/domain/bom-real.ts`) carga lo que entregó la fábrica, solo nombres, unidades y usos, sin montos:
  - las materias primas reales;
  - las cuatro asociaciones de madera;
  - un BOM real por modelo:
    - puertas: madera × 1 más los usos declarados (lijas de banda 1/70, lija manual, film y silicona 1/10);
    - accesorios: solo la madera.
  
  Es idempotente y no reemplaza un BOM real definido después.

## Consecuencias
- Una receta sirve para las cuatro maderas y todas las medidas, con las pulgadas exactas de cada artículo.
- Quedan pendientes con la fábrica:
  - **Qué pulgadas valen.** Su hoja «Pulgadas por puerta» da en general menos que el cotizador (115 de 120 combinaciones en alto 2,00 difieren, a menudo cerca de un 10 %). Si el cotizador incluye merma, el factor 1 es correcto; si no, se ajusta el factor.
  - **El uso por puerta de Titebond, tarugos, retape y adhesivo.**
  - **El stock inicial y los mínimos.**
- Los BOM de demostración siguen funcionando: una línea normal no cambia.

## Alternativas
- **B: un BOM por modelo y madera.** Es más simple, pero cuadruplica las recetas y repite datos que el catálogo ya tiene.
- **Exigir a la fábrica las pulgadas por modelo y medida:** ya están en el cotizador.
