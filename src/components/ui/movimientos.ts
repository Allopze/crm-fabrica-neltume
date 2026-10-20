// Etiquetas de movimientos de stock en un solo lugar: la ficha del artículo y la de la puerta
// cuentan la misma historia, con el matiz de reserva/apartada.
const BASE: Record<string, string> = {
  entrada_produccion: "Entrada de producción",
  recepcion: "Recepción",
  salida_despacho: "Salida por despacho",
  consumo_produccion: "Consumo de producción",
  ajuste: "Ajuste",
  reserva: "Reserva",
  liberacion: "Liberación de reserva",
};

export function nombreMovimiento(tipo: string, vista: "articulo" | "puerta" = "articulo") {
  if (vista === "puerta" && tipo === "reserva") return "Apartada";
  if (vista === "puerta" && tipo === "liberacion") return "Liberada";
  return BASE[tipo] ?? tipo;
}
