import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAliasUno from "@/app/api/v1/alias-modelos/[alias]/route";
import * as rutaAlias from "@/app/api/v1/alias-modelos/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { cargarCatalogoMapeo } from "@/domain/cotizaciones/catalogo";
import { mapearItem } from "@/domain/cotizaciones/mapear";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let s: { token: string; csrf: string };
const item = (modelo: string) => ({ texto_fuente: `2 ${modelo} oregón 70x200`, tipo: "puerta" as const, modelo, madera: "PINO OREGON", ancho_m: 0.7, alto_m: 2, medida_accesorio: null, cantidad: 2, dudas: [] });

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "alias@neltume.cl", nombre: "Alias", clave: "clave-alias-1" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  s = await sesionDe("alias@neltume.cl", "clave-alias-1", "10.27.0.1");
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("alias de modelos (REQ-COT-2.11)", () => {
  it("la semilla trae los alias reales de la tienda", async () => {
    const r = await llamar(rutaAlias.GET, "GET", "/x", s);
    expect(r.cuerpo.datos).toEqual(expect.arrayContaining([
      expect.objectContaining({ alias: "COSCOS", modelo: "COZ COZ", tipo: "seguro" }),
      expect.objectContaining({ alias: "PILLO", modelo: "HUILO HUILO", tipo: "posible" }),
    ]));
  });

  it("un alias agregado se aplica en el mapeo; uno dudoso deja el ítem por confirmar; ambos se auditan", async () => {
    expect((await llamar(rutaAlias.POST, "POST", "/x", { ...s, cuerpo: { alias: "Fui", modelo: "fuy", tipo: "seguro" } })).estado).toBe(201);
    expect((await mapearItem(item("Fuí"), await cargarCatalogoMapeo(bd())))).toMatchObject({ estado: "ok", codigo: "FUY-O-2-A" });
    expect((await llamar(rutaAlias.POST, "POST", "/x", { ...s, cuerpo: { alias: "Fui", modelo: "FUY", tipo: "posible" } })).estado).toBe(201);
    expect(mapearItem(item("Fuí"), await cargarCatalogoMapeo(bd()))).toMatchObject({ estado: "por_confirmar", duda: expect.stringContaining("¿Te refieres a «Fuy»?") });
    expect((await llamar(rutaAliasUno.DELETE, "DELETE", "/x", s, { alias: "FUI" })).estado).toBe(204);
    const { rows } = await app.query("SELECT accion FROM audit_log WHERE recurso = 'alias_modelo' ORDER BY id");
    expect(rows.map((r) => r.accion)).toEqual(["agregar alias", "cambiar alias", "quitar alias"]);
  });

  it("no se aceptan alias de modelos inexistentes ni con el nombre de un modelo real", async () => {
    expect((await llamar(rutaAlias.POST, "POST", "/x", { ...s, cuerpo: { alias: "algo", modelo: "OSORNO", tipo: "seguro" } })).estado).toBe(400);
    expect((await llamar(rutaAlias.POST, "POST", "/x", { ...s, cuerpo: { alias: "Neltume", modelo: "FUY", tipo: "seguro" } })).estado).toBe(400);
  });

  it("sin catalogo.editar se deniega y se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "lee-alias@neltume.cl", nombre: "Lee", clave: "clave-lee-alias", rolId: rol.id }, sistema, "consola"));
    const lector = await sesionDe("lee-alias@neltume.cl", "clave-lee-alias", "10.27.0.2");
    expect((await llamar(rutaAlias.GET, "GET", "/x", lector)).estado).toBe(200);
    expect((await llamar(rutaAlias.POST, "POST", "/api/v1/alias-modelos", { ...lector, cuerpo: { alias: "otro", modelo: "FUY", tipo: "seguro" } })).cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion = 'POST /api/v1/alias-modelos'");
    expect(rows).toHaveLength(1);
  });
});
