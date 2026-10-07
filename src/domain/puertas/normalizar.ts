// Lectura de los datos de una puerta tal como los escribe la fábrica (ADR-0018). Puro: sin BD.
import { normalizar } from "../importacion/mapear";

export const UBICACION_POR_DEFECTO = "Fábrica";
const UBICACIONES: Record<string, string> = {
  "GALPON ARRIBA": "Galpón arriba", "GALPON ATRAS": "Galpón atrás", FABRICA: "Fábrica", FABIRCA: "Fábrica", TIENDA: "Tienda",
};

/** «GALPON ATRÁS» → «Galpón atrás»; «FABIRCA» → «Fábrica»; otra → con mayúscula inicial por palabra. */
export function normalizarUbicacion(texto: unknown): string {
  const limpio = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return UBICACION_POR_DEFECTO;
  return UBICACIONES[normalizar(limpio)] ?? limpio.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/** Un largo escrito en m (2,00), cm (90; 88,5; 240,6) o mm (2066) → mm; null si no es plausible para una puerta. */
function amm(texto: string): number | null {
  const v = Number(texto.replace(",", "."));
  if (!Number.isFinite(v) || v <= 0) return null;
  const mm = Math.round(v < 4 ? v * 1000 : v < 400 ? v * 10 : v);
  return mm >= 100 && mm <= 4000 ? mm : null;
}

/** «78 X 2,066» → { anchoMm: 780, altoMm: 2066 }; «88,5X2,10» → 885 × 2100. null si no se puede leer. */
export function leerMedida(texto: unknown): { anchoMm: number; altoMm: number } | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)$/.exec(String(texto ?? "").trim());
  if (!m) return null;
  const anchoMm = amm(m[1]);
  const altoMm = amm(m[2]);
  return anchoMm && altoMm ? { anchoMm, altoMm } : null;
}

/** «MOLCO SEGUNDA» → { modelo: "MOLCO", calidad: "segunda" }. El nombre queda normalizado como en el catálogo. */
export function leerModelo(texto: unknown): { modelo: string; calidad: "primera" | "segunda" } {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  const segunda = palabras.includes("SEGUNDA");
  return { modelo: palabras.filter((p) => p !== "SEGUNDA" && p !== "PRIMERA").join(" "), calidad: segunda ? "segunda" : "primera" };
}

/** «OREGON» → «PINO OREGON» (nombre del catálogo); las demás, normalizadas («PINO BLANCO», «MDF»). */
export function leerMadera(texto: unknown): string {
  const n = normalizar(texto);
  return n === "OREGON" ? "PINO OREGON" : n;
}

/** Código de un artículo fuera de catálogo: medida exacta en mm (MOL-O-780X2066). */
export function codigoFueraCatalogo(modelo: string, madera: string, anchoMm: number, altoMm: number): string {
  return `${modelo}-${madera}-${anchoMm}X${altoMm}`;
}

/** Código de un modelo o madera nuevos: el nombre sin signos («MAMPARA LICAN» → «MAMPARA-LICAN»). */
export function codigoDeNombre(nombre: string, largo?: number): string {
  const base = normalizar(nombre).replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return largo ? base.replace(/ /g, "").slice(0, largo) : base.replace(/ /g, "-");
}

/** Texto de taller en mayúsculas → oración: «OK // BARNIZ, BISAGRAS» → «Barniz, bisagras». null si solo dice «OK». */
export function limpiarObservacion(...partes: unknown[]): string | null {
  const textos = partes
    .flatMap((p) => String(p ?? "").split("//"))
    .map((t) => t.replace(/\s+/g, " ").trim().replace(/^OK\b\s*/i, "").trim())
    .filter((t) => t && !/^DISPONIBLE$/i.test(t));
  if (!textos.length) return null;
  const unido = [...new Set(textos.map((t) => t.toLowerCase()))].join(" · ");
  return unido.charAt(0).toUpperCase() + unido.slice(1);
}

/** Fecha ISO (aaaa-mm-dd) plausible de producción: entre 2015 y hoy. */
export function fechaPlausible(v: unknown, hoy: string): string | null {
  const iso = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) return null;
  return iso >= "2015-01-01" && iso <= hoy ? iso : null;
}

/** Fecha de hoy en Santiago (aaaa-mm-dd). */
export function hoySantiago(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}
