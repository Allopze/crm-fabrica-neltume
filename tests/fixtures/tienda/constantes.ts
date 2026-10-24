// Constantes de prueba de la API de la tienda (ADR-0023), sin dependencias: las usa playwright.config.ts.
/** Secreto solo de pruebas (≥ 32 caracteres); nunca se usa fuera de unit, integración y E2E. */
export const SECRETO_PRUEBA = "secreto-de-pruebas-de-la-integracion-tienda-0001";
/** RUT del cliente tienda que registra la suite E2E 15 y usan las pruebas de integración. */
export const RUT_TIENDA_PRUEBA = "76.059.066-5";
