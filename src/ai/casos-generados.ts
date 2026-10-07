// Casos de evaluación generados con semilla desde el catálogo importado (AI.md §6, como `paridad-excel-ia` de la tienda).
// Puro: recibe el catálogo de mapeo. Cada pedido se escribe en formatos variados (m/cm/mm, «x»/«por», números en
// palabras, «de 4 pulgadas», «juegos de marco») y lo esperado se calcula con el mapeo determinista del backend sobre el
// ítem ideal, así que el caso mide solo la lectura de la IA. Sin precios ni datos personales.
import { mapearItem, type CatalogoMapeo } from "@/domain/cotizaciones/mapear";
import type { ItemPropuesto } from "./esquema";
import type { Caso, Esperado, Grupo } from "./evaluacion";

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function azar(semilla: number) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { n: siguiente, de: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)] };
}
type Azar = ReturnType<typeof azar>;

const MADERA_DICHA: Record<string, readonly string[]> = {
  "PINO OREGON": ["oregón", "oregon", "pino oregón", "pino"], RAULI: ["raulí", "rauli"], LENGA: ["lenga"], MARA: ["mara"],
};
const PALABRAS = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
const TIPO: Record<string, ItemPropuesto["tipo"]> = { MARCO: "marco", "PIEZAS T": "piezas_t", ENDOLADO: "endolado", GUARDAPOLVO: "guardapolvo", PILASTRA: "pilastra" };
const MOLDURA: Record<string, string> = { ENDOLADO: "endolado", GUARDAPOLVO: "guardapolvo", PILASTRA: "pilastra" };
/** Plural salvo con cantidad 1 («una puerta», «un marco»). */
const s = (palabra: string, n: number | null) => (n === 1 ? palabra : `${palabra}s`);

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
const coma = (n: number, dec = 2) => n.toFixed(dec).replace(".", ",");

/** Cantidad y cómo se escribe: dígitos, palabras, «un par» o «una docena». */
function cantidad(r: Azar): { n: number; texto: string } {
  const x = r.n();
  if (x < 0.08) return { n: 2, texto: "un par de" };
  if (x < 0.13) return { n: 12, texto: "una docena de" };
  const n = 1 + Math.floor(r.n() * (x < 0.35 ? 10 : 20));
  return { n, texto: x < 0.35 && n <= 10 ? PALABRAS[n] : String(n) };
}

/** Medida de puerta en cm, m o mm («80x210», «0,80 por 2,10», «800 x 2100 mm»). */
function medidaPuerta(r: Azar, ancho: number, alto: number): string {
  const forma = r.n();
  if (forma < 0.5) return `${Math.round(ancho * 100)}${r.de(["x", " x ", " por "])}${Math.round(alto * 100)}`;
  if (forma < 0.8) return `${coma(ancho)}${r.de([" x ", " por "])}${coma(alto)}${r.de(["", " m"])}`;
  return `${Math.round(ancho * 1000)} x ${Math.round(alto * 1000)} mm`;
}

interface Linea { texto: string; ideal: ItemPropuesto }
type Falta = "madera" | "cantidad" | "medida" | null;

/** Variantes de puerta de la grilla (el mapa de artículos también trae los accesorios). */
function variantesPuerta(cat: CatalogoMapeo) {
  return [...cat.articulos.keys()].flatMap((clave) => {
    const [modeloId, maderaId, anchoCodigo, altoCodigo] = clave.split("|");
    const modelo = cat.modelos.find((m) => m.id === modeloId), madera = cat.maderas.find((m) => m.id === maderaId);
    const rango = cat.rangos.find((x) => x.codigo === anchoCodigo), alto = cat.altos.find((x) => x.codigo === altoCodigo);
    return modelo && madera && rango && alto ? [{ modelo, madera, rango, alto }] : [];
  });
}

function puerta(r: Azar, variantes: ReturnType<typeof variantesPuerta>, falta: Falta): Linea {
  const { modelo, madera, rango, alto } = r.de(variantes);
  const q = cantidad(r);
  const ancho = r.n() < 0.7 ? rango.minM : rango.maxM;
  const nombre = r.n() < 0.8 ? titulo(modelo.nombre) : modelo.nombre.toLowerCase();
  const mad = r.de(MADERA_DICHA[madera.nombre]);
  const medida = falta === "medida" ? `de ${Math.round(ancho * 100)}` : medidaPuerta(r, ancho, alto.altoM);
  const qt = falta === "cantidad" ? "" : `${q.texto} `;
  const plural = falta === "cantidad" ? "puertas " : "";
  const puertas = s("puerta", falta === "cantidad" ? null : q.n);
  const madText = falta === "madera" ? "" : mad;
  const texto = r.de([
    `${qt}${plural}${nombre} ${madText} ${medida}`,
    `${qt}${puertas} ${nombre}${madText ? ` en ${madText}` : ""} de ${medida.replace(/^de /, "")}`,
    `${qt}${plural}${nombre} de ${medida.replace(/^de /, "")}${madText ? ` en ${madText}` : ""}`,
  ]).replace(/\s+/g, " ").trim();
  return {
    texto,
    ideal: {
      texto_fuente: texto, tipo: "puerta", modelo: modelo.nombre, madera: falta === "madera" ? null : madera.nombre,
      ancho_m: ancho, alto_m: falta === "medida" ? null : alto.altoM, medida_accesorio: null, cantidad: falta === "cantidad" ? null : q.n, dudas: [],
    },
  };
}

function accesorio(r: Azar, cat: CatalogoMapeo, falta: Falta): Linea {
  const pieza = r.de(cat.piezas);
  const tipoNombre = cat.accesorios.find((a) => a.id === pieza.modeloId)!.nombre;
  const madera = cat.maderas.find((m) => m.id === pieza.maderaId)!;
  const q = cantidad(r);
  const mad = falta === "madera" ? "" : r.de(MADERA_DICHA[madera.nombre]);
  const largo = falta === "medida" ? "" : r.de([`de ${coma(pieza.largoM, pieza.largoM % 1 ? 2 : 0)}`, `de ${coma(pieza.largoM)} m`]);
  const qn = falta === "cantidad" ? null : q.n;
  const qt = qn === null ? "" : `${q.n === 1 ? r.de(["un", "1"]) : q.texto} `;
  const seccion = pieza.seccion.toLowerCase();
  const n = seccion.replace(/^2x/, "");
  const texto = (tipoNombre === "MARCO"
    ? r.de([`${qt}${s("marco", qn)} ${mad} ${seccion} ${largo}`, `${qt}${s("marco", qn)} de ${n} pulgadas${mad ? ` en ${mad}` : ""} ${largo}`, `${qt}${s("juego", qn)} de marco ${seccion} ${mad} ${largo}`, `${qt}${s("marco", qn)} de ${n} ${mad ? `en ${mad}` : ""} ${largo}`])
    : tipoNombre === "PIEZAS T"
      ? `${qt}${s("pieza", qn)} T ${seccion} ${mad} ${largo}`
      : `${qt}${s(MOLDURA[tipoNombre], qn)} ${mad} ${seccion} cm ${largo}`).replace(/\s+/g, " ").trim();
  return {
    texto,
    ideal: {
      texto_fuente: texto, tipo: TIPO[tipoNombre], modelo: null, madera: falta === "madera" ? null : madera.nombre, ancho_m: null,
      alto_m: falta === "medida" ? null : pieza.largoM, medida_accesorio: seccion, cantidad: falta === "cantidad" ? null : q.n, dudas: [],
    },
  };
}

const esperado = (p: ItemPropuesto, cat: CatalogoMapeo): Esperado => {
  const m = mapearItem(p, cat);
  return m.estado === "ok" ? { estado: "ok", codigo: m.codigo!, cantidad: m.cantidad }
    : m.estado === "a_pedido" ? { estado: "a_pedido", referencia: m.referencia!.codigo, cantidad: m.cantidad } : { estado: "por_confirmar", cantidad: m.cantidad };
};

/**
 * `n` pedidos de 1 a 3 líneas: ~30 % con accesorios y ~25 % con un dato faltante (madera, cantidad o medida), que debe
 * quedar por confirmar. Mismo catálogo y semilla = mismos casos.
 */
export function generarCasos(cat: CatalogoMapeo, n: number, semilla: number): (Caso & { fuente: string })[] {
  return generarConIdeales(cat, n, semilla).map((g) => g.caso);
}

/** Igual que `generarCasos`, con la lectura ideal de cada pedido (la que se mapea para obtener lo esperado). */
export function generarConIdeales(cat: CatalogoMapeo, n: number, semilla: number) {
  const r = azar(semilla);
  const variantes = variantesPuerta(cat);
  const casos: { caso: Caso & { fuente: string }; ideales: ItemPropuesto[] }[] = [];
  for (let id = 1; id <= n; id++) {
    const lineas = 1 + Math.floor(r.n() * r.n() * 3);
    const conFalta = r.n() < 0.25 ? Math.floor(r.n() * lineas) : -1;
    const items = Array.from({ length: lineas }, (_, k) => {
      const falta: Falta = k === conFalta ? r.de(["madera", "cantidad", "medida"] as const) : null;
      return r.n() < 0.3 && cat.piezas.length ? accesorio(r, cat, falta) : puerta(r, variantes, falta);
    });
    const pedido = r.de(["", "Cotiza ", "Necesito ", "Hola, me cotizas "]) + items.map((l) => l.texto).reduce((t, l, i) => (i ? `${t}${r.de([", ", " y ", "; ", "\n"])}${l}` : l), "");
    const es = items.map((l) => esperado(l.ideal, cat));
    const grupo: Grupo = es.some((e) => e.estado !== "ok") ? "ambiguo" : items.some((l) => l.ideal.tipo !== "puerta") ? "accesorio" : "claro";
    casos.push({ caso: { id, grupo, pedido, esperado: es, fuente: `generado:s${semilla}` }, ideales: items.map((l) => l.ideal) });
  }
  return casos;
}
