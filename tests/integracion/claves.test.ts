import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaClavePropia from "@/app/api/v1/sesion/clave/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import * as rutaClaveUsuario from "@/app/api/v1/usuarios/[id]/clave/route";
import { bd, cerrarBd } from "@/db/conexion";
import { validarSesion } from "@/domain/auth/sesiones";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let adminId: string;
let consultaId: string;

const entrar = async (email: string, clave: string, ip = "10.20.0.1") => {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { estado: r.estado, token: tokenDeCookie(r.res)!, csrf: r.cuerpo?.csrf as string };
};

beforeAll(async () => {
  adminId = (await bd().transaction((tx) => crearUsuario(tx, { email: "admin-clave@neltume.cl", nombre: "A", clave: "clave-admin-1" }, sistema, "consola"))).id;
  consultaId = await bd().transaction(async (tx) => {
    const r = await crearRol(tx, "consulta-clave", ["stock.ver"], sistema, "consola");
    return (await crearUsuario(tx, { email: "consulta-clave@neltume.cl", nombre: "C", clave: "clave-consulta-1", rolId: r.id }, sistema, "consola")).id;
  });
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("cambio de contraseña propia (REQ-ADM-1.4, auditoría H-14)", () => {
  it("sin sesión → 401", async () => {
    expect((await llamar(rutaClavePropia.PUT, "PUT", "/api/v1/sesion/clave", { cuerpo: { claveActual: "x", claveNueva: "y" } })).estado).toBe(401);
  });

  it("con la clave actual incorrecta → 400, cuenta como fallo de login y no cambia nada", async () => {
    const s = await entrar("consulta-clave@neltume.cl", "clave-consulta-1");
    const r = await llamar(rutaClavePropia.PUT, "PUT", "/api/v1/sesion/clave", { ...s, cuerpo: { claveActual: "otra-cosa-1", claveNueva: "clave-nueva-1" } });
    expect(r.estado).toBe(400);
    expect((await app.query("SELECT count(*)::int AS n FROM intento_login WHERE email = 'consulta-clave@neltume.cl' AND NOT ok")).rows[0].n).toBe(1);
    expect((await entrar("consulta-clave@neltume.cl", "clave-consulta-1", "10.20.0.2")).estado).toBe(200);
  });

  it("cambia la clave, cierra las otras sesiones, conserva la actual y audita sin hash", async () => {
    const otra = await entrar("consulta-clave@neltume.cl", "clave-consulta-1", "10.20.0.3");
    const actual = await entrar("consulta-clave@neltume.cl", "clave-consulta-1", "10.20.0.4");
    const corta = await llamar(rutaClavePropia.PUT, "PUT", "/x", { ...actual, cuerpo: { claveActual: "clave-consulta-1", claveNueva: "corta" } });
    expect(corta.estado).toBe(400);
    const r = await llamar(rutaClavePropia.PUT, "PUT", "/x", { ...actual, cuerpo: { claveActual: "clave-consulta-1", claveNueva: "clave-nueva-larga" } });
    expect(r.estado).toBe(204);
    expect(await validarSesion(otra.token)).toBeNull();
    expect(await validarSesion(actual.token)).not.toBeNull();
    expect((await entrar("consulta-clave@neltume.cl", "clave-consulta-1", "10.20.0.5")).estado).toBe(401);
    expect((await entrar("consulta-clave@neltume.cl", "clave-nueva-larga", "10.20.0.6")).estado).toBe(200);
    const { rows } = await app.query("SELECT resultado, antes, despues FROM audit_log WHERE accion = 'cambiar contraseña' AND recurso_id = $1 ORDER BY id", [consultaId]);
    expect(rows.map((x) => x.resultado)).toEqual(["denegado", "ok"]);
    expect(JSON.stringify(rows)).not.toMatch(/argon2|clave-nueva|clave-consulta/);
  });
});

describe("restablecimiento por un administrador (REQ-ADM-2.5)", () => {
  it("sin usuarios.gestionar → 403 auditado", async () => {
    const s = await entrar("consulta-clave@neltume.cl", "clave-nueva-larga", "10.20.0.7");
    const r = await llamar(rutaClaveUsuario.PUT, "PUT", "/x", { ...s, cuerpo: { claveNueva: "clave-impuesta-1" } }, { id: adminId });
    expect(r.estado).toBe(403);
    const { rows } = await app.query("SELECT count(*)::int AS n FROM audit_log WHERE actor_id = $1 AND resultado = 'denegado' AND accion LIKE 'PUT /x%'", [consultaId]);
    expect(rows[0].n).toBe(1);
  });

  it("fija una clave nueva, cierra todas las sesiones del usuario y audita sin hash; id inexistente → 404", async () => {
    const admin = await entrar("admin-clave@neltume.cl", "clave-admin-1", "10.20.0.8");
    const victima = await entrar("consulta-clave@neltume.cl", "clave-nueva-larga", "10.20.0.9");
    const r = await llamar(rutaClaveUsuario.PUT, "PUT", "/x", { ...admin, cuerpo: { claveNueva: "clave-restablecida-1" } }, { id: consultaId });
    expect(r.estado).toBe(204);
    expect(await validarSesion(victima.token)).toBeNull();
    expect((await entrar("consulta-clave@neltume.cl", "clave-restablecida-1", "10.20.0.10")).estado).toBe(200);
    const { rows } = await app.query("SELECT actor_id, despues FROM audit_log WHERE accion = 'restablecer contraseña' AND recurso_id = $1", [consultaId]);
    expect(rows).toEqual([{ actor_id: adminId, despues: { sesionesCerradas: expect.any(Number) } }]);
    expect((await llamar(rutaClaveUsuario.PUT, "PUT", "/x", { ...admin, cuerpo: { claveNueva: "clave-restablecida-2" } }, { id: randomUUID() })).estado).toBe(404);
  });
});
