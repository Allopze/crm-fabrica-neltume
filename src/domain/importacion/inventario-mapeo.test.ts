import { describe, expect, it } from "vitest";
import { type CatalogoInventario, type FilaInventario, mapearDespachos, mapearPuertas, resolverArticulo } from "./inventario-mapeo";

// Mapeo de la planilla de inventario (ADR-0018, REQ-STK-9.1, 9.2, 10.1). Datos ficticios.
const HOY = "2026-10-07";
const fila = (p: Partial<FilaInventario>): FilaInventario => ({
  fila: 2, modelo: "MOLCO", medida: "80 X 2,10", codigo: 202308000000101, madera: "OREGON", produccion: null, estado: "DISPONIBLE",
  ubicacion: "FABRICA", cliente: null, observaciones: "OK", ...p,
});

const cat: CatalogoInventario = {
  modelos: new Set(["MOLCO"]), maderas: new Set(["PINO OREGON"]),
  rangos: [{ codigo: "3", minM: 0.8, maxM: 0.85 }], altos: [{ codigo: "B", altoM: 2.1 }, { codigo: "A", altoM: 2 }],
  articulos: new Map([["MOLCO|PINO OREGON|3|B", { id: "a1", codigo: "MOL-O-3-B" }]]),
};

describe("inventario.mapeo", () => {
  it("una fila completa da una puerta con su código, medida y apartado", () => {
    const { puertas } = mapearPuertas([fila({ cliente: " Cliente Ficticio ", observaciones: "OK // MANCHADA" })], HOY);
    expect(puertas[0]).toMatchObject({ codigo: "202308000000101", modelo: "MOLCO", madera: "PINO OREGON", anchoMm: 800, altoMm: 2100,
      ubicacion: "Fábrica", observacion: "Manchada", apartadaPara: "Cliente Ficticio", dudas: [] });
  });

  it("sin código o con código repetido, la puerta recibe uno nuevo y queda informada", () => {
    const { puertas } = mapearPuertas([fila({}), fila({ fila: 3 }), fila({ fila: 4, codigo: null })], HOY);
    expect(puertas.map((p) => p.codigo)).toEqual(["202308000000101", null, null]);
    expect(puertas[1].dudas[0]).toMatch(/repetido/);
    expect(puertas[2].dudas[0]).toMatch(/sin código/);
  });

  it("rechaza solo la fila ilegible y marca las observaciones a revisar", () => {
    const r = mapearPuertas([fila({ medida: "?" }), fila({ fila: 3, observaciones: "POSIBLE VENDIDA" })], HOY);
    expect(r.rechazos).toEqual([{ fila: 2, motivo: "Medida «?» ilegible" }]);
    expect(r.puertas[0].dudas[0]).toMatch(/a revisar/);
  });

  it("solo es de catálogo si modelo, madera, ancho en rango, alto de grilla y artículo calzan", () => {
    const p = { modelo: "MOLCO", madera: "PINO OREGON", anchoMm: 820, altoMm: 2100 };
    expect(resolverArticulo(p, cat)).toEqual({ tipo: "catalogo", articuloId: "a1", codigo: "MOL-O-3-B" });
    expect(resolverArticulo({ ...p, modelo: "MAMPARA LICAN" }, cat)).toMatchObject({ tipo: "fuera", motivo: "modelo que no está en la lista" });
    expect(resolverArticulo({ ...p, madera: "ALAMO" }, cat)).toMatchObject({ motivo: "madera que no está en la lista" });
    expect(resolverArticulo({ ...p, anchoMm: 780 }, cat)).toMatchObject({ motivo: "ancho fuera de grilla" });
    expect(resolverArticulo({ ...p, altoMm: 2066 }, cat)).toMatchObject({ motivo: "alto fuera de grilla" });
    expect(resolverArticulo({ ...p, altoMm: 2000 }, cat)).toMatchObject({ motivo: "combinación sin precio en la lista" });
  });

  it("el historial conserva cada fila, marca dudas y da huellas distintas a filas idénticas", () => {
    const base = { fila: 2, modelo: "COZ COZ", medida: "90 X 2,00", codigo: 202308000000496, madera: "OREGON", fecha: new Date("2023-01-02"),
      estado: "VENDIDA", cliente: "Cliente Uno", documento: "F. 1", nota: "OK" };
    const h = mapearDespachos([base, { ...base, fila: 3 }, { ...base, fila: 4, codigo: "PRODUCCION DEL DIA", fecha: "***" }], HOY);
    expect(h[0]).toMatchObject({ codigo: "202308000000496", fechaProduccion: "2023-01-02", dudas: ["código repetido"] });
    expect(h[0].huella).not.toBe(h[1].huella);
    expect(h[2]).toMatchObject({ dudas: ["código no numérico", "fecha imposible"], fechaTexto: "***" });
    expect(mapearDespachos([base], HOY)[0].huella).toBe(h[0].huella);
  });
});
