import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaFeriado from "@/app/api/v1/feriados/[fecha]/route";
import * as rutaFeriados from "@/app/api/v1/feriados/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { cargarFeriados } from "@/domain/precios/calendario";
import { sumarDiasHabiles } from "@/domain/precios/dias-habiles";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let admin: { token: string; csrf: string };
let lector: { token: string; csrf: string };

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

beforeAll(async () => {
  await bd().transaction((tx) => crearUsuario(tx, { email: "feriados@neltume.cl", nombre: "Feriados", clave: "clave-feriados" }, sistema, "consola"));
  const rol = await bd().transaction((tx) => crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola"));
  await bd().transaction((tx) => crearUsuario(tx, { email: "lee-feriados@neltume.cl", nombre: "Lee", clave: "clave-lee-feriados", rolId: rol.id }, sistema, "consola"));
  admin = await sesionDe("feriados@neltume.cl", "clave-feriados", "10.24.0.1");
  lector = await sesionDe("lee-feriados@neltume.cl", "clave-lee-feriados", "10.24.0.2");
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("calendario de días hábiles (REQ-COT-6.6)", () => {
  it("una vigencia que cruza el año salta los feriados legales del año siguiente sin sembrarlos", async () => {
    await app.query("DELETE FROM feriado"); // solo quedan los legales calculados
    // Desde el lunes 28-12-2026: 10 hábiles saltan el 1-1-2027 (viernes) → 12-01-2027.
    expect(sumarDiasHabiles("2026-12-28", 10, await cargarFeriados(bd(), "2026-12-28"))).toBe("2027-01-12");
  });

  it("un feriado adicional se suma al cálculo, se audita y se puede quitar", async () => {
    const r = await llamar(rutaFeriados.POST, "POST", "/x", { ...admin, cuerpo: { fecha: "2027-01-04", nombre: "Elección de prueba" } });
    expect(r.estado).toBe(201);
    expect(sumarDiasHabiles("2026-12-28", 10, await cargarFeriados(bd(), "2026-12-28"))).toBe("2027-01-13");
    const lista = (await llamar(rutaFeriados.GET, "GET", "/api/v1/feriados?anio=2027", lector)).cuerpo.datos;
    expect(lista).toContainEqual({ fecha: "2027-01-04", nombre: "Elección de prueba", origen: "adicional" });
    expect(lista).toContainEqual({ fecha: "2027-06-28", nombre: "San Pedro y San Pablo", origen: "ley" });
    expect((await llamar(rutaFeriado.DELETE, "DELETE", "/x", admin, { fecha: "2027-01-04" })).estado).toBe(204);
    const { rows } = await app.query("SELECT accion FROM audit_log WHERE recurso = 'feriado' ORDER BY id");
    expect(rows.map((x) => x.accion)).toEqual(["agregar feriado", "quitar feriado"]);
  });

  it("un feriado legal no se agrega como adicional; sin config.editar → 403 auditado", async () => {
    expect((await llamar(rutaFeriados.POST, "POST", "/x", { ...admin, cuerpo: { fecha: "2027-09-18", nombre: "Duplicado" } })).cuerpo.error.codigo).toBe("VALIDACION");
    const r = await llamar(rutaFeriados.POST, "POST", "/api/v1/feriados", { ...lector, cuerpo: { fecha: "2027-03-01", nombre: "Inventado" } });
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion = 'POST /api/v1/feriados'");
    expect(rows).toHaveLength(1);
  });
});
