import { describe, expect, it } from "vitest";
import { type Categorias, type FilaPrecio, mapearFila, mapearFilas, normalizar } from "./mapear";

const cat: Categorias = {
  modelos: new Map([["NELTUME", "NEL"], ["LOS LAGOS", "LLAG"], ["MARCO", "MAR"], ["ENDOLADO", "ENDO"]]),
  anchos: new Map([["0,80 A 0,85", "3"], ["0,70 A 0,75", "2"], ["2X4", "2X4"], ["6X1", "6X1"]]),
  altos: new Map([["2", "A"], ["2.1", "B"], ["2.2", "C"], ["6X1X2", "I"]]),
};
const fila = (p: Partial<FilaPrecio>): FilaPrecio => ({
  fila: 10, codigo: "NEL-R-3-B", modelo: "NELTUME", tipo: "PUERTA BLOQUE", ancho: "0,80 A 0,85", espesor: null, alto: 2.1,
  madera: "RAULI", pulgadas: 5, costoProduccion: 1, costoMateriales: 1, costoInsumos: 1, costosGenerales: 1,
  costoTotal: 100_000, margen: 0.2, precioNeto: 120_000, ...p,
});

describe("normalizar", () => {
  it("quita tildes, espacios y pasa a mayúsculas", () => {
    expect(normalizar(" Raulí ")).toBe("RAULI");
    expect(normalizar("pino  oregón")).toBe("PINO OREGON");
  });
});

describe("mapear fila del Excel (REQ-STK-1.2, 1.4; DATA-MODEL §5)", () => {
  it("acepta una puerta cuyo código coincide con modelo, madera y medida", () => {
    const r = mapearFila(fila({}), cat);
    expect(r).toMatchObject({ ok: true, articulo: { codigo: "NEL-R-3-B", familia: "puerta", tipo: "BLOQUE", anchoCodigo: "3", altoCodigo: "B" } });
  });

  it("acepta RAULÍ con tilde (Categorias) y RAULI sin tilde (Precio)", () => {
    expect(mapearFila(fila({ madera: "Raulí" }), cat).ok).toBe(true);
  });

  it("detecta el caso real LLAG-O-2-A con alto 2,2 (debía ser LLAG-O-2-C) como discrepancia", () => {
    const r = mapearFila(fila({ codigo: "LLAG-O-2-A", modelo: "LOS LAGOS", ancho: "0,70 A 0,75", alto: 2.2, madera: "PINO OREGON" }), cat);
    expect(r).toMatchObject({ ok: false, fila: 10, motivo: expect.stringContaining("se esperaba LLAG-O-2-C"), discrepancia: { codigoHoja: "LLAG-O-2-A" } });
  });

  it("mapea marcos por pulgadas y molduras por cm × espesor × largo", () => {
    expect(mapearFila(fila({ codigo: "MAR-O-2X4-B", modelo: "MARCO", tipo: "", ancho: 4, madera: "PINO OREGON", costoTotal: null }), cat))
      .toMatchObject({ ok: true, articulo: { familia: "accesorio", anchoCodigo: "2X4", altoCodigo: "B", tipo: null } });
    expect(mapearFila(fila({ codigo: "ENDO-O-6X1-I", modelo: "ENDOLADO", tipo: null, ancho: "6 CM", espesor: 1, alto: 2, madera: "PINO OREGON", costoTotal: null }), cat))
      .toMatchObject({ ok: true, articulo: { anchoCodigo: "6X1", altoCodigo: "I", espesor: 1 } });
  });

  it("rechaza con motivo: madera desconocida, precio vacío, tipo inválido, ancho fuera de categorías", () => {
    expect(mapearFila(fila({ madera: "ROBLE" }), cat)).toMatchObject({ ok: false, motivo: expect.stringContaining("ROBLE") });
    expect(mapearFila(fila({ precioNeto: null }), cat)).toMatchObject({ ok: false, motivo: "Precio neto vacío o no positivo" });
    expect(mapearFila(fila({ tipo: "PUERTA RARA" }), cat)).toMatchObject({ ok: false });
    expect(mapearFila(fila({ ancho: "0,87 A 0,89" }), cat)).toMatchObject({ ok: false, motivo: expect.stringContaining("Ancho") });
  });

  it("rechaza si el precio neto no es costo × (1 + margen)", () => {
    expect(mapearFila(fila({ precioNeto: 125_000 }), cat)).toMatchObject({ ok: false, motivo: expect.stringContaining("margen") });
  });

  it("rechaza códigos repetidos conservando el primero", () => {
    const { validos, rechazos } = mapearFilas([fila({ fila: 4 }), fila({ fila: 9 })], cat);
    expect(validos).toHaveLength(1);
    expect(rechazos).toEqual([{ fila: 9, motivo: "Código NEL-R-3-B repetido (ya está en la fila 4)" }]);
  });
});

describe("corrección de filas inconsistentes por dos hipótesis (REQ-STK-1.6)", () => {
  const llag = (p: Partial<FilaPrecio>) => fila({ modelo: "LOS LAGOS", ancho: "0,70 A 0,75", madera: "PINO OREGON", ...p });

  it("A: el código está mal si el esperado está libre y el de la hoja ya existe (caso LLAG-O-2-A real)", () => {
    const r = mapearFilas([llag({ fila: 1, codigo: "LLAG-O-2-A", alto: 2 }), llag({ fila: 2, codigo: "LLAG-O-2-A", alto: 2.2 })], cat);
    expect(r.validos.map((a) => [a.codigo, a.altoM])).toEqual([["LLAG-O-2-A", 2], ["LLAG-O-2-C", 2.2]]);
    expect(r.correcciones).toEqual([{ fila: 2, detalle: "Código LLAG-O-2-A → LLAG-O-2-C" }]);
    expect(r.rechazos).toEqual([]);
  });

  it("B: los atributos están mal si el código de la hoja está libre y el esperado ya existe (marcos de raulí con largo 2)", () => {
    const marco = (p: Partial<FilaPrecio>) => fila({ modelo: "MARCO", tipo: "", ancho: 4, madera: "PINO OREGON", costoTotal: null, ...p });
    const r = mapearFilas([marco({ fila: 1, codigo: "MAR-O-2X4-A", alto: 2 }), marco({ fila: 2, codigo: "MAR-O-2X4-B", alto: 2 })], cat);
    expect(r.validos.map((a) => [a.codigo, a.altoM])).toEqual([["MAR-O-2X4-A", 2], ["MAR-O-2X4-B", 2.1]]);
    expect(r.correcciones).toEqual([{ fila: 2, detalle: "MAR-O-2X4-B: largo 2 → 2,1 m" }]);
  });

  it("si ambas hipótesis son posibles (o ninguna) la fila se rechaza como ambigua", () => {
    const ambas = mapearFilas([llag({ fila: 2, codigo: "LLAG-O-2-A", alto: 2.2 })], cat);
    expect(ambas.validos).toEqual([]);
    expect(ambas.rechazos[0].motivo).toContain("Discrepancia ambigua");
    const ninguna = mapearFilas([llag({ fila: 1, codigo: "LLAG-O-2-A", alto: 2 }), llag({ fila: 2, codigo: "LLAG-O-2-C", alto: 2.2 }), llag({ fila: 3, codigo: "LLAG-O-2-A", alto: 2.2 })], cat);
    expect(ninguna.rechazos).toEqual([{ fila: 3, motivo: expect.stringContaining("Discrepancia ambigua") }]);
  });
});
