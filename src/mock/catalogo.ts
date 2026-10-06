// Datos simulados del prototipo. Precios FICTICIOS: no provienen del Excel (AGENTS.md).

export type MaderaId = "O" | "L" | "M" | "R";

export const maderas: Record<MaderaId, { nombre: string; css: string }> = {
  O: { nombre: "Pino Oregón", css: "var(--pino-oregon)" },
  L: { nombre: "Lenga", css: "var(--lenga)" },
  M: { nombre: "Mara", css: "var(--mara)" },
  R: { nombre: "Raulí", css: "var(--rauli-madera)" },
};

export const anchos = [
  "0,60 a 0,65", "0,70 a 0,75", "0,80 a 0,85", "0,90 a 0,95", "1,00 a 1,05",
  "1,10 a 1,15", "1,20 a 1,25", "1,30 a 1,35", "1,40 a 1,45",
];

export const altos: Record<string, number> = { A: 2.0, B: 2.1, C: 2.2, D: 2.3, E: 2.4, F: 2.5, G: 2.6 };

export type TipoPuerta = "Bloque" | "Panel" | "Especial";

export interface Articulo {
  codigo: string;
  modelo: string;
  madera: MaderaId;
  ancho: string;
  alto: number;
  tipo: TipoPuerta;
  existencia: number;
  reservado: number;
  minimo: number;
  precioNeto: number;
}

export const articulos: Articulo[] = [
  { codigo: "NEL-R-4-B", modelo: "Neltume", madera: "R", ancho: anchos[3], alto: 2.1, tipo: "Bloque", existencia: 2, reservado: 0, minimo: 4, precioNeto: 248000 },
  { codigo: "NEL-M-3-B", modelo: "Neltume", madera: "M", ancho: anchos[2], alto: 2.1, tipo: "Bloque", existencia: 7, reservado: 0, minimo: 4, precioNeto: 219000 },
  { codigo: "MOL-L-2-B", modelo: "Molco", madera: "L", ancho: anchos[1], alto: 2.1, tipo: "Panel", existencia: 5, reservado: 1, minimo: 3, precioNeto: 196000 },
  { codigo: "ANC-O-3-A", modelo: "Ancacomoe", madera: "O", ancho: anchos[2], alto: 2.0, tipo: "Bloque", existencia: 12, reservado: 4, minimo: 6, precioNeto: 162000 },
  { codigo: "HUIL-R-3-C", modelo: "Huilo Huilo", madera: "R", ancho: anchos[2], alto: 2.2, tipo: "Especial", existencia: 0, reservado: 0, minimo: 2, precioNeto: 312000 },
  { codigo: "LIC-L-4-B", modelo: "Lican", madera: "L", ancho: anchos[3], alto: 2.1, tipo: "Panel", existencia: 3, reservado: 0, minimo: 2, precioNeto: 224000 },
  { codigo: "TOLT-R-4-C", modelo: "Toltén", madera: "R", ancho: anchos[3], alto: 2.2, tipo: "Especial", existencia: 1, reservado: 0, minimo: 1, precioNeto: 338000 },
  { codigo: "FUY-O-2-A", modelo: "Fuy", madera: "O", ancho: anchos[1], alto: 2.0, tipo: "Panel", existencia: 9, reservado: 2, minimo: 4, precioNeto: 149000 },
  { codigo: "RUP-M-3-B", modelo: "Rupanco", madera: "M", ancho: anchos[2], alto: 2.1, tipo: "Bloque", existencia: 4, reservado: 0, minimo: 4, precioNeto: 205000 },
  { codigo: "PAL-R-4-B", modelo: "Palena", madera: "R", ancho: anchos[3], alto: 2.1, tipo: "Panel", existencia: 6, reservado: 3, minimo: 2, precioNeto: 276000 },
  { codigo: "BAK-L-9-G", modelo: "Baker", madera: "L", ancho: anchos[8], alto: 2.6, tipo: "Especial", existencia: 1, reservado: 1, minimo: 0, precioNeto: 455000 },
  { codigo: "MAR-O-2X4-B", modelo: "Marco", madera: "O", ancho: "2x4 pulg.", alto: 2.1, tipo: "Bloque", existencia: 18, reservado: 0, minimo: 10, precioNeto: 38000 },
];

export const recargos: Record<TipoPuerta, number> = { Bloque: 0.12, Panel: 0.15, Especial: 0.2 };

export function disponible(a: Articulo): number {
  return a.existencia - a.reservado;
}

export function buscarArticulo(codigo: string): Articulo | undefined {
  return articulos.find((a) => a.codigo === codigo);
}
