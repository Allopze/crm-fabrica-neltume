import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import { DobleIA } from "@/ai/doble";
import { procesarSiguiente } from "@/ai/procesar";
import * as rutaCot from "@/app/api/v1/cotizaciones/[id]/route";
import * as rutaInterp from "@/app/api/v1/cotizaciones/interpretaciones/route";
import * as rutaLista from "@/app/api/v1/cotizaciones/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearUsuario } from "@/domain/usuarios";

const owner = poolOwner();
type S = { token: string; csrf: string };
let admin: S;
let bodega: S;
const idem = () => ({ "idempotency-key": randomUUID() });
const entrar = async (email: string, ip: string): Promise<S> => {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-interp" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
};

beforeAll(async () => {
  await owner.query("INSERT INTO rol (nombre) VALUES ('bodega') ON CONFLICT DO NOTHING");
  await owner.query("INSERT INTO rol_permiso (rol_id, permiso_codigo) SELECT id, p FROM rol, unnest(ARRAY['stock.ver','stock.mover']) p WHERE nombre = 'bodega' ON CONFLICT DO NOTHING");
  const u = await bd().transaction(async (tx) => {
    await crearUsuario(tx, { email: "bod@neltume.cl", nombre: "B", clave: "clave-interp", rolNombre: "bodega" }, { tipo: "sistema" }, "consola");
    return crearUsuario(tx, { email: "vende@neltume.cl", nombre: "V", clave: "clave-interp" }, { tipo: "sistema" }, "consola");
  });
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  admin = await entrar("vende@neltume.cl", "10.12.0.1");
  bodega = await entrar("bod@neltume.cl", "10.12.0.2");
  await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: 2 } });
});
afterAll(async () => { await owner.end(); await cerrarBd(); });

describe("interpretación por API (REQ-COT-2.1, 2.6, 2.10, 3.1, 3.4)", () => {
  let id: string;

  it("POST responde 202 con el borrador 'interpretando'", async () => {
    const r = await llamar(rutaInterp.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { texto: "3 puertas Neltume en raulí de 90x210 y 2 de roble con chapa" } });
    expect(r.estado).toBe(202);
    expect(r.cuerpo).toMatchObject({ estado: "interpretando", numero: expect.any(Number) });
    id = r.cuerpo.id;
  });

  it("tras el worker, GET trae texto original, ítems y aviso de stock sin bloquear", async () => {
    await procesarSiguiente(new DobleIA(), { esperasMs: [1] });
    const r = await llamar(rutaCot.GET, "GET", "/x", admin, { id });
    expect(r.cuerpo).toMatchObject({ estado: "borrador", textoOriginal: expect.stringContaining("roble"), pendientes: 1, lista: { desactualizada: false } });
    expect(r.cuerpo.items[0]).toMatchObject({ estadoItem: "ok", avisoStock: "Disponible 2 · faltan 1 (a fabricar)" });
    expect(r.cuerpo.items[1]).toMatchObject({ estadoItem: "por_confirmar", avisoStock: null });
  });

  it("la lista muestra el número, estado y pendientes", async () => {
    const r = await llamar(rutaLista.GET, "GET", "/api/v1/cotizaciones?estado=borrador", admin);
    expect(r.cuerpo.datos[0]).toMatchObject({ estado: "borrador", pendientes: 1 });
  });

  it("sin cotizaciones.crear: crear → 403 y leer → 404 como si no existiera (REQ-COT-10.2); id inexistente o inválido → 404", async () => {
    expect((await llamar(rutaInterp.POST, "POST", "/x", { ...bodega, cabeceras: idem(), cuerpo: { texto: "hola" } })).estado).toBe(403);
    expect((await llamar(rutaCot.GET, "GET", "/x", bodega, { id })).estado).toBe(404);
    expect((await llamar(rutaCot.GET, "GET", "/x", admin, { id: randomUUID() })).estado).toBe(404);
    expect((await llamar(rutaCot.GET, "GET", "/x", admin, { id: "1 OR 1=1" })).estado).toBe(404);
  });

  it("texto vacío → 400; más de 4.000 caracteres → 400 TEXTO_DEMASIADO_LARGO", async () => {
    expect((await llamar(rutaInterp.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { texto: "  " } })).estado).toBe(400);
    const largo = await llamar(rutaInterp.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { texto: "x".repeat(4001) } });
    expect(largo.cuerpo.error.codigo).toBe("TEXTO_DEMASIADO_LARGO");
  });
});
