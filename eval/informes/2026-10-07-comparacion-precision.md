# Comparación de precisión del cotizador IA · 07-10-2026

Refs: REQ-COT-2.14/2.15 · ADR-0014 · AI.md §6 · TASKS T7.6.

Se ejecutó el flujo completo: interpretación, anclaje al texto, corrección acotada y mapeo contra el catálogo. Los 62 casos fijos son iguales para Qwen3.7 Flash y GPT-6 Luna (prompt `acb16bf9dfa7`, casos `2512c75c3d03`, pipeline `d259d49c64eb`). Los 100 generados usan la misma semilla 5. Los criterios de las cuatro series principales se recalcularon a partir de los resultados JSON guardados con el evaluador final, que añade la exigencia de cero ítems sobrantes en casos claros y de accesorios. Ninguno de esos cuatro resultados cambió de aprobación. El costo es una estimación a partir de las tarifas del catálogo; la latencia incluye el flujo completo por pedido.

| Modelo autorizado | Set fijo | Generado (semilla 5) | p90 fijo / generado | Costo medio fijo / generado | Criterios AI.md §6 |
|---|---:|---:|---:|---:|---|
| [GPT-6 Luna](2026-10-07-gpt-6-luna-r2.md) | 62/62 | [98/100](2026-10-07-gpt-6-luna-gen100-s5.md) | 7,0 / 4,9 s | US$ 0,0004 / 0,0003 | Cumple ambos sets |
| [Qwen3.7 Flash](2026-10-07-Qwen_Qwen3.7-Flash-r3.md) | 60/62 | [99/100](2026-10-07-Qwen_Qwen3.7-Flash-gen100-s5.md) | 4,5 / 4,0 s | US$ 0,0001 / 0,0001 | Falla en ambiguos del set fijo (22/24) |

Luna resolvió el caso de «Tolten» fuera de medida y no añadió un pendiente sobrante; Qwen falló los casos fijos 14 y 44. En los generados, Qwen falló un pedido con «Tolten» (52); Luna dejó dos pedidos con pilastra por confirmar (6 y 59). El set generado comprueba variedad del catálogo, pero se crea con reglas similares a las del mapeo y no sustituye pedidos reales anotados por vendedores. Un 62/62 no prueba precisión perfecta en producción.

## Otros modelos autorizados

| Proveedor y modelo | Alcance | Resultado | Límite observado |
|---|---:|---:|---|
| Command Code [Ling 3.0 Flash Sante gratis](2026-10-07-inclusionai_ling-3.0-flash-sante_free.md) | 62 fijos | 59/62 | p90 22,1 s; salidas inválidas |
| Command Code [Ling 3.1 Flash gratis](2026-10-07-inclusionai_ling-3.1-flash_free.md) | 62 fijos | 51/62 | 429 y tiempos de espera; informe anterior a la corrección de tarifa cero |
| Command Code [Laguna S 2.1 gratis](2026-10-07-poolside_laguna-s-2.1-free.md) | 62 fijos | 0/62 | La cuenta respondió que no había proveedor con retención cero disponible (`x-cmd-zdr: 1`) |
| Groq [GPT OSS 120B](2026-10-07-openai_gpt-oss-120b-m8-1827f0ffea9d.md) | Muestra de 8 | 8/8 | p90 27,7 s; una corrida completa se detuvo por latencia y 429 |
| Groq [Qwen3.8 27B](2026-10-07-qwen_qwen3.8-27b-m8-1827f0ffea9d.md) | Muestra de 8 | 7/8 | p90 30,3 s y 429 |
| Groq [GPT OSS 20B](2026-10-07-openai_gpt-oss-20b-m8-1827f0ffea9d.md) | Muestra de 8 | 0/8 | 429 en todos los casos |
| Groq [GPT OSS Safeguard 20B](2026-10-07-openai_gpt-oss-safeguard-20b-m1-8a3abd1babe4.md) | Muestra de 1 | 0/1 | 403 del proveedor |

Las muestras de Groq sirven para descartar esta configuración observada; no permiten estimar su precisión global. La cuenta y sus cuotas pueden afectar el resultado. Groq no informó costo por llamada en estas corridas, por lo que no se evaluó el umbral de costo. No se probaron modelos ajenos a la autorización del usuario.

## Decisión para revisión

GPT-6 Luna es la mejor opción medida para el modelo activo: pasa ambos sets y el conjunto fijo completo, con el p90 bajo la meta de 15 s. Qwen3.7 Flash es más rápido y barato en estas corridas, pero falla la meta de 100 % de ambiguos del set fijo; requiere revisión humana, igual que cualquier borrador. Este trabajo no cambió el modelo activo en Ajustes de IA. El próximo aumento de confianza debe venir de pedidos reales anonimizados y etiquetados, especialmente nombres próximos entre sí y accesorios que se dejan pendientes.
