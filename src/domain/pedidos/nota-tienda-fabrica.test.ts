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
