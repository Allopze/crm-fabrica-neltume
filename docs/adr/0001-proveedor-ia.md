# ADR-0001 — Proveedor y modelo de IA: Command Code Provider API

**Estado:** aceptado (el modelo concreto se elige con la evaluación) · **Fecha:** 05-10-2026 · **Refs:** REQ-COT-2.x, REQ-NFR-1, 2, 5

## Contexto
El usuario definió que el LLM se consume vía Command Code. Su Provider API expone endpoints compatibles con OpenAI (`/provider/v1/chat/completions`, `/responses`) y Anthropic (`/messages`), lista modelos en `/provider/v1/models`, soporta tool calling y streaming, y ofrece Zero Data Retention con la cabecera `x-cmd-zdr: 1`. La documentación no cubre salida con JSON schema nativo, prompt caching, SLA ni límites exactos.

## Decisión
- Usar `/provider/v1/chat/completions` (formato OpenAI) con tool calling forzado a `proponer_items` y la cabecera `x-cmd-zdr: 1` siempre.
- Detrás de una interfaz propia en `src/ai/` (`interpretarPedido(texto, catalogo) → Propuesta`). Lo específico del proveedor vive en `src/ai/proveedores/commandcode.ts`.
- El modelo se configura en `CMD_MODEL` y se elige entre 2 o 3 candidatos con el set de AI.md §6: gana el más barato que cumpla el criterio.
- Validación estricta en el backend (Zod), sin depender de garantías de formato del proveedor.

## Consecuencias
- Cambiar de proveedor solo requiere una nueva implementación de la interfaz.
- Riesgos abiertos: términos de uso en producción, límites de tasa y continuidad del servicio. Mitigación: timeouts, reintentos acotados y la cotización manual siempre disponible (REQ-COT-2.7).
- Si no hay un proveedor con ZDR disponible para el modelo, la llamada falla: es preferible a enviar datos sin ZDR.

## Alternativas
API directa de Anthropic u OpenAI (descartada por decisión del usuario; queda como plan B gracias a la interfaz) · modelo local (descartado por costo de hardware y calidad).
