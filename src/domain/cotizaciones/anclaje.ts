// Verificación determinista de la propuesta de la IA contra el texto del pedido (REQ-COT-2.14). Portado (parte de un
// solo mensaje) del cotizador de la tienda: ninguna cantidad ni medida puede venir de la nada, y lo que la IA dejó
// fuera queda como alerta. Puro: corre antes del mapeo; lo que no se respalda pasa a «dudas» → por confirmar.
import type { ItemPropuesto, Propuesta } from "@/ai/esquema";
import { ALIAS_MADERA, metros } from "./mapear";
import { compacto } from "./modelos";

const plano = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

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

const CONTINUA = /\b(?:otr[oa]s?|igual(?:es)?|mism[oa]s?|con su|con sus)\b/;
const aparece = (mensaje: string, frase: string) => plano(mensaje).replace(/\s+/g, " ").includes(plano(frase).replace(/\s+/g, " ").trim());
const respaldaMedida = (valor: number, numeros: number[], max: number) => numeros.some((n) => { const m = metros(n, max); return m !== null && Math.abs(m - valor) <= 5e-4; });

/** Maderas nombradas en un texto («oregón», «pino», «raulí»), con su nombre del catálogo. */
function maderasEn(texto: string): Set<string> {
  const t = plano(texto);
  return new Set(Object.entries(ALIAS_MADERA).filter(([a]) => new RegExp(`\\b${plano(a)}\\b`).test(t)).map(([, m]) => m));
}

/** Nombres de modelo para verificar el texto: los del catálogo y sus alias SEGUROS (un alias dudoso nunca respalda). */
export interface NombresModelo { modelos: string[]; alias: { alias: string; modelo: string; tipo?: string }[] }

/** Formas en que el texto puede nombrar el modelo que propuso la IA: el nombre real, sus alias seguros y lo que escribió. */
function formasDeModelo(modelo: string, n: NombresModelo): { canonico: string | null; formas: string[] } {
  const c = compacto(modelo);
  const seguros = n.alias.filter((a) => (a.tipo ?? "seguro") === "seguro");
  const canonico = n.modelos.find((m) => compacto(m) === c) ?? seguros.find((a) => compacto(a.alias) === c)?.modelo ?? null;
  const formas = canonico ? [canonico, ...seguros.filter((a) => a.modelo === canonico).map((a) => a.alias)] : [modelo];
  return { canonico, formas: formas.map(compacto).filter(Boolean) };
}
const nombra = (texto: string, formas: string[]) => { const t = compacto(texto); return formas.some((f) => t.includes(f)); };
const modelosEn = (texto: string, n: NombresModelo) => n.modelos.filter((m) => nombra(texto, formasDeModelo(m, n).formas));

/**
 * Contexto de cada ítem: su frase (si está tal cual en el mensaje), el resto del mensaje sin las frases de los demás
 * ítems (lo dicho para todo el pedido, «todas en lenga») y si la frase continúa la anterior («otra igual», «con su
 * marco»; en puertas, también una frase sin modelo: «… y 2 de 70x210»). Como `anclarFrases` de la tienda.
 */
function contexto(items: ItemPropuesto[], k: number, mensaje: string, n: NombresModelo) {
  const frase = plano(items[k].texto_fuente);
  const literal = !!frase.trim() && aparece(mensaje, frase);
  const otras = items.map((o) => plano(o.texto_fuente)).filter((f, j) => j !== k && f.trim() && aparece(mensaje, f) && !f.includes(frase) && !frase.includes(f));
  const resto = otras.reduce((t, f) => t.split(f.replace(/\s+/g, " ").trim()).join(" | "), plano(mensaje).replace(/\s+/g, " "));
  const continua = CONTINUA.test(frase) || (items[k].tipo === "puerta" && k > 0 && !modelosEn(frase, n).length);
  return { frase, literal, otras, resto, continua };
}

/** El modelo de una puerta debe estar escrito en su línea (o dicho para todo el pedido, o heredado al continuar). */
function modeloAjeno(items: ItemPropuesto[], k: number, cx: ReturnType<typeof contexto>, n: NombresModelo): string | null {
  const it = items[k];
  if (it.tipo !== "puerta" || !it.modelo || !cx.literal || !n.modelos.length) return null;
  const { canonico, formas } = formasDeModelo(it.modelo, n);
  if (nombra(cx.frase, formas)) return null;
  const heredado = cx.continua && items.some((o, j) => j < k && o.modelo && formasDeModelo(o.modelo, n).canonico === canonico);
  if (heredado || (!modelosEn(cx.frase, n).length && nombra(cx.resto, formas))) return null;
  return modelosEn(cx.frase, n).length ? `La línea nombra otro modelo que «${it.modelo}».` : `El modelo «${it.modelo}» no aparece en su línea.`;
}

/**
 * La madera de un ítem sale de su frase o de lo que el mensaje dice para todo el pedido, nunca de la frase de otro
 * ítem: «2 Malalhue oregón 90x210 y 2 marcos de 4» no da marcos de oregón. Una frase que continúa la anterior sí la hereda.
 */
function maderaAjena(it: ItemPropuesto, cx: ReturnType<typeof contexto>): string | null {
  const madera = it.madera && ALIAS_MADERA[plano(it.madera).toUpperCase()];
  if (!madera || !cx.literal || cx.continua) return null;
  const propias = maderasEn(cx.frase);
  if (propias.size) return propias.has(madera) ? null : `La línea dice otra madera que «${it.madera}».`;
  if (maderasEn(cx.resto).has(madera) || !cx.otras.some((f) => maderasEn(f).has(madera))) return null;
  return `La madera «${it.madera}» es de otra línea del pedido.`;
}

/**
 * Verifica cada ítem contra el texto (REQ-COT-2.14): cantidades en su frase (o heredadas); medidas, modelo y madera
 * en su línea o en lo dicho para todo el pedido, nunca tomados de la línea de otro ítem. Nada se corrige: lo que no
 * se respalda pasa a `dudas` y el ítem queda por confirmar.
 */
export function anclarItems(items: ItemPropuesto[], mensaje: string, nombres: NombresModelo = { modelos: [], alias: [] }): ItemPropuesto[] {
  const numeros = cifras(mensaje);
  return items.map((it, k) => {
    const dudas = [...it.dudas];
    const cx = contexto(items, k, mensaje, nombres);
    if (it.cantidad !== null && cx.literal) {
      const dichas = cantidadesDichas(cx.frase);
      const heredada = CONTINUA.test(cx.frase) && items.some((o, j) => j !== k && o.cantidad === it.cantidad);
      const una = it.cantidad === 1 && /\b(?:un|una|uno|otr[oa])\b/.test(cx.frase);
      if (!dichas.includes(it.cantidad) && !heredada && !una) dudas.push(`La cantidad ${it.cantidad} no aparece en el pedido.`);
    }
    const puerta = it.tipo === "puerta";
    const max = puerta ? 3 : 6;
    // Medidas: de su línea o de lo dicho para todo el pedido; al continuar la anterior se heredan.
    const propias = cx.literal && !cx.continua ? [...cifras(cx.frase), ...cifras(cx.resto)] : numeros;
    for (const [campo, valor] of [["ancho", it.ancho_m], [puerta ? "alto" : "largo", it.alto_m]] as const) {
      if (valor === null) continue;
      const v = metros(valor, max);
      if (v === null || respaldaMedida(v, propias, max)) continue;
      const texto = String(v).replace(".", ",");
      dudas.push(respaldaMedida(v, numeros, max) ? `El ${campo} ${texto} m es de otra línea del pedido.` : `El ${campo} ${texto} m no aparece en el pedido.`);
    }
    if (it.medida_accesorio) {
      // En marcos y piezas T la escuadría «2x» va implícita («de 4» = 2x4).
      const medida = it.tipo === "marco" || it.tipo === "piezas_t" ? it.medida_accesorio.replace(/^\s*2\s*[x×*]\s*/i, "") : it.medida_accesorio;
      const faltan = cifras(medida).filter((x) => !numeros.includes(x));
      if (faltan.length) dudas.push(`La medida «${it.medida_accesorio}» no aparece en el pedido.`);
    }
    for (const ajena of [modeloAjeno(items, k, cx, nombres), maderaAjena(it, cx)]) if (ajena) dudas.push(ajena);
    return dudas.length === it.dudas.length ? it : { ...it, dudas };
  });
}

const PARECE_PRODUCTO = /\b(?:puertas?|marcos?|piezas?|endolados?|guardapolvos?|pilastras?)\b/;
const NO_ES_PEDIDO = /\b(?:gracias|saludos|hola|buen[oa]s|cotizaci[oó]n|direcci[oó]n|despacho|rut|correo|tel[eé]fono|fono)\b/;

/**
 * Lo que el mensaje pide y la IA no registró (REQ-COT-2.14): se marca el texto que cubren las frases de los ítems y,
 * en lo que queda, un fragmento con un número y un modelo o tipo de producto es un pedido omitido.
 */
export function pedidosSinRegistrar(mensaje: string, frases: string[], modelos: string[]): string[] {
  let resto = mensaje;
  for (const f of frases) {
    const i = plano(resto).indexOf(plano(f).trim());
    if (i >= 0) resto = `${resto.slice(0, i)} | ${resto.slice(i + f.trim().length)}`;
  }
  const nombres = modelos.map(plano);
  return resto.split(/\n|;|\||,\s|\.\s|\s+y\s+|\s+e\s+/).map((x) => x.trim().replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, ""))
    .filter((x) => {
      const p = plano(x);
      if (x.length < 4 || !/\d/.test(p) || NO_ES_PEDIDO.test(p)) return false;
      return PARECE_PRODUCTO.test(p) || nombres.some((n) => n.length >= 3 && p.includes(n));
    });
}

/** Ítems cuya frase no está tal cual en el mensaje: no se pudieron verificar contra su línea. */
export function sinVerificar(items: ItemPropuesto[], mensaje: string): number[] {
  return items.flatMap((it, k) => (it.texto_fuente.trim() && aparece(mensaje, it.texto_fuente) ? [] : [k + 1]));
}

/**
 * Aplica el anclaje a la propuesta completa: ítems con dudas nuevas y alertas por lo no registrado y por lo que no se
 * pudo verificar. Devuelve también lo omitido, para pedir una corrección a la IA (src/ai/revision.ts).
 */
export function anclarPropuesta(propuesta: Propuesta, mensaje: string, nombres: NombresModelo): { propuesta: Propuesta; omitidos: string[] } {
  const omitidos = pedidosSinRegistrar(mensaje, propuesta.items.map((i) => i.texto_fuente), [...nombres.modelos, ...nombres.alias.map((a) => a.alias)]);
  const noVerificados = sinVerificar(propuesta.items, mensaje);
  return {
    omitidos,
    propuesta: {
      ...propuesta,
      items: anclarItems(propuesta.items, mensaje, nombres),
      alertas: [
        ...propuesta.alertas,
        ...omitidos.map((o) => `No registré: «${o}». Agrégalo a mano si corresponde.`),
        ...noVerificados.map((n) => `No pude verificar el ítem ${n} contra el pedido (la IA no citó el texto tal cual): revísalo.`),
      ],
    },
  };
}
