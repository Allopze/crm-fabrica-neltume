import { describe, expect, it } from "vitest";
import { ALIAS_INICIALES, claveTolerante, damerau, resolverModelo } from "./modelos";

const modelos = ["HUILO HUILO", "COZ COZ", "PANGUIPULLI", "NELTUME", "LOS LAGOS", "PILLO REAL"].map((nombre, i) => ({ id: String(i), nombre, codigo: nombre.slice(0, 3) }));
const r = (t: string | null, extra = modelos) => resolverModelo(t, extra, ALIAS_INICIALES);

describe("resolución de modelos y alias (REQ-COT-2.11)", () => {
  it("el nombre real, el código y la escritura sin espacios resuelven directo", () => {
    expect(r("Neltume")).toMatchObject({ tipo: "ok", modelo: { nombre: "NELTUME" } });
    expect(r("LOS")).toMatchObject({ tipo: "ok", modelo: { nombre: "LOS LAGOS" } });
    expect(r("huilohuilo")).toMatchObject({ tipo: "ok", modelo: { nombre: "HUILO HUILO" } });
  });

  it("los alias seguros de la tienda se aplican («coscos», «willo», «pangipulli»)", () => {
    expect(r("coscos")).toMatchObject({ tipo: "ok", modelo: { nombre: "COZ COZ" } });
    expect(r("Willo")).toMatchObject({ tipo: "ok", modelo: { nombre: "HUILO HUILO" } });
    expect(r("Pangipulli")).toMatchObject({ tipo: "ok", modelo: { nombre: "PANGUIPULLI" } });
  });

  it("un alias dudoso o un nombre parecido se sugiere, nunca se aplica en silencio", () => {
    expect(r("pillo")).toMatchObject({ tipo: "posible", modelo: { nombre: "HUILO HUILO" } });
    expect(r("Neltumme")).toMatchObject({ tipo: "posible", modelo: { nombre: "NELTUME" } }); // letra doble
    expect(r("Nelutme")).toMatchObject({ tipo: "posible", modelo: { nombre: "NELTUME" } }); // transposición
    expect(r("Osorno")).toEqual({ tipo: "desconocido" });
    expect(r(null)).toEqual({ tipo: "desconocido" });
  });

  it("un modelo real gana sobre un alias con el mismo nombre", () => {
    const conPillo = [...modelos, { id: "9", nombre: "PILLO", codigo: "PIL" }];
    expect(r("pillo", conPillo)).toMatchObject({ tipo: "ok", modelo: { nombre: "PILLO" } });
  });

  it("claves y distancia", () => {
    expect(claveTolerante("Wilo Wilo")).toBe("WILO");
    expect(claveTolerante("Huillo")).toBe("HUILO");
    expect(damerau("NELTUME", "NELUTME")).toBe(1);
  });
});
