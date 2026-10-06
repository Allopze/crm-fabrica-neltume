import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
const CLAVE = "clave-larga-de-politica";
let token: string;
let csrf: string;

beforeAll(async () => {
  await bd().transaction((tx) => crearUsuario(tx, { email: "politica@neltume.cl", nombre: "Pol", clave: CLAVE }, { tipo: "sistema" }, "consola"));
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "politica@neltume.cl", clave: CLAVE }, ip: "10.2.0.1" });
  token = tokenDeCookie(r.res)!;
  csrf = r.cuerpo.csrf;
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("conPermiso / publico (SECURITY §2, API §1–2)", () => {
  it("login deja una cookie HttpOnly y devuelve CSRF, sin el token en el cuerpo", async () => {
    const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "politica@neltume.cl", clave: CLAVE }, ip: "10.2.0.2" });
    expect(r.estado).toBe(200);
    expect(r.res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(r.res.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(JSON.stringify(r.cuerpo)).not.toContain(tokenDeCookie(r.res)!);
    expect(r.res.headers.get("x-correlacion-id")).toMatch(/[0-9a-f-]{36}/);
  });

  it("credenciales inválidas → 401 CREDENCIALES con formato de error único", async () => {
    const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "politica@neltume.cl", clave: "mala-clave-1234" }, ip: "10.2.0.3" });
    expect(r.estado).toBe(401);
    expect(r.cuerpo.error).toMatchObject({ codigo: "CREDENCIALES", mensaje: expect.any(String), correlacion_id: expect.any(String) });
  });

  it("cuerpo con campos extra → 400 VALIDACION; sin JSON → 400", async () => {
    const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "a@b.cl", clave: "x", rol: "admin" } });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe("VALIDACION");
  });

  it("sin sesión → 401 y la denegación queda auditada", async () => {
    const r = await llamar(rutaSesion.GET, "GET", "/api/v1/sesion");
    expect(r.estado).toBe(401);
    const { rows } = await app.query("SELECT resultado, despues FROM audit_log WHERE correlacion_id = $1", [r.cuerpo.error.correlacion_id]);
    expect(rows[0]).toMatchObject({ resultado: "denegado", despues: { motivo: "NO_AUTENTICADO" } });
  });

  it("con sesión devuelve usuario, permisos y CSRF", async () => {
    const r = await llamar(rutaSesion.GET, "GET", "/api/v1/sesion", { token });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.usuario.email).toBe("politica@neltume.cl");
    expect(r.cuerpo.permisos).toContain("auditoria.ver");
  });

  it("mutación sin CSRF → 403 CSRF auditado", async () => {
    const r = await llamar(rutaSesion.DELETE, "DELETE", "/api/v1/sesion", { token });
    expect(r.estado).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("CSRF");
  });

  it("logout con CSRF revoca la sesión", async () => {
    const r = await llamar(rutaSesion.DELETE, "DELETE", "/api/v1/sesion", { token, csrf });
    expect(r.estado).toBe(204);
    const despues = await llamar(rutaSesion.GET, "GET", "/api/v1/sesion", { token });
    expect(despues.estado).toBe(401);
  });

  it("sin el permiso → 403 SIN_PERMISO auditado", async () => {
    // Rol de prueba sin permisos: los roles son datos (SECURITY §1).
    const { rows } = await owner.query("INSERT INTO rol (nombre) VALUES ('sin-permisos') RETURNING id");
    await bd().transaction((tx) => crearUsuario(tx, { email: "sinpermisos@neltume.cl", nombre: "S", clave: CLAVE, rolNombre: "sin-permisos" }, { tipo: "sistema" }, "consola"));
    const login = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "sinpermisos@neltume.cl", clave: CLAVE }, ip: "10.2.0.4" });
    const { conPermiso } = await import("@/domain/auth/politica");
    const rutaProtegida = conPermiso("usuarios.gestionar", async () => new Response("no debería llegar"));
    const r = await llamar(rutaProtegida as never, "GET", "/api/v1/usuarios", { token: tokenDeCookie(login.res) });
    expect(r.estado).toBe(403);
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const audit = await app.query("SELECT actor_tipo, resultado FROM audit_log WHERE correlacion_id = $1", [r.cuerpo.error.correlacion_id]);
    expect(audit.rows[0]).toEqual({ actor_tipo: "usuario", resultado: "denegado" });
    expect(rows[0].id).toBeDefined();
  });
});
