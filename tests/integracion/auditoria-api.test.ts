import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAuditoria from "@/app/api/v1/auditoria/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let admin: { token: string; csrf: string };
let adminId: string;

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

beforeAll(async () => {
  adminId = (await bd().transaction((tx) => crearUsuario(tx, { email: "audita@neltume.cl", nombre: "Audita", clave: "clave-audita" }, sistema, "consola"))).id;
  const rol = await bd().transaction((tx) => crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola"));
  await bd().transaction((tx) => crearUsuario(tx, { email: "curioso@neltume.cl", nombre: "Curioso", clave: "clave-curioso", rolId: rol.id }, sistema, "consola"));
  admin = await sesionDe("audita@neltume.cl", "clave-audita", "10.18.0.1");
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("consulta de auditoría (REQ-ADM-3.2, 3.4)", () => {
  it("filtra por actor, recurso, acción, resultado y fechas", async () => {
    const ver = async (q: string) => (await llamar(rutaAuditoria.GET, "GET", `/api/v1/auditoria?${q}`, admin)).cuerpo;
    const propios = await ver(`actor=${adminId}`);
    expect(propios.datos.length).toBeGreaterThan(0);
    expect(propios.datos.every((e: { actor: string }) => e.actor === "Audita")).toBe(true);
    expect((await ver("recurso=usuario")).datos.every((e: { recurso: string }) => e.recurso === "usuario")).toBe(true);
    expect((await ver("accion=crear&recurso=usuario")).datos.length).toBeGreaterThanOrEqual(2);
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    expect((await ver(`desde=${hoy}&hasta=${hoy}`)).datos.length).toBeGreaterThan(0);
    expect((await ver("hasta=2000-01-01")).datos).toHaveLength(0);
    expect((await llamar(rutaAuditoria.GET, "GET", "/api/v1/auditoria?desde=ayer", admin)).estado).toBe(400);
  });

  it("pagina por id con limite y siguiente", async () => {
    const p1 = (await llamar(rutaAuditoria.GET, "GET", "/api/v1/auditoria?limite=2", admin)).cuerpo;
    expect(p1.datos).toHaveLength(2);
    const p2 = (await llamar(rutaAuditoria.GET, "GET", `/api/v1/auditoria?limite=2&antesDe=${p1.siguiente}`, admin)).cuerpo;
    expect(p2.datos[0].id).toBeLessThan(p1.datos[1].id);
  });

  it("sin auditoria.ver se deniega y el intento queda registrado", async () => {
    const otro = await sesionDe("curioso@neltume.cl", "clave-curioso", "10.18.0.2");
    const r = await llamar(rutaAuditoria.GET, "GET", "/api/v1/auditoria", otro);
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const d = (await llamar(rutaAuditoria.GET, "GET", "/api/v1/auditoria?resultado=denegado", admin)).cuerpo;
    expect(d.datos.some((e: { accion: string; actor: string }) => e.accion === "GET /api/v1/auditoria" && e.actor === "Curioso")).toBe(true);
  });
});
