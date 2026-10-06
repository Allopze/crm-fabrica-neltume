# ADR-0001 — Proveedor y modelo de IA: Command Code Provider API

**Estado:** aceptado; modelo elegido por evaluación el 06-10-2026 · **Fecha:** 05-10-2026 · **Refs:** REQ-COT-2.x, REQ-NFR-1, 2, 5

## Contexto
El usuario definió que el LLM se consume vía Command Code. Su Provider API expone endpoints compatibles con OpenAI (`/provider/v1/chat/completions`, `/responses`) y Anthropic (`/messages`), lista modelos en `/provider/v1/models`, soporta tool calling y streaming, y ofrece Zero Data Retention con la cabecera `x-cmd-zdr: 1`. La documentación no cubre salida con JSON schema nativo, prompt caching, SLA ni límites exactos.

## Decisión
- Usar `/provider/v1/chat/completions` (formato OpenAI) con tool calling forzado a `proponer_items` y la cabecera `x-cmd-zdr: 1` siempre.
- Detrás de una interfaz propia en `src/ai/` (`interpretarPedido(texto, catalogo) → Propuesta`). Lo específico del proveedor vive en `src/ai/proveedores/commandcode.ts`.
- El modelo se configura desde Ajustes de IA; `CMD_API_KEY` vive en el entorno privado del worker.
- Validación estricta en el backend (Zod), sin depender de garantías de formato del proveedor.

## Evaluación y modelo elegido (T2.2, 06-10-2026)

Set de AI.md §6 (24 casos) con el mismo camino que el worker. Candidatos rápidos con tool calling vía `/chat/completions`. Informes en `eval/informes/2026-10-06-*`.

| Modelo | Claros (ítems exactos) | Ambiguos | Maliciosos | p90 | Tokens medios (entrada / salida) |
|---|---|---|---|---|---|
| `google/gemini-3.5-flash` | 100 % | 100 % | 100 % | 5,8 s | 1.124 / 472 |
| `Qwen/Qwen3.7-Flash` | 85 % | 100 % | 100 % | 4,0 s | 1.547 / 173 |
| `deepseek/deepseek-v4-flash` | 100 % | 89 % (una respuesta sin la herramienta) | 100 % | 5,0 s | 1.536 / 315 |
| `google/gemini-3.8-flash` | 100 % | 56–67 % (timeouts) | 100 % | 40 s (con 3 intentos) | 937 / 283 |

- **`CMD_MODEL=google/gemini-3.5-flash`**: el único que cumple los criterios de calidad y latencia; repetido dos veces con el mismo resultado.
- **Costo:** `/provider/v1/models` no publica tarifas, así que el informe marca el costo «sin tarifa». Con los tokens medidos, incluso a US$ 5 / US$ 20 por millón (entrada / salida) serían ≈ US$ 0,015 por pedido, muy bajo el tope de US$ 0,10 (REQ-NFR-2). Se confirma al cargar las tarifas reales en `LLM_PRECIO_*` y volver a correr la evaluación.
- **Ajustes que salieron de la evaluación:**
  - Prompt: `dudas` solo para datos del producto, breves; la medida fuera de grilla no es duda; las instrucciones del cliente van a `alertas`; «iguales» copia el ítem anterior; la cantidad debe ser explícita; nunca sustituir un modelo por otro.
  - Esquema: `dudas` de hasta 300 caracteres.
  - Adaptador: tolera una `CMD_API_BASE_URL` copiada con la ruta del endpoint.
- `gemini-3.8-flash` (evaluado a pedido del usuario): tarda 17–22 s en los casos ambiguos 13, 15, 18 y 19. Con el timeout de 12 s terminan en `ia_fallida` (cotización manual, nunca completados en silencio). Con 60 s de diagnóstico el p90 fue 17,4 s y el caso 13 respondió sin la herramienta. **No aprobado**; el usuario confirmó mantener `gemini-3.5-flash`.
- La reevaluación al cambiar modelo/prompt o ampliar el set sigue siendo recomendable; ADR-0009 determina que es informativa y no bloquea la activación inmediata desde Ajustes.

### Reevaluación con el set ampliado (T5.10, 06-10-2026)

57 casos (24 propios + 33 de la tienda). Tarifa pública de `commandcode.ai/models`: US$ 1,50 / US$ 9,00 por millón (entrada / salida).

| Modelo | Claros (23) | Accesorios (10) | Ambiguos (19) | Maliciosos (5) | p90 | Costo medio |
|---|---|---|---|---|---|---|
| `google/gemini-3.5-flash` | 100 % | 100 % | 100 % | 100 % | 4,9 s | US$ 0,0072 |

**Aprobado; se mantiene.** Ajustes que salieron de esta corrida:
- **Tope de salida:** de 800 a 2.000 tokens (`LLM_MAX_TOKENS_SALIDA`). El caso 48 (cuatro líneas con dudas) se truncaba y respondía sin la herramienta 3 de 3 veces. `finish_reason: length` ahora es un error explícito.
- **Prompt:**
  - se envían los alias seguros de modelos («coscos» = COZ COZ);
  - las convenciones del rubro dejan de ser dudas: «de 4» = 2x4, un «juego» de marco = marco y «pino» a secas = Pino Oregón.
- **Anclaje** (portado de `anclarFrases` de la tienda):
  - el largo de un accesorio y la madera deben venir de su propia línea o de lo dicho para todo el pedido;
  - el «2x» de un marco es implícito.
- **T5.11** (anclaje por línea del modelo, la madera y las medidas, más una segunda pasada ante omisiones): sigue **aprobado**. 100 % en los cuatro grupos, p90 5,9 s, US$ 0,0077 por pedido; la segunda pasada sube los tokens medios de entrada de 1.586 a 1.676.

## Consecuencias
- Cambiar de proveedor solo requiere una nueva implementación de la interfaz.
- Riesgos abiertos: términos de uso en producción, límites de tasa y continuidad del servicio. Mitigación: timeouts, reintentos acotados y la cotización manual siempre disponible (REQ-COT-2.7).
- Si no hay un proveedor con ZDR disponible para el modelo, la llamada falla: es preferible a enviar datos sin ZDR.

## Alternativas
API directa de Anthropic u OpenAI (descartada por decisión del usuario; queda como plan B gracias a la interfaz) · modelo local (descartado por costo de hardware y calidad).
