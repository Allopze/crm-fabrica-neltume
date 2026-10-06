import { describe, expect, it } from "vitest";
import { alPeso, calcularLinea, calcularTotales, conIva } from "./calcular";

describe("cálculo de importes (REQ-COT-1.2, 1.3)", () => {
  it("redondea el unitario al peso (mitad hacia arriba) y la línea es cantidad × unitario entero", () => {
    expect(calcularLinea({ precioNetoLista: 248000, recargoPct: 0.12, cantidad: 3 })).toEqual({ precioUnitario: 277760, totalLinea: 833280 });
    expect(calcularLinea({ precioNetoLista: 114099.7898, recargoPct: 0.25, cantidad: 1 })).toEqual({ precioUnitario: 142625, totalLinea: 142625 });
    expect(alPeso(100.5)).toBe(101);
    expect(alPeso(0.1 * 3 * 1000)).toBe(300);
  });

  it("calcula subtotal, descuento antes del IVA, IVA 19 % y total en enteros", () => {
    expect(calcularTotales([833280, 811200])).toEqual({ subtotal: 1644480, descuento: 0, neto: 1644480, iva: 312451, total: 1956931 });
    expect(calcularTotales([100000], 0.1)).toEqual({ subtotal: 100000, descuento: 10000, neto: 90000, iva: 17100, total: 107100 });
  });

  it("la suma de líneas cuadra siempre con lo que ve el cliente", () => {
    const l = [0.3333, 1.6667, 2.5].map((x) => calcularLinea({ precioNetoLista: 10000 * x, recargoPct: 0.15, cantidad: 7 }));
    const t = calcularTotales(l.map((x) => x.totalLinea));
    expect(t.subtotal).toBe(l.reduce((s, x) => s + x.precioUnitario * 7, 0));
    expect(Number.isInteger(t.total)).toBe(true);
  });

  it("rechaza cantidades no enteras o no positivas, recargos negativos y descuentos fuera de rango", () => {
    expect(() => calcularLinea({ precioNetoLista: 1000, recargoPct: 0, cantidad: 1.5 })).toThrow();
    expect(() => calcularLinea({ precioNetoLista: 1000, recargoPct: 0, cantidad: 0 })).toThrow();
    expect(() => calcularLinea({ precioNetoLista: 1000, recargoPct: -0.1, cantidad: 1 })).toThrow();
    expect(() => calcularTotales([1000], 1)).toThrow();
  });

  it("precio con IVA por unidad usa la misma regla", () => {
    expect(conIva(277760)).toBe(330534);
  });
});
