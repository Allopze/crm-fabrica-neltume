import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaArticulo from "@/app/api/v1/articulos/[codigo]/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import * as rutaAlertas from "@/app/api/v1/stock/alertas/route";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let admin: { token: string; csrf: string };

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
const minimo = (s: typeof admin, codigo: string, stockMinimo: number | null) =>
  llamar(rutaArticulo.PATCH, "PATCH", `/api/v1/articulos/${codigo}`, { ...s, cuerpo: { stockMinimo } }, { codigo });

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "alertas@neltume.cl", nombre: "Alertas", clave: "clave-alertas" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  admin = await sesionDe("alertas@neltume.cl", "clave-alertas", "10.21.0.1");
  for (const [codigo, cantidad] of [["NEL-R-4-B", 2], ["ANC-O-3-A", 5]] as const) {
    await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: { "idempotency-key": randomUUID() }, cuerpo: { codigo, cantidad } });
  }
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("alertas de stock mínimo (REQ-STK-6.1, 6.2)", () => {
  it("lista solo las puertas bajo su mínimo, con lo que falta, las más urgentes primero", async () => {
    expect((await llamar(rutaAlertas.GET, "GET", "/x", admin)).cuerpo.datos).toEqual([]);
    expect((await minimo(admin, "NEL-R-4-B", 4)).estado).toBe(200);
    expect((await minimo(admin, "ANC-O-3-A", 3)).estado).toBe(200); // 5 ≥ 3: no alerta
    expect((await minimo(admin, "LIC-L-4-B", 6)).estado).toBe(200); // sin stock: faltan 6
    const r = await llamar(rutaAlertas.GET, "GET", "/x", admin);
    expect(r.cuerpo.datos.map((a: { codigo: string; disponible: number; faltan: number }) => [a.codigo, a.disponible, a.faltan]))
      .toEqual([["LIC-L-4-B", 0, 6], ["NEL-R-4-B", 2, 2]]);
    expect((await minimo(admin, "LIC-L-4-B", null)).estado).toBe(200);
    expect((await llamar(rutaAlertas.GET, "GET", "/x", admin)).cuerpo.datos).toHaveLength(1);
    const { rows } = await app.query("SELECT antes, despues FROM audit_log WHERE accion = 'definir mínimo' ORDER BY id");
    expect(rows.at(-1)).toMatchObject({ antes: { stockMinimo: 6 }, despues: { stockMinimo: null } });
  });

  it("sin config.editar no se cambia un mínimo; sin stock.ver no se ven las alertas; ambos auditados", async () => {
    const lector = await bd().transaction((tx) => crearRol(tx, "lector stock", ["stock.ver"], sistema, "consola"));
    const nada = await bd().transaction((tx) => crearRol(tx, "sin stock", ["cotizaciones.crear"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "lector@neltume.cl", nombre: "Lector", clave: "clave-lector-1", rolId: lector.id }, sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "nada@neltume.cl", nombre: "Nada", clave: "clave-nada-12", rolId: nada.id }, sistema, "consola"));
    const l = await sesionDe("lector@neltume.cl", "clave-lector-1", "10.21.0.2");
    const n = await sesionDe("nada@neltume.cl", "clave-nada-12", "10.21.0.3");
    expect((await llamar(rutaAlertas.GET, "GET", "/x", l)).estado).toBe(200);
    expect((await minimo(l, "NEL-R-4-B", 0)).cuerpo.error.codigo).toBe("SIN_PERMISO");
    expect((await llamar(rutaAlertas.GET, "GET", "/api/v1/stock/alertas", n)).cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT accion FROM audit_log WHERE resultado = 'denegado' ORDER BY id");
    expect(rows.map((r) => r.accion)).toEqual(expect.arrayContaining([expect.stringMatching(/^PATCH .*articulos/), "GET /api/v1/stock/alertas"]));
    const { rows: [{ stock_minimo }] } = await app.query("SELECT stock_minimo FROM articulo WHERE codigo = 'NEL-R-4-B'");
    expect(stock_minimo).toBe(4);
  });
});
