import { describe, expect, it } from "vitest";
import { type Fragmento, leerNotaTienda, NotaIlegible } from "./nota-tienda";
import { fechaEnPalabras } from "./nota-tienda-fabrica";

// Formato «por fábrica» de la tienda (23-10-2026), con las coordenadas de su PDF real y datos inventados (ADR-0023 §10).
const f = (x: number, y: number, texto: string): Fragmento => ({ x, y, texto, pagina: 1 });
const nota = [
  f(482, 794, "Nota de pedido"), f(470, 768, "N° 51"), f(461, 744, "Fábrica Panguipulli"),
  f(346, 722, "Fecha"), f(389, 722, "Cotización"), f(270, 710, "6 de octubre de 2026"), f(395, 710, "N° 340"),
  f(40, 642, "Cliente"), f(40, 628, "Cliente Final (no se lee)"), f(40, 614, "RUT"), f(90, 614, "12.345.678-5"),
  f(332, 642, "Despacho"), f(332, 628, "Casa Lago"), f(332, 603, "Dirección de despacho"), f(430, 603, "Camino a Neltume km 3"),
  f(332, 588, "Transporte"), f(430, 588, "Starken"), f(332, 573, "Entrega"), f(430, 573, "Semana del 16 de noviembre"),
  f(40, 537, "N°"), f(57, 537, "Plano"), f(131, 537, "Producto"), f(374, 537, "Cant."), f(411, 537, "Precio fábrica"), f(509, 537, "Total"), f(532, 537, "Listo"),
  f(139, 507, "Fuy Pino Oregon 0,72 m × 2,00 m"), f(40, 496, "1"), f(385, 496, "3"), f(413, 496, "$144.000"), f(481, 496, "$432.000"),
  f(139, 495, "Medida solicitada: 720 × 2000 mm (Vano)"), f(86, 494, "2000"), f(139, 483, "Referencia de catálogo: FUY-O-2-A · 0,70–0,75 × 2,00 m"), f(62, 473, "720"),
  f(139, 324, "Marco Pino Oregon 2x4 pulg. kit"), f(40, 318, "2"), f(385, 318, "3"), f(419, 318, "$19.000"), f(481, 318, "$57.000"),
  f(139, 311, "Referencia de catálogo: MAR-O-2X4-B · 2,10 m"),
  f(363, 271, "Neto"), f(505, 271, "$489.000"), f(363, 253, "IVA 19 %"), f(513, 253, "$92.910"), f(363, 219, "Total"), f(447, 219, "$581.910"),
  f(54, 159, "Entrega comprometida"), f(153, 159, "20-11-2026"),
];

describe("lectura de la nota «por fábrica» de la tienda (ADR-0023 §10, T19.9)", () => {
  it("lee número, fecha, cotización, despacho y filas con la referencia de catálogo; no lee al cliente final", () => {
    const n = leerNotaTienda(nota);
    expect(n).toMatchObject({
      numero: "51", fecha: "2026-10-06", refCotizacion: "340",
      despacho: { direccion: "Camino a Neltume km 3", transporte: "Starken", proyecto: "Casa Lago", entregaComprometida: "2026-11-20" },
      totales: { subtotal: 489000, total: 581910 }, avisos: [],
    });
    expect(n.lineas).toEqual([
      { codigo: "FUY-O-2-A", descripcion: "Fuy Pino Oregon 0,72 m × 2,00 m", medidaSolicitada: "720 × 2000 mm (Vano)", cantidad: 3, precioUnitario: 144000, total: 432000 },
      { codigo: "MAR-O-2X4-B", descripcion: "Marco Pino Oregon 2x4 pulg. kit", medidaSolicitada: null, cantidad: 3, precioUnitario: 19000, total: 57000 },
    ]);
    expect(JSON.stringify(n)).not.toMatch(/Cliente Final|12\.345\.678-5/);
  });

  it("rechaza la nota de otra fábrica, una anulada y una referencia sin código", () => {
    expect(() => leerNotaTienda(nota.map((x) => (x.texto === "Fábrica Panguipulli" ? { ...x, texto: "Fábrica Santiago" } : x)))).toThrow(/Santiago/);
    expect(() => leerNotaTienda([...nota, f(200, 600, "ANULADA")])).toThrow(NotaIlegible);
    expect(() => leerNotaTienda(nota.map((x) => (x.texto.startsWith("Referencia de catálogo: FUY") ? { ...x, texto: "Referencia de catálogo: IA-123" } : x)))).toThrow(/código/);
  });

  it("avisa si el neto no cuadra con las filas", () => {
    expect(leerNotaTienda(nota.map((x) => (x.texto === "$489.000" ? { ...x, texto: "$500.000" } : x))).avisos).toHaveLength(1);
  });

  it("fechas en palabras", () => {
    expect(fechaEnPalabras("23 de octubre de 2026")).toBe("2026-10-23");
    expect(fechaEnPalabras("1 de marzo de 2027")).toBe("2027-03-01");
    expect(fechaEnPalabras("semana del 16")).toBeNull();
  });
});

// Lector tolerante (ADR-0025 D10; estilo común v1 §8): lo que pasa cuando la tienda cambia de estilo.
describe("lector tolerante de la nota «por fábrica» (F22, REQ-COT-8.6)", () => {
  it("acepta «N.º», «N°» y «Nº» en el número de la nota y en la cotización", () => {
    for (const ordinal of ["N.º", "N°", "Nº"]) {
      const n = leerNotaTienda(nota.map((x) => (/^N° \d+$/.test(x.texto) ? { ...x, texto: x.texto.replace("N°", ordinal) } : x)));
      expect(n).toMatchObject({ numero: "51", refCotizacion: "340" });
    }
  });

  it("une «Referencia de catálogo:» con el código cuando pdfjs los parte por el cambio de fuente", () => {
    const partida = nota.flatMap((x) => (x.texto.startsWith("Referencia de catálogo: FUY")
      ? [f(139, 483, "Referencia de catálogo:"), f(218, 483, "FUY-O-2-A"), f(262, 483, "· 0,70–0,75 × 2,00 m")] : [x]));
    const n = leerNotaTienda(partida);
    expect(n.lineas.map((l) => [l.codigo, l.descripcion, l.cantidad])).toEqual([["FUY-O-2-A", "Fuy Pino Oregon 0,72 m × 2,00 m", 3], ["MAR-O-2X4-B", "Marco Pino Oregon 2x4 pulg. kit", 3]]);
  });

  it("lee la cantidad aunque «Cant.» y la cifra queden ~25 pt aparte (columnas alineadas a la derecha)", () => {
    const n = leerNotaTienda(nota.map((x) => (/^3$/.test(x.texto) ? { ...x, x: x.x + 14 } : x)));
    expect(n.lineas.map((l) => l.cantidad)).toEqual([3, 3]);
  });

  it("lee un ítem de fila alta (descripción larga: la cantidad queda ~56 pt sobre la referencia) y no toma la cantidad del ítem anterior si falta la propia", () => {
    const alta = nota.map((x) => (x.texto.startsWith("Referencia de catálogo: FUY") ? { ...x, y: 440 } : x));
    expect(leerNotaTienda(alta).lineas.map((l) => [l.codigo, l.cantidad, l.total])).toEqual([["FUY-O-2-A", 3, 432000], ["MAR-O-2X4-B", 3, 57000]]);
    // Sin la fila propia de MAR (cantidad y precios) y con su referencia a 40 pt de la de FUY, la cantidad de FUY queda a 96 pt de la
    // de MAR, dentro del límite, pero por encima de la referencia anterior: no es suya.
    const sinPropia = alta.map((x) => (x.texto.startsWith("Referencia de catálogo: MAR") ? { ...x, y: 400 } : x)).filter((x) => x.y !== 318 && x.y !== 324);
    expect(() => leerNotaTienda(sinPropia)).toThrow(/cantidad del ítem MAR-O-2X4-B/);
  });

  it("con el encabezado repetido en la página 2 lee todos los ítems, la descripción y el «Total» de la nota", () => {
    const p = (pagina: number) => (x: number, y: number, texto: string): Fragmento => ({ x, y, texto, pagina });
    const [a, b] = [p(1), p(2)];
    // «Producto» queda en la misma x que la descripción y a menos de 20 pt de la línea del primer ítem: el caso que lo confundiría.
    const cabecera = (g: ReturnType<typeof p>, y: number) => [g(40, y, "N°"), g(57, y, "Plano"), g(139, y, "Producto"), g(374, y, "Cant."), g(411, y, "Precio fábrica"), g(509, y, "Total"), g(532, y, "Listo")];
    const n = leerNotaTienda([
      ...nota.filter((x) => x.y > 545),
      ...cabecera(a, 537), a(139, 507, "Fuy Pino Oregon 0,72 m × 2,00 m"), a(385, 496, "3"), a(413, 496, "$144.000"), a(481, 496, "$432.000"),
      a(139, 483, "Referencia de catálogo: FUY-O-2-A · 0,70–0,75 × 2,00 m"),
      ...cabecera(b, 762), b(139, 755, "Marco Pino Oregon 2x4 pulg. kit"), b(385, 744, "3"), b(419, 744, "$19.000"), b(481, 744, "$57.000"),
      b(139, 731, "Referencia de catálogo: MAR-O-2X4-B · 2,10 m"),
      b(363, 650, "Neto"), b(505, 650, "$489.000"), b(363, 632, "IVA 19 %"), b(513, 632, "$92.910"), b(363, 600, "Total"), b(447, 600, "$581.910"),
    ]);
    expect(n.lineas.map((l) => [l.codigo, l.descripcion])).toEqual([["FUY-O-2-A", "Fuy Pino Oregon 0,72 m × 2,00 m"], ["MAR-O-2X4-B", "Marco Pino Oregon 2x4 pulg. kit"]]);
    expect(n.totales).toEqual({ subtotal: 489000, total: 581910 });
    expect(n.avisos).toEqual([]);
  });

  it("una entrega que no es fecha va a `entregaTexto` con un aviso; con día, mes y año se lee como fecha", () => {
    const con = (texto: string) => leerNotaTienda(nota.map((x) => (x.texto === "20-11-2026" ? { ...x, texto } : x)));
    expect(con("15 de noviembre")).toMatchObject({ despacho: { entregaComprometida: null, entregaTexto: "15 de noviembre" } });
    expect(con("15 de noviembre").avisos).toEqual([expect.stringContaining("15 de noviembre")]);
    expect(con("15 de noviembre de 2026")).toMatchObject({ despacho: { entregaComprometida: "2026-11-15", entregaTexto: null }, avisos: [] });
  });

  it("avisa de las líneas sin referencia de catálogo (pedidos especiales) en vez de omitirlas", () => {
    const especial = [f(139, 410, "Puerta según diseño del cliente 7 · Roble"), f(385, 400, "1"), f(414, 400, "Por definir"), f(482, 400, "Por definir"), f(139, 388, "Producto personalizado, fuera de catálogo")];
    const n = leerNotaTienda([...nota, ...especial]);
    expect(n.lineas).toHaveLength(2);
    expect(n.avisos).toEqual([expect.stringMatching(/^La nota trae 1 línea sin «Referencia de catálogo»/)]);
    expect(leerNotaTienda(nota).avisos).toEqual([]);
  });
});
