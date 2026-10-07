import { describe, expect, it } from "vitest";
import { enmascararDatosPersonales } from "./datos-personales";

const enmascarar = (t: string) => enmascararDatosPersonales(t).texto;

// Corpus de la auditoría del 07-10-2026 (H-03): todos estos formatos llegaban sin enmascarar al proveedor.
const SENSIBLES: [string, string][] = [
  ["wsp +56987654321", "wsp [TELEFONO]"],
  ["tel 56987654321", "tel [TELEFONO]"],
  ["cel 9 87 65 43 21", "cel [TELEFONO]"],
  ["cel (9) 8765-4321", "cel [TELEFONO]"],
  ["fono +56 9 8765 4321", "fono [TELEFONO]"],
  ["cel 987654321", "cel [TELEFONO]"],
  ["fijo +56 2 2345 6789", "fijo [TELEFONO]"],
  ["fijo (2) 2345 6789", "fijo [TELEFONO]"],
  ["oficina 63 2 123456", "oficina [TELEFONO]"],
  ["RUT 12.345.678-9", "RUT [RUT]"],
  ["RUT 12.345.678‐9", "RUT [RUT]"],
  ["RUT 12.345.678–9", "RUT [RUT]"],
  ["RUT 12.345.678 — 9", "RUT [RUT]"],
  ["RUT 12 345 678-9", "RUT [RUT]"],
  ["rut 9.876.543-k", "rut [RUT]"],
  ["rut 12345678K", "rut [RUT]"],
  ["RUT 123456789", "RUT [NUMERO]"],
  ["RUT 12.345.678", "RUT [NUMERO]"],
  ["RUT １２３４５６７８-９", "RUT [RUT]"],
  ["correo josé.núñez@correo.cl", "correo [CORREO]"],
  ["correo JUAN@EMPRESA.CL", "correo [CORREO]"],
  ["mail juan [at] gmail.com", "mail [CORREO]"],
  ["mail juan arroba gmail punto com", "mail [CORREO]"],
  ["ver https://maps.app.goo.gl/abc", "ver [URL]"],
  ["web www.casa.cl", "web [URL]"],
];

// Lo que la IA necesita leer no se toca.
const PEDIDO = [
  "3 puertas Neltume raulí de 90x210 y 2 de 0,87x2,15",
  "2 marcos 2x4 de 2,10 m y 1 Toltén 87x215",
  "4 Lipinza 700x2000 mm, NEL-R-4-B, a $50.000 c/u, entrega el 15-10-2026",
  "1.500 mm de alto, 90 210, 12 unidades",
];

describe("enmascarado de datos personales (REQ-COT-2.9, REQ-NFR-5, auditoría H-03)", () => {
  it.each(SENSIBLES)("enmascara «%s»", (entrada, esperado) => {
    expect(enmascarar(entrada)).toBe(esperado);
  });

  it("enmascara varios datos en una sola línea", () => {
    expect(enmascarar("Javiera — +56 9 8765 4321, javiera@correo.cl, RUT 12.345.678-9 y wsp 56987654321"))
      .toBe("Javiera — [TELEFONO], [CORREO], RUT [RUT] y wsp [TELEFONO]");
  });

  it.each(PEDIDO)("no toca medidas, cantidades, códigos, montos ni fechas: «%s»", (texto) => {
    expect(enmascarar(texto)).toBe(texto);
  });

  it("con una marca fija (logs) usa siempre esa marca y cuenta los reemplazos", () => {
    expect(enmascararDatosPersonales("a@b.cl y 987654321", "[REDACTADO]")).toEqual({ texto: "[REDACTADO] y [REDACTADO]", reemplazos: 2 });
  });

  it("no altera UUID ni fechas ISO de los logs", () => {
    const t = "correlacion 550e8400-e29b-41d4-a716-446655440000 en 2026-10-07T14:59:19.295Z";
    expect(enmascarar(t)).toBe(t);
  });
});
