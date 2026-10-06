import { describe, expect, it, vi } from "vitest";
import { ErrorIA, type InterpreteIA } from "../interfaz";
import { interpretarConReintentos } from "../reintentos";
import { CommandCodeIA } from "./commandcode";

const cfg = { apiKey: "clave-de-prueba", baseUrl: "https://ejemplo.invalid", modelo: "modelo-x", timeoutMs: 50, precioEntradaMTok: 1, precioSalidaMTok: 5 };
const cat = { modelos: ["NELTUME"], maderas: ["RAULI"], anchos: [{ codigo: "4", etiqueta: "0,90 a 0,95" }], altosM: [2.1], accesorios: [] };
const propuesta = { items: [{ texto_fuente: "3 Neltume", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [] }], alertas: [], sin_items: false };
const respuesta = (args: unknown, status = 200) => new Response(JSON.stringify({
  model: "modelo-x", usage: { prompt_tokens: 4000, completion_tokens: 400 },
  choices: [{ message: { tool_calls: [{ function: { name: "proponer_items", arguments: JSON.stringify(args) } }] } }],
}), { status });

describe("proveedor Command Code (ADR-0001)", () => {
  it("fuerza la herramienta, envía x-cmd-zdr y el texto delimitado, y calcula el costo", async () => {
    const fetchFn = vi.fn(async () => respuesta(propuesta));
    const r = await new CommandCodeIA(cfg, fetchFn as unknown as typeof fetch).interpretar("3 Neltume", cat);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const cuerpo = JSON.parse(String(init.body));
    expect(url).toBe("https://ejemplo.invalid/provider/v1/chat/completions");
    expect(init.headers).toMatchObject({ "x-cmd-zdr": "1", authorization: "Bearer clave-de-prueba" });
    expect(cuerpo.tool_choice).toEqual({ type: "function", function: { name: "proponer_items" } });
    expect(cuerpo.messages[1].content).toBe("<pedido>\n3 Neltume\n</pedido>");
    expect(cuerpo.messages[0].content).not.toMatch(/\$|precio de lista/);
    expect(r.costoUsd).toBeCloseTo(0.006, 6); // 4000 × 1 + 400 × 5 por millón
  });

  it("rechaza salidas con campos de precio (inválida) y respuestas sin la herramienta", async () => {
    const ia = (r: Response) => new CommandCodeIA(cfg, (async () => r) as unknown as typeof fetch);
    await expect(ia(respuesta({ ...propuesta, descuento: 0.9 })).interpretar("x", cat)).rejects.toMatchObject({ tipo: "invalida" });
    await expect(ia(new Response(JSON.stringify({ choices: [{ message: { content: "hola" } }] }))).interpretar("x", cat)).rejects.toMatchObject({ tipo: "invalida" });
  });

  it("clasifica errores: 5xx/429 transitorio, 401 permanente, ZDR y timeout", async () => {
    const con = (f: () => Promise<Response>) => new CommandCodeIA(cfg, f as unknown as typeof fetch).interpretar("x", cat);
    await expect(con(async () => new Response("boom", { status: 503 }))).rejects.toMatchObject({ tipo: "transitorio" });
    await expect(con(async () => new Response("rate", { status: 429 }))).rejects.toMatchObject({ tipo: "transitorio" });
    await expect(con(async () => new Response("no", { status: 401 }))).rejects.toMatchObject({ tipo: "permanente" });
    await expect(con(async () => new Response("no ZDR provider available", { status: 503 }))).rejects.toMatchObject({ tipo: "sin_zdr" });
    await expect(con(() => new Promise((_, rechazar) => setTimeout(() => rechazar(Object.assign(new Error("t"), { name: "TimeoutError" })), 5)))).rejects.toMatchObject({ tipo: "timeout" });
  });
});

describe("reintentos acotados (AI.md §5)", () => {
  const ia = (errores: ErrorIA[]): InterpreteIA & { llamadas: number } => ({
    nombre: "falso", llamadas: 0,
    async interpretar() {
      const e = errores[this.llamadas++];
      if (e) throw e;
      return { propuesta: { items: [], alertas: [], sin_items: true }, proveedor: "falso", latenciaMs: 0 };
    },
  });

  it("reintenta transitorios hasta 2 veces y luego falla", async () => {
    const f = ia([new ErrorIA("transitorio", "a"), new ErrorIA("timeout", "b"), new ErrorIA("transitorio", "c")]);
    await expect(interpretarConReintentos(f, "x", cat, { esperasMs: [1, 1] })).rejects.toMatchObject({ tipo: "transitorio" });
    expect(f.llamadas).toBe(3);
  });

  it("no reintenta errores permanentes ni sin ZDR; la salida inválida se reintenta una vez", async () => {
    const p = ia([new ErrorIA("permanente", "a")]);
    await expect(interpretarConReintentos(p, "x", cat, { esperasMs: [1] })).rejects.toBeDefined();
    expect(p.llamadas).toBe(1);
    const inv = ia([new ErrorIA("invalida", "a"), new ErrorIA("invalida", "b")]);
    await expect(interpretarConReintentos(inv, "x", cat, { esperasMs: [1] })).rejects.toMatchObject({ tipo: "invalida" });
    expect(inv.llamadas).toBe(2);
    const ok = ia([new ErrorIA("transitorio", "a")]);
    await expect(interpretarConReintentos(ok, "x", cat, { esperasMs: [1] })).resolves.toMatchObject({ proveedor: "falso" });
  });
});
