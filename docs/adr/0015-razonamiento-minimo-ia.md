# ADR-0015 — Variante sin razonamiento y esfuerzo mínimo

**Estado:** aceptado y aclarado por el usuario · **Fecha:** 07-10-2026 · **Refs:** REQ-COT-2.17, REQ-ADM-4.x, ADR-0009.

## Contexto

Hoy ambos adaptadores envían `temperature: 0` y no eligen el esfuerzo de razonamiento. Un mismo valor de `reasoning_effort` no sirve para todo el catálogo: Groq acepta `none` para Qwen 3 y `low` como mínimo para GPT-OSS; rechaza valores no admitidos con 400. La Provider API de Command Code documenta el formato Chat Completions, pero no una regla universal para desactivar el razonamiento en todos sus modelos.

## Decisión

- Por cada modelo y proveedor, usar el control comprobado de menor razonamiento disponible. Si hay una variante sin razonamiento seleccionable en esa API, usarla; de lo contrario, si acepta niveles de esfuerzo, enviar el mínimo admitido. Si no admite un control comprobado, omitirlo y permitir el modelo si cumple las demás reglas del catálogo.
- Groq Qwen 3: `reasoning_effort: "none"`. Groq GPT-OSS 20B/120B: `reasoning_effort: "low"`. No confundir `reasoning_format: "hidden"` con desactivar razonamiento: solo oculta su contenido en la respuesta.
- En Command Code, no suponer que un sufijo del nombre ni un parámetro genérico funciona en todo el catálogo. GPT-6 Luna aceptó `low` con `x-cmd-zdr: 1` y la herramienta forzada. Una petición sintética a Qwen 3.7 Flash rechazó `none`; con `enable_thinking: false` siguió informando tokens de razonamiento. Qwen sigue seleccionable sin ese parámetro, según la aclaración del usuario.
- Aplicar la misma política a la primera lectura, la corrección de cobertura y la evaluación con modelo real. Mostrar en Ajustes el modo efectivo o que se usa el valor predeterminado del proveedor. Comprobar con HTTP simulado los parámetros enviados y la activación de un modelo sin control de effort. La evaluación real permanece informativa, según ADR-0009.

## Consecuencias

Qwen 3.7 Flash y otros modelos sin control comprobado conservan su disponibilidad, aunque el proveedor puede razonar según su configuración predeterminada. El esfuerzo mínimo se garantiza solo en los perfiles con control verificado. Conviene repetir `npm run eval:ia` tras incorporar un perfil; la cotización manual sigue disponible si un proveedor falla.

## Fuentes oficiales

- [Groq: referencia de la API](https://console.groq.com/docs/api-reference) y [modos de razonamiento](https://console.groq.com/docs/reasoning).
- [Command Code: Provider API](https://commandcode.ai/docs/provider).
