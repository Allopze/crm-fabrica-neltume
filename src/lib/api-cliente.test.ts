import { afterEach, describe, expect, it, vi } from "vitest";
import { enviarIdempotente, ErrorApi, huellaFormulario, SIN_CONFIRMAR } from "./api-cliente";

afterEach(() => vi.useRealTimers());

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

/** Corre `enviarIdempotente` avanzando el reloj falso para no esperar los reintentos reales. */
async function correr(huella: string, respuestas: (Response | Error)[]) {
  vi.useFakeTimers();
  const claves: string[] = [];
  const p = enviarIdempotente(huella, async (clave) => {
    claves.push(clave);
    const r = respuestas.shift()!;
    if (r instanceof Error) throw r;
    return r;
  });
  const resultado = p.then((r) => r, (e) => e);
  await vi.runAllTimersAsync();
  return { resultado: await resultado, claves };
}

describe("envío idempotente del navegador (DESIGN §5, auditoría H-06)", () => {
  it("ante un corte de red reintenta con la misma Idempotency-Key", async () => {
    const { resultado, claves } = await correr("POST /a 1", [new TypeError("red"), json(201, { ok: true })]);
    expect((resultado as Response).status).toBe(201);
    expect(claves).toHaveLength(2);
    expect(new Set(claves).size).toBe(1);
  });

  it("mientras el primer envío sigue en curso (409) espera y reintenta con la misma clave", async () => {
    const enCurso = json(409, { error: { codigo: "IDEMPOTENCIA_EN_CURSO" } });
    const { resultado, claves } = await correr("POST /b 1", [enCurso, json(201, {})]);
    expect((resultado as Response).status).toBe(201);
    expect(new Set(claves).size).toBe(1);
  });

  it("si nunca llega respuesta avisa que no se pudo confirmar, y repetir el mismo envío reutiliza la clave", async () => {
    const red = () => new TypeError("red");
    const primero = await correr("POST /c 1", [red(), red(), red(), red()]);
    expect(primero.resultado).toBeInstanceOf(ErrorApi);
    expect((primero.resultado as ErrorApi).message).toBe(SIN_CONFIRMAR);
    const segundo = await correr("POST /c 1", [json(201, {})]);
    expect(segundo.claves[0]).toBe(primero.claves[0]);
    // Tras una respuesta definitiva, el mismo contenido es un envío nuevo.
    const tercero = await correr("POST /c 1", [json(201, {})]);
    expect(tercero.claves[0]).not.toBe(primero.claves[0]);
  });

  it("un 409 de negocio no se reintenta", async () => {
    const { resultado, claves } = await correr("POST /d 1", [json(409, { error: { codigo: "STOCK_INSUFICIENTE" } })]);
    expect((resultado as Response).status).toBe(409);
    expect(claves).toHaveLength(1);
  });

  it("la huella de un formulario depende de sus campos y archivos", () => {
    const f = new FormData();
    f.set("clienteId", "c1");
    f.set("archivo", new File(["x"], "nota.pdf", { lastModified: 1 }));
    const g = new FormData();
    g.set("archivo", new File(["x"], "nota.pdf", { lastModified: 1 }));
    g.set("clienteId", "c1");
    expect(huellaFormulario(f)).toBe(huellaFormulario(g));
    g.set("clienteId", "c2");
    expect(huellaFormulario(f)).not.toBe(huellaFormulario(g));
  });
});
