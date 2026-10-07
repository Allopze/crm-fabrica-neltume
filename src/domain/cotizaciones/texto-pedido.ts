// Lectura del texto del pedido compartida por el anclaje y las correcciones (REQ-COT-2.14, 2.15; ADR-0013). Pura.
import { ALIAS_MADERA } from "./mapear";

export const plano = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const UNIDADES: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
};

/** Números escritos con dígitos («2,10» → 2.1; «10.000» → 10000 y 10). */
export function cifras(texto: string): number[] {
  const r: number[] = [];
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const t = m[0];
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) r.push(Number(t.replace(/\./g, "")));
    r.push(Number(t.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")), Number(t.replace(",", ".")));
  }
  return r.filter(Number.isFinite);
}

/** Cantidades dichas en una frase, sin contar medidas: dígitos y palabras («tres», «un par», «media docena»). */
export function cantidadesDichas(frase: string): number[] {
  let t = plano(frase)
    .replace(/\d+(?:[.,]\d+)?\s*[x×*]\s*\d+(?:[.,]\d+)?/g, " ") // 90x210, 2x4
    .replace(/\d+(?:[.,]\d+)?\s*(?:cm|mm|mts?|metros?|m\b|pulgadas?|pulg|")/g, " ") // 2,10 m · 6 pulgadas
    .replace(/\b(?:de|alto|ancho|largo|medida|por)\s+\d+(?:[.,]\d+)?/g, " "); // «de 2,10», «por 210»
  const r: number[] = [];
  if (/\bmedia docena\b/.test(t)) { r.push(6); t = t.replace(/\bmedia docena\b/g, " "); }
  if (/\b(?:una|1) docena\b/.test(t)) { r.push(12); t = t.replace(/\b(?:una|1) docena\b/g, " "); }
  if (/\bun par\b/.test(t)) { r.push(2); t = t.replace(/\bun par\b/g, " "); }
  for (const m of t.matchAll(/\b\d{1,4}\b/g)) r.push(Number(m[0]));
  for (const p of t.split(/[^a-zñ]+/)) if (p in UNIDADES) r.push(UNIDADES[p]);
  return r;
}

export const CONTINUA = /\b(?:otr[oa]s?|igual(?:es)?|mism[oa]s?|con su|con sus|su marco|sus marcos)\b/;
export const aparece = (mensaje: string, frase: string) => plano(mensaje).replace(/\s+/g, " ").includes(plano(frase).replace(/\s+/g, " ").trim());

/** Maderas nombradas en un texto («oregón», «pino», «raulí»), con su nombre del catálogo. */
export function maderasEn(texto: string): Set<string> {
  const t = plano(texto);
  return new Set(Object.entries(ALIAS_MADERA).filter(([a]) => new RegExp(`\\b${plano(a)}\\b`).test(t)).map(([, m]) => m));
}
