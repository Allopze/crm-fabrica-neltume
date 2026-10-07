import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { conPermiso } from "@/domain/auth/politica";
import { crearUsuario } from "@/domain/usuarios";

let token: string;
let csrf: string;
let ejecuciones = 0;
// Ruta de prueba: cuenta cuántas veces se ejecuta realmente.
const ruta = conPermiso("stock.mover", async ({ req }) => {
  ejecuciones++;
  const cuerpo = await req.json();
  return NextResponse.json({ recibido: cuerpo, n: ejecuciones }, { status: 201 });
}, { idempotente: true });

beforeAll(async () => {
  await bd().transaction((tx) => crearUsuario(tx, { email: "idem@neltume.cl", nombre: "I", clave: "clave-larga-idem" }, { tipo: "sistema" }, "consola"));
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "idem@neltume.cl", clave: "clave-larga-idem" }, ip: "10.3.0.1" });
  token = tokenDeCookie(r.res)!;
  csrf = r.cuerpo.csrf;
});
afterAll(() => cerrarBd());

describe("Idempotency-Key (API §1, DESIGN §5)", () => {
  it("sin clave → 400 IDEMPOTENCIA_REQUERIDA y no ejecuta", async () => {
    const r = await llamar(ruta as never, "POST", "/x", { token, csrf, cuerpo: { cantidad: 1 } });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("IDEMPOTENCIA_REQUERIDA");
    expect(ejecuciones).toBe(0);
  });

  it("repetir con la misma clave y cuerpo devuelve la respuesta original sin re-ejecutar", async () => {
    const clave = randomUUID();
    const p = { token, csrf, cuerpo: { cantidad: 2 }, cabeceras: { "idempotency-key": clave } };
    const a = await llamar(ruta as never, "POST", "/x", p);
    const b = await llamar(ruta as never, "POST", "/x", p);
    expect(a.estado).toBe(201);
    expect(b.estado).toBe(201);
    expect(b.cuerpo).toEqual(a.cuerpo);
    expect(b.res.headers.get("idempotent-replay")).toBe("true");
    expect(ejecuciones).toBe(1);
  });

  it("misma clave con otro cuerpo → 422 IDEMPOTENCIA_CONFLICTO", async () => {
    const clave = randomUUID();
    await llamar(ruta as never, "POST", "/x", { token, csrf, cuerpo: { cantidad: 3 }, cabeceras: { "idempotency-key": clave } });
    const r = await llamar(ruta as never, "POST", "/x", { token, csrf, cuerpo: { cantidad: 4 }, cabeceras: { "idempotency-key": clave } });
    expect(r.estado).toBe(422);
    expect(r.cuerpo.error.codigo).toBe("IDEMPOTENCIA_CONFLICTO");
  });

  // Auditoría H-06: con la misma clave, 6 envíos simultáneos creaban 6 cotizaciones u órdenes.
  it("misma clave en envíos simultáneos: se ejecuta una sola vez y el resto es 409 en curso o replay, nunca 500", async () => {
    let lentas = 0;
    const lenta = conPermiso("stock.mover", async () => {
      lentas++;
      await new Promise((ok) => setTimeout(ok, 300));
      return NextResponse.json({ n: lentas }, { status: 201 });
    }, { idempotente: true });
    const p = { token, csrf, cuerpo: { cantidad: 6 }, cabeceras: { "idempotency-key": randomUUID() } };
    const r = await Promise.all(Array.from({ length: 6 }, () => llamar(lenta as never, "POST", "/lenta", p)));
    expect(lentas).toBe(1);
    expect(r.filter((x) => x.estado === 201)).toHaveLength(1);
    for (const x of r.filter((y) => y.estado !== 201)) expect(x.cuerpo.error.codigo).toBe("IDEMPOTENCIA_EN_CURSO");
    const despues = await llamar(lenta as never, "POST", "/lenta", p);
    expect(despues.estado).toBe(201);
    expect(despues.res.headers.get("idempotent-replay")).toBe("true");
    expect(lentas).toBe(1);
  });

  it("la misma clave y cuerpo en otra ruta → 422 (la clave no se comparte entre acciones)", async () => {
    const clave = randomUUID();
    const p = { token, csrf, cuerpo: { cantidad: 7 }, cabeceras: { "idempotency-key": clave } };
    expect((await llamar(ruta as never, "POST", "/una", p)).estado).toBe(201);
    const otra = await llamar(ruta as never, "POST", "/otra", p);
    expect(otra.estado).toBe(422);
    expect(otra.cuerpo.error.codigo).toBe("IDEMPOTENCIA_CONFLICTO");
  });

  it("si la acción falla, la clave se libera y el reintento con la misma clave se ejecuta", async () => {
    let intentos = 0;
    const fragil = conPermiso("stock.mover", async () => {
      intentos++;
      if (intentos === 1) throw new Error("caída a mitad de la acción");
      return NextResponse.json({ intento: intentos }, { status: 201 });
    }, { idempotente: true });
    const p = { token, csrf, cuerpo: { cantidad: 8 }, cabeceras: { "idempotency-key": randomUUID() } };
    expect((await llamar(fragil as never, "POST", "/fragil", p)).estado).toBe(500);
    const r = await llamar(fragil as never, "POST", "/fragil", p);
    expect(r.estado).toBe(201);
    expect(r.cuerpo).toEqual({ intento: 2 });
  });
});
