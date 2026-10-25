import { describe, expect, it, vi } from "vitest";
import { configEnlace, enviarPrueba, type PruebaPendiente } from "./envio";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const EVENTO = "6f1c2a7e-3b9d-4c51-9a0e-2d7b8f41c6aa";

describe("enlace.config (ADR-0024 §6)", () => {
  it("sin ENLACE_TIENDA_URL las pruebas quedan «sin configurar»", () => {
    expect(configEnlace(env({}))).toEqual({ url: null, motivoSinUrl: "Falta configurar ENLACE_TIENDA_URL en el servicio de enlace.", timeoutMs: 15_000 });
    expect(configEnlace(env({ ENLACE_TIENDA_URL: "   " })).url).toBeNull();
  });

  it("acepta solo el origen de la tienda: https, o http únicamente en localhost, 127.0.0.1 y [::1]", () => {
    for (const [entrada, origen] of [
      ["https://cotizador.puertasneltume.cl", "https://cotizador.puertasneltume.cl"],
      ["https://cotizador.puertasneltume.cl/", "https://cotizador.puertasneltume.cl"],
      ["  https://tienda.example.cl:8443  ", "https://tienda.example.cl:8443"],
      ["http://127.0.0.1:3001", "http://127.0.0.1:3001"],
      ["http://localhost:3001", "http://localhost:3001"],
      ["http://[::1]:3001", "http://[::1]:3001"],
    ] as const) expect(configEnlace(env({ ENLACE_TIENDA_URL: entrada })), entrada).toMatchObject({ url: origen, motivoSinUrl: null });
    for (const mala of [
      "http://tienda.example.cl", // http fuera de localhost
      "ftp://tienda.example.cl", "cotizador.puertasneltume.cl", "no es una url",
      "https://usuario:clave@tienda.example.cl", "https://tienda.example.cl/api", "https://tienda.example.cl/?x=1", "https://tienda.example.cl/#a",
    ]) expect(configEnlace(env({ ENLACE_TIENDA_URL: mala })), mala).toMatchObject({ url: null });
    expect(configEnlace(env({ ENLACE_TIENDA_URL: "http://tienda.example.cl" })).motivoSinUrl).toMatch(/https/);
    expect(configEnlace(env({ ENLACE_TIENDA_URL: "https://x.cl/api" })).motivoSinUrl).toMatch(/solo el origen/);
  });

  it("el plazo se acota entre 1.000 y 60.000 ms y por omisión es de 15.000", () => {
    const plazo = (v?: string) => configEnlace(env({ ENLACE_TIENDA_URL: "https://x.cl", ...(v === undefined ? {} : { ENLACE_TIENDA_TIMEOUT_MS: v }) })).timeoutMs;
    expect([plazo(), plazo(""), plazo("abc"), plazo("-5"), plazo("0")]).toEqual([15_000, 15_000, 15_000, 15_000, 15_000]);
    expect([plazo("10"), plazo("2500"), plazo("999999")]).toEqual([1_000, 2_500, 60_000]);
  });
});

describe("enlace.envio (ADR-0024 §3, contrato §5)", () => {
  const cfg = configEnlace(env({ ENLACE_TIENDA_URL: "https://tienda.test", ENLACE_TIENDA_TIMEOUT_MS: "5000" }));
  const firmadas = { "x-neltume-timestamp": "1793102400", "x-neltume-signature": "v1=abc123", "x-idempotency-key": `neltume-factory:connection-test:${EVENTO}` };
  const prueba = (cabeceras: unknown = firmadas): PruebaPendiente => ({ id: "fila-1", eventId: EVENTO, solicitud: Buffer.from('{"firmado":"tal cual"}'), cabeceras });
  const confirmacion = () => new Response(JSON.stringify({ status: "accepted", eventId: EVENTO, receiver: "neltume-store", receivedAt: new Date().toISOString() }), { status: 201 });

  it("reenvía los mismos bytes a la ruta fija, sin seguir redirecciones y con plazo", async () => {
    const fetchFalso = vi.fn(async () => confirmacion());
    const r = await enviarPrueba(cfg, prueba(), { fetch: fetchFalso as unknown as typeof fetch });
    expect(r).toMatchObject({ estado: "aceptada", destino: "tienda.test" });
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://tienda.test/api/integrations/neltume/connection-tests");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Buffer.from(init.body as Uint8Array).toString("utf8")).toBe('{"firmado":"tal cual"}');
  });

  it("solo manda las cabeceras del contrato: la fila de la BD no puede agregar otras ni cambiar el destino", async () => {
    const fetchFalso = vi.fn(async () => confirmacion());
    await enviarPrueba(cfg, prueba({ ...firmadas, host: "malo.example", authorization: "Bearer x", "x-otra": "1", url: "https://malo.example" }), { fetch: fetchFalso as unknown as typeof fetch });
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith("https://tienda.test/")).toBe(true);
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual(
      ["accept", "content-type", "user-agent", "x-idempotency-key", "x-neltume-signature", "x-neltume-timestamp"]);
    expect(init.headers).toMatchObject({ "content-type": "application/json", ...firmadas });
  });

  it("con cabeceras mal formadas en la fila no llama a la tienda", async () => {
    const fetchFalso = vi.fn();
    const r = await enviarPrueba(cfg, prueba({ "x-neltume-timestamp": 123 }), { fetch: fetchFalso as unknown as typeof fetch });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(r).toMatchObject({ estado: "sin_respuesta", codigoError: "network", destino: "tienda.test" });
  });

  it("sin URL ni intenta la llamada", async () => {
    const fetchFalso = vi.fn();
    const r = await enviarPrueba(configEnlace(env({})), prueba(), { fetch: fetchFalso as unknown as typeof fetch });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(r).toMatchObject({ estado: "no_configurada", destino: null });
  });

  it("un fallo de red se explica y no se reintenta", async () => {
    const fetchFalso = vi.fn(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: new Error("unexpected redirect") }); });
    const r = await enviarPrueba(cfg, prueba(), { fetch: fetchFalso as unknown as typeof fetch });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ estado: "sin_respuesta", codigoError: "redirect", destino: "tienda.test" });
  });

  it("mide la latencia con su reloj y lee la respuesta con tope", async () => {
    let t = 1_000;
    const ahora = () => (t += 120);
    const r = await enviarPrueba(cfg, prueba(), { fetch: (async () => confirmacion()) as unknown as typeof fetch, ahora });
    expect(r).toMatchObject({ estado: "aceptada", latenciaMs: 120 });
    // Una respuesta enorme se corta a los 64 KB: ya no es JSON y no cuenta como la confirmación.
    const grande = new Response(`${"x".repeat(70_000)}`, { status: 201 });
    expect(await enviarPrueba(cfg, prueba(), { fetch: (async () => grande) as unknown as typeof fetch })).toMatchObject({ estado: "rechazada", codigoError: "otra_aplicacion" });
  });
});
