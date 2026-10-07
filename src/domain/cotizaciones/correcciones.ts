// Corrección determinista acotada (ADR-0013 A; REQ-COT-2.15): si la frase literal de un ítem dice exactamente UN valor
// de un campo y la IA propuso otro, vale lo que escribió el cliente, con un aviso visible. Nunca completa un campo que la
// IA dejó en null ni elige entre dos valores de la frase: eso sigue en duda (anclaje.ts). Como `anclarFrases` de la tienda.
import type { ItemPropuesto } from "@/ai/esquema";
import { normalizarSeccion } from "./accesorios";
import { ALIAS_MADERA, metros, NOMBRE_MADERA } from "./mapear";
import { aparece, cantidadesDichas, maderasEn, plano } from "./texto-pedido";

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const UNIDAD = String.raw`(?:\s*(?:cm|mm|mts?|metros?|m)(?![a-z]))?`;
/** Par de medidas de puerta: «80x210», «0,80 por 2,10», «900 x 2100 mm». */
const PAR = new RegExp(String.raw`(${NUM})${UNIDAD}\s*(?:x|×|\*|por)\s*(${NUM})`, "g");
/** Sección de un accesorio: «2x4», «12x4,5»; no un par de puerta («80x210»). */
const SECCION = /(?<![\d.,])\d{1,2}\s*[x×*]\s*\d{1,2}(?:[.,]\d)?(?![\d.,]*\d)/g;
/** «4 pulgadas», «6"»: en marcos y piezas T es la escuadría 2xN. */
const PULGADAS = /\b(\d{1,2})\s*(?:pulgadas?|pulg\b|")/g;
/** Otro pino que el catálogo no tiene: «pino» no significa oregón y no se corrige nada de madera. */
const OTRO_PINO = /\bpino\s+(?:radiata|insigne|finger)\b/;

const num = (t: string) => Number(t.replace(",", "."));
const unicos = <T>(xs: T[]) => [...new Set(xs)];
const iguales = (a: number, b: number) => Math.abs(a - b) <= 5e-4;
const m2 = (n: number) => String(n).replace(".", ",");
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

/** Par ancho × alto de puerta si la frase trae exactamente uno plausible; el menor es el ancho. */
function parPuerta(frase: string): { ancho: number; alto: number } | null {
  const pares = [...plano(frase).matchAll(PAR)].map((m) => [metros(num(m[1])), metros(num(m[2]))]);
  if (pares.length !== 1 || pares[0].some((v) => v === null)) return null;
  const [a, b] = pares[0] as number[];
  return { ancho: Math.min(a, b), alto: Math.max(a, b) };
}

/** Sección única dicha en la frase de un accesorio, normalizada como en el catálogo (2X4, 12X4,5). */
function seccionUnica(frase: string, porPulgadas: boolean): string | null {
  const t = plano(frase);
  const dichas = [
    ...[...t.matchAll(SECCION)].map((m) => normalizarSeccion(m[0], porPulgadas)),
    ...(porPulgadas ? [...t.matchAll(PULGADAS)].map((m) => `2X${m[1]}`) : []),
  ];
  const s = unicos(dichas.filter((x): x is string => !!x));
  return s.length === 1 ? s[0] : null;
}

/**
 * Corrige cada ítem cuya frase está tal cual en el pedido. Devuelve los ítems y un aviso por corrección; la
 * interpretación cruda de la IA se conserva aparte (`interpretacion_ia`).
 */
export function corregirItems(items: ItemPropuesto[], mensaje: string): { items: ItemPropuesto[]; avisos: string[] } {
  const avisos: string[] = [];
  const corregidos = items.map((it, k) => {
    if (!it.texto_fuente.trim() || !aparece(mensaje, it.texto_fuente)) return it;
    const frase = it.texto_fuente;
    const avisar = (campo: string, valor: string) => avisos.push(`Ítem ${k + 1}: corregí ${campo} a «${valor}», como dice su línea.`);
    let r = it;

    // Madera: una sola en la frase y la IA propuso otra del catálogo.
    const propuesta = it.madera ? ALIAS_MADERA[plano(it.madera).toUpperCase()] : undefined;
    const enFrase = [...maderasEn(frase)];
    if (propuesta && enFrase.length === 1 && enFrase[0] !== propuesta && !OTRO_PINO.test(plano(frase))) {
      r = { ...r, madera: enFrase[0] };
      avisar("la madera", NOMBRE_MADERA[enFrase[0]] ?? titulo(enFrase[0]));
    }

    // Cantidad: una sola dicha en la frase.
    const dichas = unicos(cantidadesDichas(frase));
    if (it.cantidad !== null && dichas.length === 1 && dichas[0] !== it.cantidad && Number.isInteger(dichas[0]) && dichas[0] >= 1 && dichas[0] <= 500) {
      r = { ...r, cantidad: dichas[0] };
      avisar("la cantidad", String(dichas[0]));
    }

    if (it.tipo === "puerta") {
      // Medidas: un solo par en la frase; la IA las leyó distinto (p. ej. 1230 x 2600 mm como 12,3 m).
      const par = parPuerta(frase);
      const ancho = it.ancho_m === null ? null : metros(it.ancho_m);
      const alto = it.alto_m === null ? null : metros(it.alto_m);
      if (par && it.ancho_m !== null && it.alto_m !== null && !(ancho !== null && alto !== null && iguales(ancho, par.ancho) && iguales(alto, par.alto))) {
        r = { ...r, ancho_m: par.ancho, alto_m: par.alto };
        avisar("la medida", `${m2(par.ancho)} × ${m2(par.alto)} m`);
      }
    } else if (it.tipo !== "desconocido" && it.medida_accesorio) {
      // Escuadría o sección: una sola en la frase.
      const porPulgadas = it.tipo === "marco" || it.tipo === "piezas_t";
      const dicha = seccionUnica(frase, porPulgadas);
      if (dicha && normalizarSeccion(it.medida_accesorio, porPulgadas) !== dicha) {
        r = { ...r, medida_accesorio: dicha.toLowerCase() };
        avisar(porPulgadas ? "la escuadría" : "la sección", dicha.toLowerCase());
      }
    }
    return r;
  });
  return { items: corregidos, avisos };
}
