import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaVersion from "@/app/api/v1/listas-precio/[version]/route";
import * as rutaListas from "@/app/api/v1/listas-precio/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
type S = { token: string; csrf: string };
let admin: S;
let lector: S;

async function entrar(email: string, ip: string): Promise<S> {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-listas" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
const idem = () => ({ "idempotency-key": randomUUID() });

beforeAll(async () => {
  await owner.query("INSERT INTO rol (nombre) VALUES ('lector') ON CONFLICT DO NOTHING");
  await owner.query("INSERT INTO rol_permiso (rol_id, permiso_codigo) SELECT id, 'stock.ver' FROM rol WHERE nombre = 'lector' ON CONFLICT DO NOTHING");
  const u = await bd().transaction(async (tx) => {
    await crearUsuario(tx, { email: "lector@neltume.cl", nombre: "L", clave: "clave-listas", rolNombre: "lector" }, { tipo: "sistema" }, "consola");
    return crearUsuario(tx, { email: "precios@neltume.cl", nombre: "P", clave: "clave-listas" }, { tipo: "sistema" }, "consola");
  });
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  admin = await entrar("precios@neltume.cl", "10.7.0.1");
  lector = await entrar("lector@neltume.cl", "10.7.0.2");
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("listas de precio (REQ-COT-1.1, 1.3–1.5)", () => {
  it("lista versiones y precios con venta = neto × (1 + recargo) e IVA, paginados", async () => {
    const v = await llamar(rutaListas.GET, "GET", "/api/v1/listas-precio", lector);
    expect(v.cuerpo.datos).toHaveLength(1);
    const p = await llamar(rutaVersion.GET, "GET", "/api/v1/listas-precio/1?limite=5", lector, { version: "1" });
    expect(p.cuerpo.datos).toHaveLength(5);
    expect(p.cuerpo.siguiente).toBeTruthy();
    expect(p.cuerpo.datos[0]).toMatchObject({ recargo: 0, precioVenta: expect.any(Number), precioVentaConIva: expect.any(Number) });
  });

  it("oculta costos y margen sin costos.ver, y los muestra con el permiso", async () => {
    const sin = await llamar(rutaVersion.GET, "GET", "/api/v1/listas-precio/1?q=NEL-R-4-B", lector, { version: "1" });
    expect(sin.cuerpo.datos[0]).not.toHaveProperty("costoTotal");
    const con = await llamar(rutaVersion.GET, "GET", "/api/v1/listas-precio/1?q=NEL-R-4-B", admin, { version: "1" });
    expect(con.cuerpo.datos[0]).toHaveProperty("costoTotal");
  });

  it("editar un precio y un recargo crea v2 vigente y v1 queda intacta", async () => {
    const antes = await llamar(rutaVersion.GET, "GET", "/x?q=NEL-R-4-B", admin, { version: "1" });
    const r = await llamar(rutaListas.POST, "POST", "/api/v1/listas-precio", {
      ...admin, cabeceras: idem(), cuerpo: { cambios: [{ codigo: "NEL-R-4-B", precioNeto: 250000 }], recargos: [{ tipo: "BLOQUE", porcentaje: 0.12 }] },
    });
    expect(r.estado).toBe(201);
    const v2 = await llamar(rutaVersion.GET, "GET", "/x?q=NEL-R-4-B", admin, { version: String(r.cuerpo.version) });
    expect(v2.cuerpo.datos[0]).toMatchObject({ precioNeto: 250000, recargo: 0.12, precioVenta: 280000 });
    const v1 = await llamar(rutaVersion.GET, "GET", "/x?q=NEL-R-4-B", admin, { version: "1" });
    expect(v1.cuerpo.datos[0].precioNeto).toBe(antes.cuerpo.datos[0].precioNeto);
    const total = await app.query("SELECT (SELECT count(*) FROM precio p JOIN lista_precio l ON l.id = p.lista_id WHERE l.vigente)::int AS n");
    expect(total.rows[0].n).toBe(70);
  });

  it("sin precios.editar → 403; códigos inexistentes → 400; sin cambios → 400", async () => {
    expect((await llamar(rutaListas.POST, "POST", "/x", { ...lector, cabeceras: idem(), cuerpo: { recargos: [{ tipo: "PANEL", porcentaje: 0.1 }] } })).estado).toBe(403);
    const mal = await llamar(rutaListas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { cambios: [{ codigo: "NO-EXISTE-1-A", precioNeto: 1000 }] } });
    expect(mal.estado).toBe(400);
    expect((await llamar(rutaListas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: {} })).estado).toBe(400);
  });

  it("la edición queda auditada con el precio antes y después", async () => {
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE accion = 'nueva versión'");
    expect(rows[0].despues.cambios).toEqual([{ codigo: "NEL-R-4-B", antes: expect.any(Number), despues: 250000 }]);
  });
});
