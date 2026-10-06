import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAprobar from "@/app/api/v1/cotizaciones/[id]/aprobar/route";
import * as rutaPdf from "@/app/api/v1/cotizaciones/[id]/pdf/route";
import * as rutaCots from "@/app/api/v1/cotizaciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
const idem = () => ({ "idempotency-key": randomUUID() });
let s: { token: string; csrf: string };
let id: string;

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "pdf@neltume.cl", nombre: "Pdf", clave: "clave-pdf-1" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  const clienteId = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Ferretería Puyehue", rut: "11.111.111-1" }, sistema, "consola"))).id;
  s = await sesionDe("pdf@neltume.cl", "clave-pdf-1", "10.16.0.1");
  id = (await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { clienteId, items: [{ codigo: "FUY-O-2-A", cantidad: 2 }] } })).cuerpo.id;
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("PDF de cotización (REQ-COT-4.2, 4.3, 4.5; ADR-0004)", () => {
  it("un borrador no genera PDF → 409 NO_APROBADA", async () => {
    const r = await llamar(rutaPdf.GET, "GET", "/x", s, { id });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.error.codigo).toBe("NO_APROBADA");
  });

  it("aprobada: descarga un PDF y queda auditado", async () => {
    await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: 1 } }, { id });
    const r = await llamar(rutaPdf.GET, "GET", "/x", s, { id });
    expect(r.estado).toBe(200);
    expect(r.res.headers.get("content-type")).toBe("application/pdf");
    expect(r.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE accion = 'descargar pdf' AND recurso_id = $1", [id]);
    expect(rows).toHaveLength(1);
  });

  it("sin cotizaciones.aprobar se deniega y se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "cotiza sin aprobar", ["cotizaciones.crear", "clientes.ver"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "noaprueba@neltume.cl", nombre: "No Aprueba", clave: "clave-noaprueba", rolId: rol.id }, sistema, "consola"));
    const otra = await sesionDe("noaprueba@neltume.cl", "clave-noaprueba", "10.16.0.2");
    const r = await llamar(rutaPdf.GET, "GET", `/api/v1/cotizaciones/${id}/pdf`, otra, { id });
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion LIKE '%/pdf'");
    expect(rows.length).toBeGreaterThan(0);
  });
});
