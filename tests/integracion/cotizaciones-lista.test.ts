import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaPdf from "@/app/api/v1/cotizaciones/[id]/pdf/route";
import * as rutaCot from "@/app/api/v1/cotizaciones/[id]/route";
import * as rutaCots from "@/app/api/v1/cotizaciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let s: { token: string; csrf: string };
const ids: string[] = [];
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
const listar = async (q: string, sesion = s) => (await llamar(rutaCots.GET, "GET", `/api/v1/cotizaciones?${q}`, sesion)).cuerpo;

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "lista@neltume.cl", nombre: "Lista", clave: "clave-lista-1" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  const alerces = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Constructora Los Alerces", rut: "11.111.111-1" }, sistema, "consola"))).id;
  const puyehue = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Ferretería Puyehue", rut: "22.222.222-2" }, sistema, "consola"))).id;
  s = await sesionDe("lista@neltume.cl", "clave-lista-1", "10.23.0.1");
  for (const clienteId of [alerces, puyehue, alerces, null]) {
    ids.push((await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: { "idempotency-key": randomUUID() }, cuerpo: { clienteId, items: [{ codigo: "FUY-O-2-A", cantidad: 1 }] } })).cuerpo.id);
  }
  // Una cotización de hace 40 días, para el filtro de fechas (solo cambia la fecha de un borrador).
  await app.query("UPDATE cotizacion SET creado_en = now() - interval '40 days' WHERE id = $1", [ids[0]]);
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("historial y búsqueda de cotizaciones (REQ-COT-10.1)", () => {
  it("busca por cliente y por número", async () => {
    expect((await listar("q=alerces")).datos).toHaveLength(2);
    const { rows: [{ numero }] } = await app.query("SELECT numero FROM cotizacion WHERE id = $1", [ids[1]]);
    expect((await listar(`q=${numero}`)).datos.map((c: { id: string }) => c.id)).toEqual([ids[1]]);
    expect((await listar(`q=%23${numero}`)).datos).toHaveLength(1); // «#123» también
  });

  it("filtra por fechas en días de Santiago y combina con estado", async () => {
    expect((await listar(`desde=${hoy}`)).datos).toHaveLength(3);
    expect((await listar(`hasta=${hoy}&q=alerces`)).datos).toHaveLength(2);
    const hace30 = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(Date.now() - 30 * 86_400_000));
    expect((await listar(`hasta=${hace30}`)).datos.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
    expect((await listar(`estado=aprobada&desde=${hoy}`)).datos).toHaveLength(0);
    expect((await llamar(rutaCots.GET, "GET", "/api/v1/cotizaciones?desde=ayer", s)).estado).toBe(400);
  });

  it("pagina por número, de la más nueva a la más antigua, sin repetir", async () => {
    const p1 = await listar("limite=3");
    expect(p1.datos).toHaveLength(3);
    const p2 = await listar(`limite=3&antesDe=${p1.siguiente}`);
    expect(p2.datos).toHaveLength(1);
    expect(p2.siguiente).toBeNull();
    expect(new Set([...p1.datos, ...p2.datos].map((c: { id: string }) => c.id)).size).toBe(4);
  });
});

describe("anti-IDOR (REQ-COT-10.2)", () => {
  it("sin permiso, una cotización existente responde igual que una inexistente, y el intento se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "ajeno@neltume.cl", nombre: "Ajeno", clave: "clave-ajeno-1", rolId: rol.id }, sistema, "consola"));
    const ajeno = await sesionDe("ajeno@neltume.cl", "clave-ajeno-1", "10.23.0.2");
    const existente = await llamar(rutaCot.GET, "GET", `/api/v1/cotizaciones/${ids[1]}`, ajeno, { id: ids[1] });
    const inexistente = await llamar(rutaCot.GET, "GET", "/x", s, { id: randomUUID() });
    expect(existente.estado).toBe(404);
    expect(existente.cuerpo.error).toMatchObject({ codigo: inexistente.cuerpo.error.codigo, mensaje: inexistente.cuerpo.error.mensaje });
    const pdf = await llamar(rutaPdf.GET, "GET", `/api/v1/cotizaciones/${ids[1]}/pdf`, ajeno, { id: ids[1] });
    expect(pdf.estado).toBe(404);
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE resultado = 'denegado' AND accion = $1", [`GET /api/v1/cotizaciones/${ids[1]}`]);
    expect(rows).toEqual([{ despues: { motivo: "SIN_PERMISO" } }]);
  });
});
