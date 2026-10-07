import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { bd, cerrarBd } from "@/db/conexion";
import { cerrarSesion, iniciarSesion, MAX_FALLOS, validarSesion } from "@/domain/auth/sesiones";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
const CLAVE = "clave-larga-de-prueba";
const ctx = { ip: "10.0.0.7", userAgent: "vitest" };

beforeAll(async () => {
  await bd().transaction((tx) => crearUsuario(tx, { email: "login@neltume.cl", nombre: "Login", clave: CLAVE }, { tipo: "sistema" }, "consola"));
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("login y sesión (REQ-ADM-1.1–1.3, SECURITY T7)", () => {
  it("abre una sesión con credenciales válidas, guarda solo el hash del token y audita", async () => {
    const r = await iniciarSesion("LOGIN@neltume.cl", CLAVE, ctx);
    expect(r.token).toMatch(/^[\w-]{40,}$/);
    const { rows } = await app.query("SELECT token_hash FROM sesion WHERE usuario_id = $1", [r.usuario.id]);
    expect(rows[0].token_hash).not.toContain(r.token);
    const s = await validarSesion(r.token);
    expect(s?.usuario.email).toBe("login@neltume.cl");
    expect(s?.permisos.has("usuarios.gestionar")).toBe(true);
    const audit = await app.query("SELECT resultado FROM audit_log WHERE accion = 'login' AND actor_id = $1", [r.usuario.id]);
    expect(audit.rows.map((x) => x.resultado)).toContain("ok");
  });

  it("no revela si falló el correo o la contraseña, y audita el intento", async () => {
    await expect(iniciarSesion("login@neltume.cl", "incorrecta-12345", ctx)).rejects.toThrow("Correo o contraseña incorrectos.");
    await expect(iniciarSesion("nadie@neltume.cl", "incorrecta-12345", { ip: "10.0.0.8" })).rejects.toThrow("Correo o contraseña incorrectos.");
    const { rows } = await app.query("SELECT count(*)::int AS n FROM audit_log WHERE accion = 'login' AND resultado = 'denegado'");
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it("bloquea tras 5 fallos en 15 minutos, incluso con la clave correcta", async () => {
    const otro = { ip: "10.0.0.9" };
    await bd().transaction((tx) => crearUsuario(tx, { email: "bloqueo@neltume.cl", nombre: "B", clave: CLAVE }, { tipo: "sistema" }, "consola"));
    for (let i = 0; i < MAX_FALLOS; i++) await expect(iniciarSesion("bloqueo@neltume.cl", "mala-clave-123456", otro)).rejects.toThrow();
    await expect(iniciarSesion("bloqueo@neltume.cl", CLAVE, otro)).rejects.toMatchObject({ codigo: "LIMITE_LOGIN" });
  });

  // Auditoría H-07: 40 intentos simultáneos evaluaban 14 contraseñas.
  it("intentos simultáneos no evaden el bloqueo: se evalúan a lo más 5 contraseñas", async () => {
    await bd().transaction((tx) => crearUsuario(tx, { email: "rafaga@neltume.cl", nombre: "R", clave: CLAVE }, { tipo: "sistema" }, "consola"));
    const r = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => iniciarSesion("rafaga@neltume.cl", `mala-clave-${i}`, { ip: `10.4.0.${i}` })));
    const codigos = r.map((x) => (x.status === "rejected" ? (x.reason as { codigo: string }).codigo : "ok"));
    expect(codigos.filter((c) => c === "CREDENCIALES")).toHaveLength(MAX_FALLOS);
    expect(codigos.filter((c) => c === "LIMITE_LOGIN")).toHaveLength(20 - MAX_FALLOS);
    const { rows } = await app.query("SELECT count(*)::int AS n FROM intento_login WHERE email = 'rafaga@neltume.cl'");
    expect(rows[0].n).toBe(MAX_FALLOS);
  });

  it("los logins denegados se auditan agregados por IP cada 15 minutos (ADR-0016)", async () => {
    const ip = { ip: "10.5.0.1" };
    for (const correo of ["a@neltume.cl", "b@neltume.cl", "c@neltume.cl"]) await expect(iniciarSesion(correo, "incorrecta-12345", ip)).rejects.toThrow();
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE accion = 'login' AND ip = '10.5.0.1'");
    expect(rows).toHaveLength(1);
    expect(rows[0].despues).toMatchObject({ motivo: "CREDENCIALES", agregado: true });
    await expect(iniciarSesion("d@neltume.cl", "incorrecta-12345", { ip: "10.5.0.2" })).rejects.toThrow();
    expect((await app.query("SELECT count(*)::int AS n FROM audit_log WHERE accion = 'login' AND ip = '10.5.0.2'")).rows[0].n).toBe(1);
  });

  it("cerrar sesión la revoca de inmediato", async () => {
    const r = await iniciarSesion("login@neltume.cl", CLAVE, { ip: "10.0.0.10" });
    const s = await validarSesion(r.token);
    await cerrarSesion(s!, ctx);
    expect(await validarSesion(r.token)).toBeNull();
  });

  it("rechaza sesiones expiradas y de usuarios inactivos", async () => {
    const r = await iniciarSesion("login@neltume.cl", CLAVE, { ip: "10.0.0.11" });
    await owner.query("UPDATE sesion SET expira_en = now() - interval '1 minute' WHERE usuario_id = $1", [r.usuario.id]);
    expect(await validarSesion(r.token)).toBeNull();
    const r2 = await iniciarSesion("login@neltume.cl", CLAVE, { ip: "10.0.0.12" });
    await owner.query("UPDATE usuario SET activo = false WHERE id = $1", [r2.usuario.id]);
    expect(await validarSesion(r2.token)).toBeNull();
    await owner.query("UPDATE usuario SET activo = true WHERE id = $1", [r2.usuario.id]);
  });

  it("token ausente o inventado no da sesión", async () => {
    expect(await validarSesion(undefined)).toBeNull();
    expect(await validarSesion("inventado")).toBeNull();
  });
});
