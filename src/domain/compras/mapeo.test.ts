import { describe, expect, it } from "vitest";
import { claveItem, decidirLinea, normalizarUnidad } from "./mapeo";

const mapeo = { materiaPrimaId: "mp-1", factor: 424, unidadFacturada: "M3", ignorar: false, materiaActiva: true };

describe("compras.mapeo (REQ-MP-7.2–7.4)", () => {
  it("la clave del ítem es su código; sin código, su nombre normalizado", () => {
    expect(claveItem({ codigo: " tab-01 ", nombre: "x" })).toBe("C:TAB-01");
    expect(claveItem({ codigo: null, nombre: "Tablón  pino" })).toBe("N:TABLON PINO");
    expect(normalizarUnidad("Un.")).toBe("UN");
    expect(normalizarUnidad("  ")).toBeNull();
  });

  it("con mapeo exacto se recibe la cantidad × el factor, redondeada al milésimo", () => {
    expect(decidirLinea(33, { cantidad: 2.5, unidad: "m3" }, mapeo)).toEqual({ estado: "recibida", materiaPrimaId: "mp-1", cantidad: 1060 });
    expect(decidirLinea(34, { cantidad: 1, unidad: "M3" }, { ...mapeo, factor: 1 / 3 })).toMatchObject({ cantidad: 0.333 });
  });

  it("sin mapeo queda por asociar; con «no es materia prima», ignorada", () => {
    expect(decidirLinea(33, { cantidad: 1, unidad: "UN" }, undefined)).toEqual({ estado: "por_asociar" });
    expect(decidirLinea(33, { cantidad: 1, unidad: "UN" }, { materiaPrimaId: null, factor: null, unidadFacturada: null, ignorar: true })).toEqual({ estado: "ignorada" });
  });

  it("notas de crédito o débito, unidad distinta, sin cantidad o materia inactiva quedan por revisar", () => {
    for (const [tipo, l, m] of [[61, { cantidad: 1, unidad: "M3" }, mapeo], [56, { cantidad: 1, unidad: "M3" }, mapeo],
      [33, { cantidad: 1, unidad: "PULG" }, mapeo], [33, { cantidad: null, unidad: "M3" }, mapeo], [33, { cantidad: 0, unidad: "M3" }, undefined],
      [33, { cantidad: 1, unidad: "M3" }, { ...mapeo, materiaActiva: false }]] as const) {
      expect(decidirLinea(tipo, l, m).estado).toBe("por_revisar");
    }
    expect(decidirLinea(33, { cantidad: 1, unidad: "PULG" }, mapeo)).toMatchObject({ motivo: "La unidad cambió: «PULG» (se esperaba «M3»)." });
  });
});
