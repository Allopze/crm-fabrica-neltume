# ADR-0004 — Generación de PDF en el servidor con react-pdf

**Estado:** aceptado · **Fecha:** 05-10-2026 · **Refs:** REQ-COT-4.1–4.3, 8.1

## Contexto
La cotización aprobada y la nota de pedido deben salir en PDF con logo, en formato chileno, desde datos congelados y solo si están aprobadas. El despliegue es un contenedor Node sin navegador.

## Decisión
- Generar el PDF en `app` con `@react-pdf/renderer`, desde los datos congelados de la BD (nunca desde la UI). Plantillas en `src/domain/pdf/`.
- Se genera bajo demanda en cada descarga, es determinista para la misma cotización y queda auditado. No se almacena: la fuente de verdad son los datos congelados.
- Las fuentes y el logo van embebidos en la imagen (no se piden por red).

## Consecuencias
- No se necesita Chromium en el contenedor (imagen más liviana y menor superficie).
- El diseño del PDF se hace con componentes y no con HTML/CSS completo, con menos libertad tipográfica.
- Si hiciera falta un PDF idéntico al Excel actual, se revisará este ADR.

## Alternativas
HTML + Chromium headless (Playwright o Puppeteer): descartado por peso de imagen y memoria · pdfkit (más bajo nivel y más código).
