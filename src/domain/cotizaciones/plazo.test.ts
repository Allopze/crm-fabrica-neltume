import { describe, expect, it } from "vitest";
import { identificadores } from "./pistas";
import { leerPlazo } from "./plazo";

const HOY = "2026-10-20"; // martes

describe("plazo pedido en el texto (REQ-COT-2.20)", () => {
  it.each([
    ["Las necesito para el 30 de octubre", "30 de octubre", "2026-10-30"],
    ["antes del 5/11 por favor", "5/11", "2026-11-05"],
    ["entrega 15-01", "15-01", "2027-01-15"],
    ["plazo: 03/12/2026", "03/12/2026", "2026-12-03"],
    ["las retiro el 7 de enero del 2027", "7 de enero del 2027", "2027-01-07"],
    ["para el viernes", "para el viernes", "2026-10-23"],
    ["para el Miércoles", "para el Miércoles", "2026-10-21"],
    ["para el martes", "para el martes", "2026-10-27"],
    ["las ocupo para fin de mes", "para fin de mes", "2026-10-31"],
    ["en 2 semanas", "en 2 semanas", "2026-11-03"],
    ["Es URGENTE", "URGENTE", null],
    ["lo más pronto posible", "lo más pronto posible", null],
  ])("«%s» → «%s» (%s)", (texto, frase, fecha) => {
    expect(leerPlazo(texto, HOY)).toEqual({ frase, fecha });
  });

  it("la primera mención gana", () => {
    expect(leerPlazo("urgente, idealmente para el 30 de octubre", HOY)).toEqual({ frase: "urgente", fecha: null });
  });

  it.each([
    "3 puertas Neltume raulí 90/210",
    "2 puertas de 0,9-2,1",
    "1-2 puertas lenga",
    "marco 2x5 de 2,10",
    "llegan el 30 de febrero",
    "RUT 12.345.678-5, fono 9 8765 4321",
  ])("«%s» no es un plazo", (texto) => {
    expect(leerPlazo(texto, HOY)).toBeNull();
  });
});

describe("identificadores del cliente en el texto (REQ-COT-2.18)", () => {
  it("toma RUT válidos, correos y teléfonos normalizados, sin repetir", () => {
    expect(identificadores("Soy de Alerces, RUT 12.345.678-5 (o 12345678-5). Correo Compras@Alerces.cl, fono +56 9 8765 4321 o (9) 8765-4321"))
      .toEqual({ ruts: ["12345678-5"], correos: ["compras@alerces.cl"], telefonos: ["987654321"] });
  });

  it("ignora un RUT con dígito verificador inválido y las medidas", () => {
    expect(identificadores("RUT 12.345.678-9, 3 puertas 90x210")).toEqual({ ruts: [], correos: [], telefonos: [] });
  });
});
