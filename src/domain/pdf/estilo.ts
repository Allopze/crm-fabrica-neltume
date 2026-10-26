// Estilo común de los documentos (docs/contratos/estilo-documentos-v1.md; ADR-0025). Colores, tamaños y márgenes salen del
// archivo de tokens, el mismo en las dos apps: aquí no se escribe ninguno a mano. Los roles de color son comunes y cada app
// los llena con su paleta: la fábrica usa `colores.fabrica`. Las fuentes de la marca van en la imagen
// (public/marca/fuentes, licencia OFL): el PDF se ve como la app y no se piden por red.
import path from "node:path";
import { Font } from "@react-pdf/renderer";
import tokens from "../../../docs/contratos/estilo-documentos-tokens.json";

export type NombreColor = keyof typeof tokens.colores.fabrica;
export type NombreRol = keyof typeof tokens.roles;
interface Rol { familia: string; peso: number; tamanoPt: number; color: NombreColor; interlineado?: number }

export const COLOR: Record<NombreColor, string> = tokens.colores.fabrica;
const ROLES = tokens.roles as Record<NombreRol, Rol>;
export const TRAZOS = tokens.trazos as Record<keyof typeof tokens.trazos, { anchoPt: number; color: NombreColor }>;
export const MARCAS_DE_AGUA = tokens.marcasDeAgua as Record<keyof typeof tokens.marcasDeAgua, { familia: string; peso: number; color: NombreColor; opacidad: number; giroGrados: number }>;

/** Medidas del dibujo de puertas y marcos (alto del plano y de la miniatura, lienzo con cotas y texto de las cotas). */
export const PLANO = tokens.plano;

/** Milímetros a puntos. */
export const mm = (valor: number) => (valor * 72) / 25.4;
export const MARGEN = { arriba: mm(tokens.hoja.margenesMm.arriba), lateral: mm(tokens.hoja.margenesMm.izquierda), abajo: mm(tokens.hoja.margenesMm.abajo) };

const FUENTES = path.join(process.cwd(), "public/marca/fuentes");
const archivo = (nombre: string) => path.join(FUENTES, nombre);
const de = (familia: string) => tokens.fuentes.filter((f) => f.familia === familia).map((f) => ({ src: archivo(f.archivo), fontWeight: f.peso }));
for (const familia of new Set(tokens.fuentes.map((f) => f.familia))) Font.register({ family: familia, fonts: de(familia) });
// Sin guiones de partición: las reglas por defecto son del inglés y cortarían mal palabras en español.
Font.registerHyphenationCallback((palabra) => [palabra]);

/**
 * Estilo de react-pdf de un rol del estándar (familia, peso, tamaño, color e interlineado). Con `interlineado: false` no lleva
 * lineHeight: react-pdf no dibuja el texto dinámico («Página n de m») con él y, en las celdas de la tabla, duplica el alto de
 * las líneas (probado), así que el interlineado de los tokens solo se aplica donde se comprobó (el número del documento).
 */
export function rol(nombre: NombreRol, interlineado = true) {
  const r = ROLES[nombre];
  return { fontFamily: r.familia, fontWeight: r.peso, fontSize: r.tamanoPt, color: COLOR[r.color], ...(interlineado && r.interlineado ? { lineHeight: r.interlineado } : {}) };
}
