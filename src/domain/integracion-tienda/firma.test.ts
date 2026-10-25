import { describe, expect, it } from "vitest";
import { codigoFabrica, configEnvio, configIntegracion, firmaHmac, firmar, verificarFirma } from "./firma";

const cuerpo = new TextEncoder().encode('{"a":1}');

describe("integracion.firma (ADR-0023 §2)", () => {
  it("coincide con el vector compartido con la tienda", () => {
    // tienda_puertas/Cotizador, docs/integracion-fabrica.md §3
    expect(firmaHmac("clave-de-ejemplo-de-32-caracteres!!", "1700000000", cuerpo)).toBe("b0803f898b2ee4c6ca49b967fce6ecac5066ef75f4c37f9785b92a47269b7552");
    // docs/contratos/pedidos-tienda-v1.md (propuesta inicial de la fábrica)
    expect(firmaHmac("prueba-neltume-clave-no-usar-en-produccion-000000", "1793102400", cuerpo)).toBe("9faf82e2fb869a0a971e6b4173e5fd447d20f39e322afe721569cfb377d82f41");
  });

  it("acepta la firma vigente dentro de ±300 s y rechaza lo demás con su motivo", () => {
    const secreto = "x".repeat(40);
    const ahora = 1_793_102_400_000;
    const c = firmar(secreto, cuerpo, ahora);
    const cab = { timestamp: c["x-neltume-timestamp"], firma: c["x-neltume-signature"] };
    expect(verificarFirma([secreto], cab, cuerpo, ahora + 300_000)).toEqual({ ok: true });
    expect(verificarFirma([secreto], cab, cuerpo, ahora + 301_000)).toEqual({ ok: false, motivo: "fuera_de_plazo" });
    expect(verificarFirma([secreto], cab, cuerpo, ahora - 301_000)).toEqual({ ok: false, motivo: "fuera_de_plazo" });
    expect(verificarFirma(["y".repeat(40)], cab, cuerpo, ahora)).toEqual({ ok: false, motivo: "firma_invalida" });
    expect(verificarFirma([secreto], cab, new TextEncoder().encode('{"a":2}'), ahora)).toEqual({ ok: false, motivo: "firma_invalida" });
    expect(verificarFirma([secreto], { ...cab, firma: null }, cuerpo, ahora)).toEqual({ ok: false, motivo: "sin_firma" });
    expect(verificarFirma([secreto], { ...cab, timestamp: "1e9" }, cuerpo, ahora)).toEqual({ ok: false, motivo: "timestamp_invalido" });
    expect(verificarFirma([secreto], { ...cab, firma: cab.firma.replace("v1=", "v2=") }, cuerpo, ahora)).toEqual({ ok: false, motivo: "firma_invalida" });
  });

  it("rota el secreto: varias firmas en la cabecera y el secreto anterior siguen valiendo", () => {
    const nuevo = "n".repeat(40);
    const anterior = "a".repeat(40);
    const ahora = Date.now();
    const deAnterior = firmar(anterior, cuerpo, ahora);
    expect(verificarFirma([nuevo, anterior], { timestamp: deAnterior["x-neltume-timestamp"], firma: deAnterior["x-neltume-signature"] }, cuerpo, ahora).ok).toBe(true);
    const dos = `${firmar("z".repeat(40), cuerpo, ahora)["x-neltume-signature"]}, ${firmar(nuevo, cuerpo, ahora)["x-neltume-signature"]}`;
    expect(verificarFirma([nuevo], { timestamp: deAnterior["x-neltume-timestamp"], firma: dos }, cuerpo, ahora).ok).toBe(true);
  });

  it("sin un secreto de al menos 32 caracteres la integración está apagada", () => {
    const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
    expect(configIntegracion(env({}))).toBeNull();
    expect(configIntegracion(env({ INTEGRACION_TIENDA_SECRETO: "corto" }))).toBeNull();
    expect(configIntegracion(env({ INTEGRACION_TIENDA_SECRETO: "s".repeat(32), INTEGRACION_TIENDA_CLIENTE_RUT: "76.059.066-5" })))
      .toEqual({ secretos: ["s".repeat(32)], fabrica: "PANGUIPULLI", clienteRut: "76.059.066-5" });
  });

  it("el envío firma solo con el secreto vigente (nunca con el anterior) y con el código de la fábrica (ADR-0024)", () => {
    const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
    expect(configEnvio(env({}))).toBeNull();
    expect(configEnvio(env({ INTEGRACION_TIENDA_SECRETO: "corto" }))).toBeNull();
    // El anterior solo sirve para verificar lo que llega: con el vigente corto no se firma, aunque haya uno anterior válido.
    expect(configEnvio(env({ INTEGRACION_TIENDA_SECRETO: "corto", INTEGRACION_TIENDA_SECRETO_ANTERIOR: "a".repeat(40) }))).toBeNull();
    expect(configEnvio(env({ INTEGRACION_TIENDA_SECRETO: `  ${"s".repeat(40)}  `, INTEGRACION_TIENDA_SECRETO_ANTERIOR: "a".repeat(40) })))
      .toEqual({ secreto: "s".repeat(40), fabrica: "PANGUIPULLI" });
    expect(configEnvio(env({ INTEGRACION_TIENDA_SECRETO: "s".repeat(32), INTEGRACION_TIENDA_FABRICA: " panguipulli " }))?.fabrica).toBe("PANGUIPULLI");
    expect(codigoFabrica(env({}))).toBe("PANGUIPULLI");
    expect(codigoFabrica(env({ INTEGRACION_TIENDA_FABRICA: "santiago" }))).toBe("SANTIAGO");
  });
});
