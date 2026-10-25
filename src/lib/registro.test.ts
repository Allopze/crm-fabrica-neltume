import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_MENSAJE_ERROR, redactar, registro } from "./registro";

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

  it("recorta el mensaje de un error largo: no deja en el log los parámetros de una consulta (un PDF, una firma)", () => {
    const pdf = `%PDF-1.4 ${"x".repeat(50_000)}`;
    const error = new Error(`Failed query: insert into "prueba_conexion" (...) values ($1, $2)\nparams: enviada,${pdf},x-neltume-signature=v1=abc123`);
    const salida = redactar({ error }) as { error: { mensaje: string } };
    expect(salida.error.mensaje.length).toBeLessThan(MAX_MENSAJE_ERROR + 100);
    expect(salida.error.mensaje).toContain("Failed query: insert into");
    expect(salida.error.mensaje).toMatch(/\[recortado: \d+ caracteres\]$/);
    expect(salida.error.mensaje).not.toContain("v1=abc123");
    // Un error corto pasa entero.
    expect((redactar(new Error("corto")) as { mensaje: string }).mensaje).toBe("corto");
  });

  it("escribe una línea JSON con nivel y mensaje", () => {
    const espia = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    registro.error("falló", { correlacion_id: "c1", error: new Error("con correo a@b.cl") });
    const linea = JSON.parse(String(espia.mock.calls[0][0]));
    expect(linea).toMatchObject({ nivel: "error", mensaje: "falló", correlacion_id: "c1", error: { mensaje: "con correo [REDACTADO]" } });
  });
});
