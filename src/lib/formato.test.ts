import { describe, expect, it } from "vitest";
import { clp, fecha, fechaHora, metros, metrosDesdeMm, cantidad, leerCantidad, nombreMadera, nombrePropio, puntoFinal, titulo, usd, usoPorPuerta } from "./formato";

describe("formato chileno (REQ-STK-2.3, REQ-NFR-9)", () => {
  it("formatea CLP sin decimales y con punto de miles", () => {
    expect(clp(1234567)).toBe("$1.234.567");
    expect(clp(277759.6)).toBe("$277.760");
    expect(clp(0)).toBe("$0");
  });

  it("formatea fechas dd-mm-aaaa", () => {
    expect(fecha("2026-10-05")).toBe("05-10-2026");
    expect(fechaHora("2026-10-05T10:42:00")).toBe("05-10-2026 10:42");
  });

  it("lee los timestamps con zona en America/Santiago, no en UTC", () => {
    // Octubre: Chile está en UTC-3. Las 02:42 UTC son las 23:42 del día anterior.
    expect(fechaHora("2026-10-05T02:42:00Z")).toBe("04-10-2026 23:42");
    expect(fecha("2026-10-05T02:42:00Z")).toBe("04-10-2026");
    expect(fechaHora("2026-10-05T02:42:00.000+00:00")).toBe("04-10-2026 23:42");
    expect(fechaHora(new Date("2026-10-05T02:42:00Z"))).toBe("04-10-2026 23:42");
  });

  it("formatea metros con dos decimales y coma", () => {
    expect(metros(2.1)).toBe("2,10");
    expect(metros(0.9)).toBe("0,90");
    expect(metrosDesdeMm(900)).toBe("0,90");
    expect(metrosDesdeMm(885)).toBe("0,885");
    expect(metrosDesdeMm(2100)).toBe("2,10");
  });

  it("formatea dólares con coma decimal", () => {
    expect(usd(0.15)).toBe("US$ 0,15");
    expect(usd(5)).toBe("US$ 5,00");
    expect(usd(0.0284, 4)).toBe("US$ 0,0284");
    expect(usd(null)).toBe("—");
  });
});

describe("textos importados en mayúsculas (REQ-NFR-9)", () => {
  it("lee nombres y estados como se escriben a mano, sin tocar lo que ya trae minúsculas", () => {
    expect(nombrePropio("MIREYA OBANDO")).toBe("Mireya Obando");
    expect(nombrePropio("JUAN DE LA FUENTE")).toBe("Juan de la Fuente");
    expect(nombrePropio("VENDIDA")).toBe("Vendida");
    expect(nombrePropio("NELTUME.CO")).toBe("Neltume.co");
    expect(nombrePropio("F. 2440")).toBe("F. 2440");
    expect(nombrePropio("Constructora Los Alerces SpA")).toBe("Constructora Los Alerces SpA");
    expect(titulo("ESPECIAL LOS LAGOS // RANCO")).toBe("Especial Los Lagos // Ranco");
  });

  it("nombra las maderas con sus tildes", () => {
    expect(nombreMadera("PINO OREGON")).toBe("Pino Oregón");
    expect(nombreMadera("RAULI")).toBe("Raulí");
    expect(nombreMadera("Raulí")).toBe("Raulí");
    expect(nombreMadera("COIGUE")).toBe("Coigue");
  });

  it("no duplica el punto final después de un nombre que ya lo trae", () => {
    expect(puntoFinal("Ferretería Puyehue Ltda.")).toBe("");
    expect(puntoFinal("Camila Torres")).toBe(".");
  });
});

describe("cantidades de receta (REQ-MP-3.1)", () => {
  it("muestran 4 decimales y la lectura «1 cada N»; se escriben con coma o como fracción", () => {
    expect(cantidad(1 / 70)).toBe("0,0143");
    expect(usoPorPuerta(0.0143)).toBe("1 cada 70 puertas");
    expect(usoPorPuerta(0.1)).toBe("1 cada 10 puertas");
    expect(usoPorPuerta(0.4)).toBeNull();
    expect(usoPorPuerta(2)).toBeNull();
    expect(leerCantidad("1/70")).toBeCloseTo(1 / 70, 10);
    expect(leerCantidad("0,4")).toBe(0.4);
    expect(leerCantidad("abc")).toBeNaN();
  });
});
