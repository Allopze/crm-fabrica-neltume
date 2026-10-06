import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaImp from "@/app/api/v1/importaciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { COOKIE_SESION } from "@/domain/auth/politica";
import { crearUsuario } from "@/domain/usuarios";

const owner = poolOwner();
const MINI = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
type Sesion = { token: string; csrf: string };
let admin: Sesion;
let soloCatalogo: Sesion;

async function entrar(email: string, ip: string): Promise<Sesion> {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-importa-api" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

function subir(s: Sesion, contenido: Buffer, nombre: string, clave = randomUUID()) {
  const form = new FormData();
  form.set("archivo", new File([new Uint8Array(contenido)], nombre));
  const req = new NextRequest("http://localhost/api/v1/importaciones", {
    method: "POST", body: form,
    headers: { cookie: `${COOKIE_SESION}=${s.token}`, "x-csrf-token": s.csrf, "idempotency-key": clave, "x-forwarded-for": "10.6.0.1" },
  });
  return rutaImp.POST(req, { params: Promise.resolve({} as never) }).then(async (res) => ({ estado: res.status, cuerpo: await res.json() }));
}

beforeAll(async () => {
  await owner.query("INSERT INTO rol (nombre) VALUES ('solo-catalogo') ON CONFLICT DO NOTHING");
  await owner.query("INSERT INTO rol_permiso (rol_id, permiso_codigo) SELECT id, 'catalogo.editar' FROM rol WHERE nombre = 'solo-catalogo' ON CONFLICT DO NOTHING");
  await bd().transaction(async (tx) => {
    await crearUsuario(tx, { email: "imp-admin@neltume.cl", nombre: "A", clave: "clave-importa-api" }, { tipo: "sistema" }, "consola");
    await crearUsuario(tx, { email: "imp-cat@neltume.cl", nombre: "C", clave: "clave-importa-api", rolNombre: "solo-catalogo" }, { tipo: "sistema" }, "consola");
  });
  admin = await entrar("imp-admin@neltume.cl", "10.6.0.2");
  soloCatalogo = await entrar("imp-cat@neltume.cl", "10.6.0.3");
});
afterAll(async () => { await owner.end(); await cerrarBd(); });

describe("POST /api/v1/importaciones (REQ-STK-1.1, 1.5)", () => {
  it("exige catalogo.editar y precios.editar", async () => {
    const r = await subir(soloCatalogo, MINI, "cotizador-mini.xlsx");
    expect(r.estado).toBe(403);
  });

  it("rechaza archivos que no son .xlsx", async () => {
    const r = await subir(admin, Buffer.from("hola"), "precios.csv");
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.mensaje).toContain(".xlsx");
  });

  it("un reintento con la misma Idempotency-Key no re-importa (aunque cambie el boundary)", async () => {
    const clave = randomUUID();
    const a = await subir(admin, MINI, "cotizador-mini.xlsx", clave);
    const b = await subir(admin, MINI, "cotizador-mini.xlsx", clave);
    expect([200, 201]).toContain(a.estado);
    expect(b.cuerpo).toEqual(a.cuerpo);
  });

  it("el mismo archivo con otra clave responde 'repetida' sin cambios", async () => {
    const r = await subir(admin, MINI, "copia.xlsx");
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ repetida: true, creadas: 0 });
  });

  it("sin sesión → 401", async () => {
    const r = await llamar(rutaImp.POST, "POST", "/api/v1/importaciones", {});
    expect(r.estado).toBe(401);
  });
});
