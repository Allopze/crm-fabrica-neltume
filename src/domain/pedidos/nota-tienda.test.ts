import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Fragmento, leerNotaTienda, NotaIlegible } from "./nota-tienda";
import { esPdf, fragmentosPdf } from "./pdf-texto";

const f = (x: number, y: number, texto: string): Fragmento => ({ x, y, texto, pagina: 1 });
const base = [
  f(384, 780, "NOTA DE PEDIDO N° 12"), f(482, 760, "Fecha:"), f(511, 760, "06-10-2026"), f(465, 748, "Ref. cotización:"), f(528, 748, "N° 340"),
  f(43, 594, "Nombre:"), f(79, 594, "Cliente Final (no se lee)"), f(43, 575, "RUT:"), f(64, 575, "12.345.678-5"),
  f(307, 594, "Dirección de despacho:"), f(402, 594, "Av. Alemania 0123, Temuco"), f(307, 575, "Medio de transporte:"), f(391, 575, "Camión de fábrica"),
  f(307, 555, "Proyecto:"), f(348, 555, "Casa Pérez"),
  f(46, 454, "ITEM"), f(79, 454, "CÓDIGO"), f(148, 454, "DESCRIPCIÓN"), f(379, 454, "CANT."), f(425, 454, "PRECIO UNIT."), f(501, 454, "TOTAL"), f(530, 454, "LISTO"),
  f(46, 429, "1"), f(79, 430, "FUY-O-2-A"), f(148, 429, "Fuy Pino Oregon 0,70 a 0,75 m × 2 m"), f(148, 421, "Medida solicitada: 0,72 × 2,00 m (vano)"),
  f(395, 429, "3"), f(439, 429, "$120.000"), f(491, 429, "$360.000"),
  f(46, 396, "2"), f(79, 396, "MAR-O-2X4-B"), f(148, 396, "Marco Pino Oregon 2x4 pulg. kit"), f(395, 396, "3"), f(443, 396, "$19.500"), f(495, 396, "$58.500"),
  f(362, 354, "SUBTOTAL"), f(519, 354, "$418.500"), f(362, 309, "TOTAL"), f(507, 309, "$498.015"),
  f(43, 245, "Entrega comprometida:"), f(150, 245, "20-11-2026"),
];

describe("lectura de la nota de pedido de la tienda (ADR-0008, REQ-COT-8.6)", () => {
  it("lee número, referencia, despacho y filas con medida solicitada; no lee al cliente final", () => {
    const n = leerNotaTienda(base);
    expect(n).toMatchObject({
      numero: "12", fecha: "2026-10-06", refCotizacion: "340",
      despacho: { direccion: "Av. Alemania 0123, Temuco", transporte: "Camión de fábrica", proyecto: "Casa Pérez", entregaComprometida: "2026-11-20" },
      totales: { subtotal: 418500, total: 498015 }, avisos: [],
    });
    expect(n.lineas).toEqual([
      { codigo: "FUY-O-2-A", descripcion: "Fuy Pino Oregon 0,70 a 0,75 m × 2 m", medidaSolicitada: "0,72 × 2,00 m (vano)", cantidad: 3, precioUnitario: 120000, total: 360000 },
      { codigo: "MAR-O-2X4-B", descripcion: "Marco Pino Oregon 2x4 pulg. kit", medidaSolicitada: null, cantidad: 3, precioUnitario: 19500, total: 58500 },
    ]);
    expect(JSON.stringify(n)).not.toContain("Cliente Final");
    expect(JSON.stringify(n)).not.toContain("12.345.678-5");
  });

  it("avisa si un total o el subtotal no cuadran (filas faltantes)", () => {
    const n = leerNotaTienda(base.map((x) => (x.texto === "$418.500" ? { ...x, texto: "$999.999" } : x.texto === "$58.500" ? { ...x, texto: "$58.000" } : x)));
    expect(n.avisos).toHaveLength(2);
  });

  it("rechaza notas anuladas, documentos que no son notas y tablas sin códigos", () => {
    expect(() => leerNotaTienda([...base, f(200, 500, "ANULADA")])).toThrow(NotaIlegible);
    expect(() => leerNotaTienda(base.filter((x) => !x.texto.startsWith("NOTA DE PEDIDO")))).toThrow(/NOTA DE PEDIDO/);
    expect(() => leerNotaTienda(base.filter((x) => !/^[A-Z]+-/.test(x.texto)))).toThrow(/código/);
  });

  it("acepta «N.º» y una entrega que no es fecha va a `entregaTexto` con un aviso (ADR-0025 D10, F22)", () => {
    const n = leerNotaTienda(base.map((x) => (x.texto.startsWith("N°") || x.texto.startsWith("NOTA") ? { ...x, texto: x.texto.replace("N°", "N.º") } : x.texto === "20-11-2026" ? { ...x, texto: "15 de noviembre" } : x)));
    expect(n).toMatchObject({ numero: "12", refCotizacion: "340", despacho: { entregaComprometida: null, entregaTexto: "15 de noviembre" } });
    expect(n.avisos).toEqual([expect.stringContaining("15 de noviembre")]);
  });

  it("lee el PDF real que genera el cotizador de la tienda (ejemplo)", async () => {
    const datos = new Uint8Array(readFileSync("tests/fixtures/nota-tienda-ejemplo.pdf"));
    expect(esPdf(datos)).toBe(true);
    const n = leerNotaTienda(await fragmentosPdf(datos));
    expect(n).toMatchObject({ numero: "1", fecha: "2026-09-30", refCotizacion: "323", despacho: { transporte: "Camión de fábrica", proyecto: "Casa Pérez" }, avisos: [] });
    expect(n.lineas.map((l) => [l.codigo, l.cantidad, l.medidaSolicitada])).toEqual([["HUIL-O-3-B", 3, "0,80 × 2,10 m"], ["MAR-O-2X4-B", 3, "2x4 pulg. × 2,10 m"]]);
    expect(esPdf(new TextEncoder().encode("hola"))).toBe(false);
  });
});
