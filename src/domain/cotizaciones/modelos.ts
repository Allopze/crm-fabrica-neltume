// Resolución determinista del nombre de modelo que propone la IA (REQ-COT-2.11). Portado del cotizador de la tienda:
// el nombre real siempre gana; un alias seguro (de cómo hablan las vendedoras, p. ej. «coscos» → COZ COZ) se aplica;
// un alias dudoso o un nombre apenas parecido NUNCA se aplica en silencio: queda por confirmar con una sugerencia.
import { normalizar } from "../importacion/mapear";

export interface AliasModelo { alias: string; modelo: string; tipo: "seguro" | "posible" }
export type ModeloResuelto<M> = { tipo: "ok"; modelo: M } | { tipo: "posible"; modelo: M } | { tipo: "desconocido" };

/** Mayúsculas sin tildes y solo letras y dígitos: «Huilo-Huilo» → HUILOHUILO. */
export const compacto = (s: string) => normalizar(s).replace(/[^A-Z0-9]/g, "");

/** Clave tolerante: une una palabra repetida («WILO WILO» → WILO) y colapsa letras dobles («HUILLO» → HUILO). */
export function claveTolerante(s: string): string {
  const palabras = normalizar(s).replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const unica = palabras.length > 1 && palabras.every((p) => p === palabras[0]) ? [palabras[0]] : palabras;
  return unica.join("").replace(/(.)\1+/g, "$1");
}

/** Distancia de Damerau-Levenshtein (transposiciones adyacentes incluidas). */
export function damerau(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export function resolverModelo<M extends { nombre: string; codigo: string }>(texto: string | null, modelos: M[], alias: AliasModelo[]): ModeloResuelto<M> {
  if (!texto?.trim()) return { tipo: "desconocido" };
  const c = compacto(texto);
  const porNombre = (nombre: string) => modelos.find((m) => compacto(m.nombre) === compacto(nombre));
  // 1) Un modelo real siempre gana sobre cualquier alias.
  const real = modelos.find((m) => compacto(m.nombre) === c || m.codigo.toUpperCase() === c);
  if (real) return { tipo: "ok", modelo: real };
  // 2) Alias: el dudoso manda aunque también figure como seguro.
  const coincidencias = alias.filter((a) => compacto(a.alias) === c);
  const dudoso = coincidencias.find((a) => a.tipo === "posible");
  if (dudoso && porNombre(dudoso.modelo)) return { tipo: "posible", modelo: porNombre(dudoso.modelo)! };
  const seguro = coincidencias.find((a) => a.tipo === "seguro");
  if (seguro && porNombre(seguro.modelo)) return { tipo: "ok", modelo: porNombre(seguro.modelo)! };
  // 3) Parecido (clave tolerante o una letra de diferencia), con un único candidato: se sugiere, no se aplica.
  const t = claveTolerante(texto);
  const tolerantes = modelos.filter((m) => claveTolerante(m.nombre) === t);
  if (tolerantes.length === 1) return { tipo: "posible", modelo: tolerantes[0] };
  if (c.length >= 5) {
    const cerca = modelos.filter((m) => damerau(compacto(m.nombre), c) <= 1);
    if (cerca.length === 1) return { tipo: "posible", modelo: cerca[0] };
  }
  return { tipo: "desconocido" };
}

/** Alias iniciales, tomados del uso real en la tienda (referencia/config/catalogo.json). */
export const ALIAS_INICIALES: AliasModelo[] = [
  ...["HUILO", "HUILA", "WILLO", "WILLOW", "HUILO HUILA", "WILLOW WILLOW", "HUILLO HUILLO", "HUILLO", "WILO WILO", "WILLOWO"].map((alias) => ({ alias, modelo: "HUILO HUILO", tipo: "seguro" as const })),
  { alias: "PANGIPULLI", modelo: "PANGUIPULLI", tipo: "seguro" },
  ...["COSCOS", "COS COS", "COSCO"].map((alias) => ({ alias, modelo: "COZ COZ", tipo: "seguro" as const })),
  { alias: "PILLO", modelo: "HUILO HUILO", tipo: "posible" },
];
