import type { ModeloIA } from "./ajustes";

export const TOKENS_ENTRADA_ESTIMADOS = 4_000;
export const TOKENS_SALIDA_ESTIMADOS = 400;

/** Calcula el costo de referencia por llamada con el tamaño de pedido de AI.md §4. */
export function costoEstimadoUsd(modelo: ModeloIA): number {
  const entrada = modelo.precioEntradaUsdMTok;
  const salida = modelo.precioSalidaUsdMTok;
  if (entrada === undefined || salida === undefined) return Number.POSITIVE_INFINITY;
  return (entrada * TOKENS_ENTRADA_ESTIMADOS + salida * TOKENS_SALIDA_ESTIMADOS) / 1_000_000;
}

/** Ordena del menor al mayor costo estimado; los modelos sin tarifas quedan al final. */
export function ordenarPorCostoEstimado(modelos: ModeloIA[]): ModeloIA[] {
  return [...modelos].sort((a, b) => costoEstimadoUsd(a) - costoEstimadoUsd(b) || a.nombre.localeCompare(b.nombre, "es"));
}
