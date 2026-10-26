import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import tokens from "../../../docs/contratos/estilo-documentos-tokens.json";
import { PLANO } from "./estilo";
import { renderizarCotizacion } from "./cotizacion";
import { renderizarOrdenTrabajo } from "./orden-trabajo";
import { renderizarPedido } from "./pedido";
import { pdfPruebaConexion } from "./prueba-conexion";

// Conformidad con el estilo común de los documentos (docs/contratos/estilo-documentos-v1.md; ADR-0025 D11): imprime los
// cuatro PDF con datos inventados y los lee con pdfjs, sobre el PDF real y no sobre el contenido. Colores, fuentes y
// márgenes se comparan con los tokens, los mismos en las dos apps. Las anclas de lectura (§8) son de la tienda, no de aquí.

interface Fragmento { s: string; x: number; y: number; fin: number; tam: number; girado: boolean }
/** `colorTexto`: el último color de relleno con que se dibujó cada texto, para saber de qué color salió una cifra. */
interface Leido { paginas: Fragmento[][]; fuentes: string[]; colores: string[]; colorTexto: Map<string, string>; opacidades: number[]; imagenes: number; ancho: number; alto: number; bytes: number; info: Record<string, string> }

async function leer(pdf: Buffer): Promise<Leido> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const global = globalThis as { pdfjsWorker?: unknown };
  global.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const tarea = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, fontExtraProperties: true, verbosity: 0 });
  const documento = await tarea.promise;
  const paginas: Fragmento[][] = [];
  const fuentes = new Set<string>(), colores = new Set<string>(), opacidades = new Set<number>(), colorTexto = new Map<string, string>();
  let [ancho, alto, imagenes] = [0, 0, 0];
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const vista = pagina.getViewport({ scale: 1 });
    [ancho, alto] = [vista.width, vista.height];
    const { items } = await pagina.getTextContent();
    paginas.push(items.flatMap((i) => ("str" in i && i.str.trim()
      ? [{ s: i.str, x: i.transform[4], y: vista.height - i.transform[5], fin: i.transform[4] + i.width, tam: Math.hypot(i.transform[0], i.transform[1]), girado: Math.abs(i.transform[1]) > 0.01 }] : [])));
    const ops = await pagina.getOperatorList();
    let relleno = "";
    for (let i = 0; i < ops.fnArray.length; i++) {
      const [fn, args] = [ops.fnArray[i], ops.argsArray[i]];
      if (fn === pdfjs.OPS.paintImageXObject) imagenes++;
      if (fn === pdfjs.OPS.setFillRGBColor) relleno = String(args[0]).toLowerCase();
      if (fn === pdfjs.OPS.showText) colorTexto.set((args[0] as ({ unicode?: string } | number)[]).map((g) => (typeof g === "object" && g.unicode) || "").join(""), relleno);
      if (fn === pdfjs.OPS.setFillRGBColor || fn === pdfjs.OPS.setStrokeRGBColor) colores.add(String(args[0]).toLowerCase());
      if (fn === pdfjs.OPS.setGState) for (const [clave, valor] of args[0] as [string, unknown][]) if (clave === "ca" && typeof valor === "number" && valor < 1) opacidades.add(valor);
      if (fn === pdfjs.OPS.setFont) {
        const f = await new Promise<{ name: string; type: string }>((resolver) => pagina.commonObjs.get(args[0], resolver));
        fuentes.add(`${f.name.replace(/^[A-Z]+\+/, "")}${f.type === "Type3" ? " (Type3)" : ""}`);
      }
    }
  }
  const { info } = await documento.getMetadata();
  await tarea.destroy();
  return { paginas, fuentes: [...fuentes].sort(), colores: [...colores], colorTexto, opacidades: [...opacidades], imagenes, ancho, alto, bytes: pdf.length, info: info as Record<string, string> };
}

const SUFIJO: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "SemiBold" };
const FUENTES_DEL_ESTANDAR = new Set(tokens.fuentes.map((f) => `${f.familia.replace(/ /g, "")}-${SUFIJO[f.peso]}`));
const PALETA = new Set([...Object.values(tokens.colores.fabrica), "#ffffff"]);
// Cada app conserva sus colores: lo que es solo de la paleta de la tienda no puede aparecer en mis PDF.
const SOLO_DE_LA_TIENDA = Object.values(tokens.colores.tienda).filter((c) => !PALETA.has(c));
const MARGEN = (tokens.hoja.margenesMm.izquierda / 25.4) * 72;
const todos = (l: Leido) => l.paginas.flat();
const hay = (l: Leido, texto: RegExp | string) => todos(l).some((f) => (typeof texto === "string" ? f.s === texto : texto.test(f.s)));

const cliente = { nombre: "Constructora Los Alerces", rut: "12.345.678-5", comuna: "Temuco", contacto: "María Soto" };
const items = Array.from({ length: 40 }, (_, i) => ({ codigo: i % 9 === 8 ? null : `MOL-O-${i % 3 + 1}-A`, descripcion: `Molco · Pino Oregón · 0,8${i % 5} × 2,00 m`, medidaSolicitada: i % 7 === 0 ? "820 × 2000 mm (Vano)" : null,
  modelo: i % 9 === 8 ? null : "MOLCO", familia: i % 9 === 8 ? null : ("puerta" as const), cantidad: i + 1, faltante: i % 2, totalLinea: i % 9 === 8 ? 0 : 90000 * (i + 1) }));
const pedido = { numero: 7, creadoEn: new Date("2026-10-25T15:00:00Z"), estado: "pendiente", cotizacionNumero: 124, notaTienda: null,
  cliente: { nombre: cliente.nombre, rut: cliente.rut, contacto: "Luis Rojas", telefono: "+56 9 1234 5678" }, direccionDespacho: "Camino a Neltume km 3, Panguipulli", medioTransporte: "Camión propio",
  entregaComprometida: "2026-11-20", observaciones: "Llamar antes de despachar.\nEntrega acordada con la tienda: 15 de noviembre", items, subtotal: 1000, descuento: 0, iva: 190, total: 1190, pago: { pagado: 595, saldo: 595 } };
const orden = { numero: 418, creadoEn: new Date("2026-10-24T15:00:00Z"), estado: "pendiente", cotizacionNumero: null, notaTienda: "577", revisionTienda: 2, proyecto: "Casa Lago",
  direccionDespacho: "Camino a Neltume km 3", medioTransporte: "Starken", entregaComprometida: "2026-11-16", observaciones: null,
  items: items.slice(0, 4).map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, observacion: null, revisar: i.codigo ? null : "Pedido especial; precio por definir", referencias: 0, cantidad: i.cantidad, reservado: 0, faltante: i.cantidad })) };

let cotizacion: Leido, nota: Leido, notaLarga: Leido, cancelada: Leido, trabajo: Leido, prueba: Leido;
beforeAll(async () => {
  cotizacion = await leer(await renderizarCotizacion({
    numero: 124, aprobadaEn: new Date("2026-10-25T15:30:00Z"), vigenciaHasta: "2026-11-06", listaVersion: 3, cliente,
    items: [{ codigo: "MOL-O-3-A", descripcion: "Molco · Pino Oregón · 0,82 × 2,00 m", medidaSolicitada: "820 × 2000 mm (Hoja)", modelo: "MOLCO", familia: "puerta" as const, cantidad: 3, precioUnitario: 277760, totalLinea: 833280 }],
    subtotal: 833280, descuento: 0, descuentoMotivo: null, iva: 158323, total: 991603, abonoPct: 50 }));
  nota = await leer(await renderizarPedido({ ...pedido, items: items.slice(0, 3) }));
  notaLarga = await leer(await renderizarPedido(pedido));
  cancelada = await leer(await renderizarPedido({ ...pedido, items: items.slice(0, 3), estado: "cancelada" }));
  trabajo = await leer(await renderizarOrdenTrabajo(orden));
  prueba = await leer(await pdfPruebaConexion({ codigo: "6f1c2a7e", fabrica: "PANGUIPULLI", creadaEn: new Date("2026-10-25T18:02:11Z") }));
}, 60_000);
const documentos = () => [cotizacion, nota, notaLarga, cancelada, trabajo, prueba];

it("las fuentes de public/marca/fuentes son byte a byte las del estándar (sha256 de los tokens)", () => {
  expect(tokens.fuentes).toHaveLength(4);
  for (const { archivo, sha256 } of tokens.fuentes) {
    expect(createHash("sha256").update(readFileSync(path.join("public/marca/fuentes", archivo))).digest("hex"), archivo).toBe(sha256);
  }
});

describe("conformidad con el estilo común de los documentos (PDF real, pdfjs; ADR-0025 D11)", () => {
  it("solo usa las fuentes del estándar, incrustadas y sin Type 3", () => {
    for (const d of documentos()) for (const f of d.fuentes) expect(FUENTES_DEL_ESTANDAR.has(f), f).toBe(true);
    expect(nota.fuentes).toContain("Fraunces-Medium");
    expect(hay(nota, "Entrega acordada con la tienda: 15 de noviembre")).toBe(true); // observaciones de varias líneas: sin Helvetica
    expect(nota.fuentes).toContain("JetBrainsMono-Regular"); // el código de la tabla
  });

  it("solo usa la paleta de la fábrica de los tokens (más el blanco del campo para escribir a mano), no la de la tienda", () => {
    const { tinta, gris, acento, filete, fondoSuave } = tokens.colores.fabrica;
    for (const d of documentos()) for (const c of d.colores) { expect(PALETA.has(c), c).toBe(true); expect(SOLO_DE_LA_TIENDA, c).not.toContain(c); }
    expect(nota.colores).toEqual(expect.arrayContaining([tinta, gris, acento, filete, fondoSuave]));
    expect(SOLO_DE_LA_TIENDA.length).toBeGreaterThan(0);
  });

  it("la cifra del total va en el color del total (tinta en la fábrica) y no en el acento terracota", () => {
    const { total, acento, tinta } = tokens.colores.fabrica;
    expect(total).toBe(tinta);
    expect(total).not.toBe(acento);
    expect(cotizacion.colorTexto.get("$991.603")).toBe(total);
    expect(nota.colorTexto.get("$1.190")).toBe(total);
    expect(cotizacion.colores).toContain(acento); // el filete del encabezado sí lleva el acento
  });

  it("los márgenes laterales son los del estándar (14 mm): nada se sale y el texto llega hasta ellos", () => {
    for (const d of documentos()) {
      const rectos = todos(d).filter((x) => !x.girado);
      for (const f of rectos) {
        expect(f.x, f.s).toBeGreaterThanOrEqual(MARGEN - 1);
        expect(f.fin, f.s).toBeLessThanOrEqual(d.ancho - MARGEN + 1);
      }
      // El cuerpo (sin el pie, que va fijo en el margen) también llega hasta ellos: ni más angosto ni más ancho.
      const cuerpo = rectos.filter((f) => f.y < d.alto - 100);
      expect(Math.min(...cuerpo.map((f) => f.x))).toBeCloseTo(MARGEN, 0);
      expect(Math.max(...cuerpo.map((f) => f.fin))).toBeCloseTo(d.ancho - MARGEN, 0);
    }
  });

  it("el pie de cada página va a 7,5 pt con «Página n de m» en la última línea", () => {
    for (const d of documentos()) d.paginas.forEach((frags, i) => {
      const numero = frags.find((f) => f.s === `Página ${i + 1} de ${d.paginas.length}`);
      expect(numero, `pie de la página ${i + 1}`).toBeDefined();
      expect(numero!.tam).toBeCloseTo(tokens.roles.pie.tamanoPt, 1);
      expect(Math.max(...frags.filter((f) => !f.girado).map((f) => f.y))).toBeLessThanOrEqual(numero!.y + 1); // nada va más abajo
    });
    expect(notaLarga.paginas.length).toBeGreaterThan(1); // se probó también con más de una página
  });

  it("encabezado: tipo (11 pt) sobre número (29 pt, «N.º n») y el resto de la meta en sus tamaños", () => {
    for (const [d, tipo, numero] of [[cotizacion, "Cotización", "N.º 124"], [nota, "Nota de pedido", "N.º 7"], [trabajo, "Orden de trabajo", "N.º 418"], [prueba, "Prueba de conexión", "6f1c2a7e"]] as const) {
      const t = todos(d).find((f) => f.s === tipo)!, n = todos(d).find((f) => f.s === numero)!;
      expect(t.tam, tipo).toBeCloseTo(tokens.roles.tipoDocumento.tamanoPt, 1);
      expect(n.tam, numero).toBeCloseTo(tokens.roles.numeroDocumento.tamanoPt, 1);
      expect(n.y, tipo).toBeGreaterThan(t.y); // tipo sobre número, en dos líneas
    }
    expect(todos(cotizacion).find((f) => f.s === "Fecha")!.tam).toBeCloseTo(tokens.roles.etiqueta.tamanoPt, 1);
  });

  it("formatos: fecha en palabras solo en el encabezado, dd-mm-aaaa en campos, «Por definir» en vez de «$0»", () => {
    for (const d of [cotizacion, nota, trabajo]) expect(hay(d, /^\d{1,2} de [a-záéíóú]+ de \d{4}$/)).toBe(true);
    expect(hay(cotizacion, "06-11-2026")).toBe(true); // «Válida hasta»
    expect(hay(nota, "20-11-2026")).toBe(true); // «Entrega»
    expect(hay(prueba, "25-10-2026 15:02")).toBe(true); // fecha y hora de la prueba
    expect(hay(notaLarga, "Por definir")).toBe(true);
    for (const d of documentos()) expect(hay(d, /\$0$/)).toBe(false);
  });

  it("la tabla común: N.º, Producto y Cant. en todas; «Plano» y «Listo» en la nota y la orden, y la cotización con miniaturas; sin mayúsculas forzadas", () => {
    for (const d of [cotizacion, nota, trabajo, prueba]) for (const t of ["N.º", "Producto", "Cant."]) expect(hay(d, t), t).toBe(true);
    for (const d of [nota, trabajo]) for (const t of ["Plano", "Listo"]) expect(hay(d, t), t).toBe(true);
    for (const t of ["Plano", "Listo"]) expect(hay(cotizacion, t), t).toBe(false);
    for (const d of [cotizacion, nota, trabajo, prueba]) expect(hay(d, "PRODUCTO")).toBe(false);
    expect(todos(nota).find((f) => f.s === "Producto")!.tam).toBeCloseTo(tokens.roles.encabezadoTabla.tamanoPt, 1);
  });

  it("los dibujos: miniatura en la cotización, plano en la nota y la orden y ninguno en la prueba; las cotas solo en el plano, con el texto del estándar", () => {
    expect(cotizacion.imagenes).toBeGreaterThan(0);
    expect(nota.imagenes).toBeGreaterThan(0);
    expect(trabajo.imagenes).toBeGreaterThan(0);
    expect(prueba.imagenes).toBe(0);
    // Cotas de la medida pedida (820 × 2000) en Instrument Sans 600 de 125 px sobre el lienzo de 660 × 1090 escalado al alto del plano.
    const tam = (PLANO.cotas.tamanoPx * (PLANO.alturaMm / 25.4) * 72) / PLANO.lienzoConCotasPx.alto;
    for (const d of [nota, trabajo]) for (const cota of ["820", "2000"]) expect(todos(d).find((f) => f.s === cota)!.tam, cota).toBeCloseTo(tam, 1);
    // La cotización lleva la medida en el texto de la línea, pero ninguna cota.
    expect(hay(cotizacion, "Medida solicitada: 820 × 2000 mm (Hoja)")).toBe(true);
    for (const cota of ["820", "2000"]) expect(hay(cotizacion, cota), cota).toBe(false);
  });

  it("«Para fábrica» con sus dos firmas en la nota y la orden, y no en la cotización ni en la prueba", () => {
    for (const d of [nota, trabajo]) for (const t of ["Para fábrica", "Entrega comprometida", "Aprobado por", "Recibido por la fábrica"]) expect(hay(d, t), t).toBe(true);
    for (const d of [cotizacion, prueba]) expect(hay(d, "Para fábrica")).toBe(false);
  });

  it("el encabezado lleva solo el logo (sin datos de la empresa) y los datos de la empresa van en el pie", () => {
    for (const d of documentos()) {
      const dato = todos(d).filter((f) => f.s.startsWith("Neltume.co · "));
      expect(dato).toHaveLength(d.paginas.length);
      for (const f of dato) expect(f.y, f.s).toBeGreaterThan(d.alto - 80); // al pie
      expect(d.paginas[0].filter((f) => f.y < 130 && f.x < d.ancho / 2), "texto a la izquierda del encabezado de la primera página").toHaveLength(0);
    }
  });

  it("marcas de agua: ANULADA solo en la cancelada y PRUEBA solo en la prueba, con su opacidad", () => {
    expect(hay(cancelada, "ANULADA")).toBe(true);
    expect(cancelada.opacidades).toContain(tokens.marcasDeAgua.ANULADA.opacidad);
    expect(todos(cancelada).find((f) => f.s === "ANULADA")!.girado).toBe(true);
    for (const d of [cotizacion, nota, notaLarga, trabajo, prueba]) expect(hay(d, "ANULADA")).toBe(false);
    expect(hay(prueba, "PRUEBA")).toBe(true);
    expect(prueba.opacidades).toContain(tokens.marcasDeAgua.PRUEBA.opacidad);
    for (const d of [cotizacion, nota, notaLarga, cancelada, trabajo]) expect(d.opacidades).not.toContain(tokens.marcasDeAgua.PRUEBA.opacidad);
  });

  it("metadatos: título «{Tipo} N.º {n} · Neltume» y autor, creador y productor «Neltume.co»", () => {
    for (const [d, titulo] of [[cotizacion, "Cotización N.º 124 · Neltume"], [nota, "Nota de pedido N.º 7 · Neltume"], [trabajo, "Orden de trabajo N.º 418 · Neltume"], [prueba, "Prueba de conexión · Neltume"]] as const) {
      expect(d.info.Title).toBe(titulo);
      expect([d.info.Author, d.info.Creator, d.info.Producer]).toEqual(["Neltume.co", "Neltume.co", "Neltume.co"]);
    }
  });

  it("el archivo no pasa de 5 MiB ni de 20 páginas (límites del estándar)", () => {
    for (const d of documentos()) { expect(d.bytes).toBeLessThanOrEqual(5 * 1024 * 1024); expect(d.paginas.length).toBeLessThanOrEqual(20); }
  });

  it("la orden de trabajo no lleva importes ni «Total», y la prueba tampoco", () => {
    for (const d of [trabajo, prueba]) expect(hay(d, /\$\s?\d/)).toBe(false);
  });
});
