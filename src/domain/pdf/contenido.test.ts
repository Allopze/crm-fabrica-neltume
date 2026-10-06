import { describe, expect, it } from "vitest";
import { contenidoCotizacion, fechaSantiago } from "./contenido";

const base = {
  numero: 124, aprobadaEn: new Date("2026-10-06T02:30:00Z"), vigenciaHasta: "2026-10-20", listaVersion: 3,
  cliente: { nombre: "Constructora Los Alerces", rut: "12.345.678-5", comuna: "Temuco", contacto: null },
  items: [
    { codigo: "NEL-R-4-B", descripcion: "Neltume · Raulí · 0,90 a 0,95 × 2,10 m", cantidad: 3, precioUnitario: 277760, totalLinea: 833280 },
    { codigo: null, descripcion: "Toltén · Raulí · 0,87 × 2,15 m", cantidad: 2, precioUnitario: 400000, totalLinea: 800000 },
  ],
  subtotal: 1633280, descuento: 0, descuentoMotivo: null, iva: 310323, total: 1943603,
};

describe("pdf.contenido (REQ-COT-4.2)", () => {
  it("formato chileno, vigencia, cliente y la nota de flete", () => {
    const k = contenidoCotizacion(base);
    expect(k.titulo).toBe("Cotización N.º 124");
    expect(k.fechas).toBe("Fecha 05-10-2026 · Válida hasta 20-10-2026"); // 23:30 del 05-10 en Santiago
    expect(k.cliente).toContainEqual(["RUT", "12.345.678-5"]);
    expect(k.cliente).toContainEqual(["Contacto", "—"]);
    expect(k.lineas[0]).toEqual({ codigo: "NEL-R-4-B", descripcion: base.items[0].descripcion, cantidad: "3", unitario: "$277.760", total: "$833.280" });
    expect(k.lineas[1].codigo).toBe("A pedido");
    expect(k.totales).toEqual([["Subtotal neto", "$1.633.280"], ["IVA 19 %", "$310.323"]]);
    expect(k.total).toBe("$1.943.603");
    expect(k.pie[0]).toContain("Valores puestos en fábrica, flete aparte.");
    expect(k.pie[0]).toContain("lista v3");
  });

  it("muestra el descuento con su motivo solo si existe", () => {
    const k = contenidoCotizacion({ ...base, descuento: 50000, descuentoMotivo: "cliente frecuente" });
    expect(k.totales[1]).toEqual(["Descuento (cliente frecuente)", "−$50.000"]);
  });

  it("la fecha se toma en la zona de Santiago", () => {
    expect(fechaSantiago(new Date("2026-01-01T02:00:00Z"))).toBe("31-12-2025");
  });
});
