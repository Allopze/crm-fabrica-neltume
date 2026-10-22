# ADR-0022 — Groq deja de ser proveedor de IA

**Estado:** aceptado (pedido por el usuario el 22-10-2026; Fase 18) · **Fecha:** 22-10-2026 · **Refs:** REQ-ADM-4.1–4.3, REQ-COT-2.x, REQ-NFR-5 · modifica ADR-0009 y ADR-0015.

## Contexto

ADR-0009 permitió elegir Command Code o Groq en Ajustes de IA. Groq traía un adaptador propio, un catálogo con límites del plan Free y una confirmación manual de retención cero (Zero Data Retention), porque su API no permite comprobarla. El proveedor de referencia del proyecto es Command Code (ADR-0001, AGENTS.md) y el usuario decidió dejar solo ese.

## Decisión

- Se retiran el adaptador de Groq, su catálogo y sus límites, la confirmación de retención cero, la opción en `npm run eval:ia` y las variables `GROQ_API_KEY` y `GROQ_API_BASE_URL` (Compose, `.env.example`, `.env.worker.example`).
- Ajustes de IA elige solo el modelo de Command Code. Command Code siempre pide retención cero (`x-cmd-zdr: 1`), así que no hace falta confirmarla a mano. `PUT /api/v1/ajustes/ia` acepta `proveedorActivo` (solo `commandcode`) y `modelo`; `groqZdrConfirmado` y `proveedorActivo: "groq"` se rechazan con 400.
- La interfaz sigue siendo agnóstica (`src/ai/interfaz.ts`, ADR-0001): sumar otro proveedor más adelante vuelve a ser un adaptador y una entrada en `PROVEEDORES`.
- Una configuración guardada con Groq se lee como «sin proveedor». El worker no la usa, las cotizaciones nuevas quedan `ia_fallida` con la cotización manual disponible (REQ-COT-2.7) y Ajustes avisa que no hay un modelo activo hasta que alguien elija uno de Command Code. No se reescribe la fila con una migración: el cambio de configuración lo hace una persona desde Ajustes y queda auditado.

## Consecuencias

- El catálogo `ia.catalogo.groq` que quede en `parametro` se ignora. Los registros históricos (`llamada_ia` con proveedor `groq`, informes en `eval/informes/`) se conservan como historia.
- Las pruebas usan un Command Code simulado (`e2e/ia-mock.mts`, E2E 17) que exige la clave y el encabezado de retención cero.
- Quien tenga `GROQ_API_KEY` en `.env.worker.local` o en el `.env` de producción puede borrarla: ya nadie la lee.
