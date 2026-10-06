import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaArticulo from "@/app/api/v1/articulos/[codigo]/route";
import * as rutaAjustes from "@/app/api/v1/movimientos/ajustes/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import * as rutaSalidas from "@/app/api/v1/movimientos/salidas/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import * as rutaStockArt from "@/app/api/v1/stock/[codigo]/route";
import * as rutaStock from "@/app/api/v1/stock/route";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
type S = { token: string; csrf: string };
let admin: S;
let lector: S;
const idem = () => ({ "idempotency-key": randomUUID() });
const entrar = async (email: string, ip: string): Promise<S> => {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-stock" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
};
const saldo = async (codigo: string) => (await llamar(rutaStockArt.GET, "GET", "/x", admin, { codigo })).cuerpo;

beforeAll(async () => {
  await owner.query("INSERT INTO rol (nombre) VALUES ('consulta-stock') ON CONFLICT DO NOTHING");
  await owner.query("INSERT INTO rol_permiso (rol_id, permiso_codigo) SELECT id, 'stock.ver' FROM rol WHERE nombre = 'consulta-stock' ON CONFLICT DO NOTHING");
  const u = await bd().transaction(async (tx) => {
    await crearUsuario(tx, { email: "lee@neltume.cl", nombre: "L", clave: "clave-stock", rolNombre: "consulta-stock" }, { tipo: "sistema" }, "consola");
    return crearUsuario(tx, { email: "bodega@neltume.cl", nombre: "Bodega", clave: "clave-stock" }, { tipo: "sistema" }, "consola");
  });
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  admin = await entrar("bodega@neltume.cl", "10.8.0.1");
  lector = await entrar("lee@neltume.cl", "10.8.0.2");
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("movimientos y stock (REQ-STK-2–5)", () => {
  it("entrada por producción suma existencia; repetir con la misma clave no duplica", async () => {
    const cab = idem();
    const a = await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: cab, cuerpo: { codigo: "nel-r-4-b", cantidad: 3, referencia: "Orden 1" } });
    const b = await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: cab, cuerpo: { codigo: "nel-r-4-b", cantidad: 3, referencia: "Orden 1" } });
    expect(a.estado).toBe(201);
    expect(b.cuerpo).toEqual(a.cuerpo);
    expect(await saldo("NEL-R-4-B")).toMatchObject({ existencia: 3, reservado: 0, disponible: 3 });
  });

  it("rechaza cantidades no enteras o artículos inexistentes sin crear movimiento", async () => {
    expect((await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: 1.5 } })).estado).toBe(400);
    expect((await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "NO-EXISTE", cantidad: 1 } })).estado).toBe(404);
    expect((await saldo("NEL-R-4-B")).existencia).toBe(3);
  });

  it("una salida que dejaría el stock en negativo → 409 con el faltante", async () => {
    const r = await llamar(rutaSalidas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: 5 } });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.error).toMatchObject({ codigo: "STOCK_INSUFICIENTE", detalles: { faltante: 2 } });
    expect((await saldo("NEL-R-4-B")).existencia).toBe(3);
  });

  it("ajuste exige motivo y queda en el historial con su autor", async () => {
    expect((await llamar(rutaAjustes.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: -1 } })).estado).toBe(400);
    const r = await llamar(rutaAjustes.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: -1, motivo: "Puerta con grieta" } });
    expect(r.estado).toBe(201);
    const s = await saldo("NEL-R-4-B");
    expect(s.existencia).toBe(2);
    expect(s.movimientos[0]).toMatchObject({ tipo: "ajuste", motivo: "Puerta con grieta", usuario: "Bodega" });
  });

  it("lista stock con disponible y filtro bajo mínimo", async () => {
    await llamar(rutaArticulo.PATCH, "PATCH", "/x", { ...admin, cuerpo: { stockMinimo: 4 } }, { codigo: "NEL-R-4-B" });
    const r = await llamar(rutaStock.GET, "GET", "/api/v1/stock?bajoMinimo=1", lector);
    expect(r.cuerpo.datos).toEqual([expect.objectContaining({ codigo: "NEL-R-4-B", existencia: 2, disponible: 2, minimo: 4 })]);
  });

  it("solo stock.ver no puede mover ni ajustar (403) y queda auditado", async () => {
    const r = await llamar(rutaEntradas.POST, "POST", "/x", { ...lector, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: 1 } });
    expect(r.estado).toBe(403);
    expect((await llamar(rutaAjustes.POST, "POST", "/x", { ...lector, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: 1, motivo: "x x x" } })).estado).toBe(403);
    const { rows } = await app.query("SELECT resultado FROM audit_log WHERE correlacion_id = $1", [r.cuerpo.error.correlacion_id]);
    expect(rows[0].resultado).toBe("denegado");
  });

  it("dos salidas simultáneas no pueden sacar más de lo que hay", async () => {
    const pedir = () => llamar(rutaSalidas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "NEL-R-4-B", cantidad: 2 } });
    const [a, b] = await Promise.all([pedir(), pedir()]);
    expect([a.estado, b.estado].sort()).toEqual([201, 409]);
    expect((await saldo("NEL-R-4-B")).existencia).toBe(0);
  });
});
