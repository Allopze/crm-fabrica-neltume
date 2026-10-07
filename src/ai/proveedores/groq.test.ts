import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqIA } from "./groq";
import { interpretarConReintentos } from "../reintentos";

const cfg = { apiKey: "clave-de-prueba", modelo: "openai/gpt-oss-120b", timeoutMs: 500, maxTokensSalida: 2_000 };
const cat = { modelos: ["NELTUME"], maderas: ["RAULI"], anchos: [{ codigo: "4", etiqueta: "0,90 a 0,95" }], altosM: [2.1], accesorios: [] };
const propuesta = { items: [{ texto_fuente: "3 Neltume", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [] }], alertas: [], sin_items: false };
const response = (args: unknown) => new Response(JSON.stringify({ model: cfg.modelo, usage: { prompt_tokens: 50, completion_tokens: 20 }, choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { name: "proponer_items", arguments: JSON.stringify(args) } }] } }] }));

afterEach(() => vi.useRealTimers());

describe("proveedor Groq (REQ-ADM-4.2, REQ-COT-2.8)", () => {
  it("fuerza la herramienta existente y valida su salida estricta", async () => {
    const fn = vi.fn(async () => response(propuesta));
    const r = await new GroqIA(cfg, fn as unknown as typeof fetch).interpretar("3 Neltume", cat);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers).toMatchObject({ authorization: "Bearer clave-de-prueba" });
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "proponer_items" } });
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.reasoning_effort).toBe("low");
    expect(r.proveedor).toBe("groq");
    expect(r.propuesta).toEqual(propuesta);
    expect(r.costoUsd).toBeUndefined();
  });

  it("desactiva razonamiento en Qwen y omite esfuerzo donde no hay control verificado", async () => {
    const fn = vi.fn(async () => response(propuesta));
    await new GroqIA({ ...cfg, modelo: "qwen/qwen3.8-27b" }, fn as unknown as typeof fetch).interpretar("3 Neltume", cat);
    expect(JSON.parse(String((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body)).reasoning_effort).toBe("none");
    await new GroqIA({ ...cfg, modelo: "llama-3.3-70b-versatile" }, fn as unknown as typeof fetch).interpretar("3 Neltume", cat);
    expect(JSON.parse(String((fn.mock.calls[1] as unknown as [string, RequestInit])[1].body))).not.toHaveProperty("reasoning_effort");
    await new GroqIA({ ...cfg, modelo: "minimaxai/minimax-m2.7" }, fn as unknown as typeof fetch).interpretar("3 Neltume", cat);
    expect(JSON.parse(String((fn.mock.calls[2] as unknown as [string, RequestInit])[1].body))).not.toHaveProperty("reasoning_effort");
  });

  it("rechaza tool ausente, JSON inválido, campos de precio y respuesta truncada", async () => {
    const con = (r: Response) => new GroqIA(cfg, (async () => r) as unknown as typeof fetch).interpretar("x", cat);
    await expect(con(new Response(JSON.stringify({ choices: [{ message: { content: "texto" } }] })))).rejects.toMatchObject({ tipo: "invalida" });
    await expect(con(new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "proponer_items", arguments: "{" } }] } }] })))).rejects.toMatchObject({ tipo: "invalida" });
    await expect(con(response({ ...propuesta, precio_unitario: 1 }))).rejects.toMatchObject({ tipo: "invalida" });
    await expect(con(new Response(JSON.stringify({ choices: [{ finish_reason: "length" }] })))).rejects.toMatchObject({ tipo: "invalida" });
  });

  it("clasifica fallas HTTP, lee Retry-After y espera antes del reintento acotado", async () => {
    const fn = vi.fn().mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "retry-after": "2" } })).mockResolvedValueOnce(response(propuesta));
    const ia = new GroqIA(cfg, fn as unknown as typeof fetch);
    vi.useFakeTimers();
    const promesa = interpretarConReintentos(ia, "x", cat, { maxReintentos: 1, esperasMs: [10] });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promesa).resolves.toMatchObject({ proveedor: "groq" });
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(new GroqIA(cfg, (async () => new Response("no", { status: 401 })) as unknown as typeof fetch).interpretar("x", cat)).rejects.toMatchObject({ tipo: "permanente" });
  });
});
