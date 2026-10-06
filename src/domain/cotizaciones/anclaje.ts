// Verificación determinista de la propuesta de la IA contra el texto del pedido (REQ-COT-2.14). Portado (parte de un
// solo mensaje) del cotizador de la tienda: ninguna cantidad ni medida puede venir de la nada, y lo que la IA dejó
// fuera queda como alerta. Puro: corre antes del mapeo; lo que no se respalda pasa a «dudas» → por confirmar.
import type { ItemPropuesto, Propuesta } from "@/ai/esquema";
import { metros } from "./mapear";

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

/** Verifica cada ítem contra el texto: cantidades en su frase (o heredadas), medidas presentes en el pedido. */
export function anclarItems(items: ItemPropuesto[], mensaje: string): ItemPropuesto[] {
  const numeros = cifras(mensaje);
  return items.map((it, k) => {
    const dudas = [...it.dudas];
    const frase = it.texto_fuente;
    if (it.cantidad !== null && aparece(mensaje, frase)) {
      const dichas = cantidadesDichas(frase);
      const heredada = CONTINUA.test(plano(frase)) && items.some((o, j) => j !== k && o.cantidad === it.cantidad);
      const una = it.cantidad === 1 && /\b(?:un|una|uno|otr[oa])\b/.test(plano(frase));
      if (!dichas.includes(it.cantidad) && !heredada && !una) dudas.push(`La cantidad ${it.cantidad} no aparece en el pedido.`);
    }
    const max = it.tipo === "puerta" ? 3 : 6;
    for (const [campo, valor] of [["ancho", it.ancho_m], [it.tipo === "puerta" ? "alto" : "largo", it.alto_m]] as const) {
      if (valor === null) continue;
      const v = metros(valor, max);
      if (v !== null && !respaldaMedida(v, numeros, max)) dudas.push(`El ${campo} ${String(v).replace(".", ",")} m no aparece en el pedido.`);
    }
    if (it.medida_accesorio) {
      const faltan = cifras(it.medida_accesorio).filter((n) => !numeros.includes(n));
      if (faltan.length) dudas.push(`La medida «${it.medida_accesorio}» no aparece en el pedido.`);
    }
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

/** Aplica el anclaje a la propuesta completa: ítems con dudas nuevas y alertas por lo no registrado. */
export function anclarPropuesta(propuesta: Propuesta, mensaje: string, modelos: string[]): Propuesta {
  const omitidos = pedidosSinRegistrar(mensaje, propuesta.items.map((i) => i.texto_fuente), modelos);
  return {
    ...propuesta,
    items: anclarItems(propuesta.items, mensaje),
    alertas: [...propuesta.alertas, ...omitidos.map((o) => `No registré: «${o}». Agrégalo a mano si corresponde.`)],
  };
}
