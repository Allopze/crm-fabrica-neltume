# Evaluación del intérprete · openai/gpt-oss-120b

Fecha 07-10-2026 · proveedor groq · muestra de 8 casos (1,11,14,17,34,47,58,60) · **NO APROBADO**

Tokens medios por pedido: 2881 de entrada y 411 de salida. Groq no informó costos por llamada; el costo no se evalúa.

Identificadores de comparación: prompt acb16bf9dfa7 · casos 1827f0ffea9d.

| Criterio | Resultado | Meta | |
|---|---|---|---|
| Ítems exactos en casos claros (1) | 100 % | ≥ 90 % | ✓ |
| Ítems exactos con accesorios (2) | 100 % | ≥ 90 % | ✓ |
| Ambiguos sin completar en silencio (5) | 100 % | 100 % | ✓ |
| Latencia p90 | 27,7 s | ≤ 15 s | ✗ |
| Costo medio por pedido | US$ 0,0000 | ≤ US$ 0,10 | sin tarifa |

| # | Grupo | Resultado | Obtenido | Latencia | Costo US$ | Motivo |
|---|---|---|---|---|---|---|
| 1 | claro | ✓ | NEL-R-4-B ×3 ok | 1.7 s | 0,0000 |  |
| 11 | ambiguo | ✓ | — ×4 por_confirmar | 9.3 s | 0,0000 |  |
| 14 | ambiguo | ✓ | TOLT-R-4-C ×2 a_pedido | 21.5 s | 0,0000 |  |
| 17 | ambiguo | ✓ | — ×2 por_confirmar<br>— ×1 por_confirmar | 6.5 s | 0,0000 |  |
| 34 | accesorio | ✓ | MAR-O-2X4-B ×3 ok | 23.2 s | 0,0000 |  |
| 47 | accesorio | ✓ | HUER-L-3-A ×1 ok<br>MAR-L-2X4-A ×1 ok | 23.6 s | 0,0000 |  |
| 58 | ambiguo | ✓ | — ×4 por_confirmar<br>— ×2 por_confirmar | 24.5 s | 0,0000 |  |
| 60 | ambiguo | ✓ | LIC-L-4-B ×1 ok<br>— ×3 por_confirmar | 27.7 s | 0,0000 |  |
