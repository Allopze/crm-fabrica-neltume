import { afterEach, describe, expect, it, vi } from "vitest";
import { redactar, registro } from "./registro";

afterEach(() => vi.restoreAllMocks());

describe("logger con redacción (SECURITY T5, §4)", () => {
  it("redacta cabeceras sensibles sin importar mayúsculas", () => {
    expect(redactar({ Authorization: "Bearer abc", cookie: "neltume_sesion=x", "X-Api-Key": "k", ruta: "/api" })).toEqual({
      Authorization: "[REDACTADO]", cookie: "[REDACTADO]", "X-Api-Key": "[REDACTADO]", ruta: "/api",
    });
  });

  it("redacta RUT, correos, teléfonos y bearer dentro de textos", () => {
    const t = redactar("Javiera 12.345.678-9, javiera@correo.cl, +56 9 8765 4321, Bearer eyJhbGc.x") as string;
    expect(t).not.toMatch(/12\.345|correo\.cl|8765|eyJ/);
  });

  it("redacta campos de datos personales y credenciales anidados", () => {
    expect(redactar({ cliente: { rut: "1-9", nombre: "Ana", telefono: "1" }, usuario: { password: "p" } })).toEqual({
      cliente: { rut: "[REDACTADO]", nombre: "Ana", telefono: "[REDACTADO]" }, usuario: { password: "[REDACTADO]" },
    });
  });

  it("escribe una línea JSON con nivel y mensaje", () => {
    const espia = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    registro.error("falló", { correlacion_id: "c1", error: new Error("con correo a@b.cl") });
    const linea = JSON.parse(String(espia.mock.calls[0][0]));
    expect(linea).toMatchObject({ nivel: "error", mensaje: "falló", correlacion_id: "c1", error: { mensaje: "con correo [REDACTADO]" } });
  });
});
