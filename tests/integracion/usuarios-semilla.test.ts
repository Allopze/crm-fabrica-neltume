import { afterAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { bd, cerrarBd } from "@/db/conexion";
import { CODIGOS_PERMISO } from "@/domain/auth/permisos";
import { verificarPassword } from "@/domain/auth/password";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("semilla de permisos y rol (REQ-ADM-2.2)", () => {
  it("siembra los 18 permisos y el rol administrador con todos", async () => {
    const { rows } = await app.query(
      "SELECT p.codigo FROM rol r JOIN rol_permiso rp ON rp.rol_id = r.id JOIN permiso p ON p.codigo = rp.permiso_codigo WHERE r.nombre = 'administrador' ORDER BY 1",
    );
    expect(rows.map((r) => r.codigo)).toEqual([...CODIGOS_PERMISO].sort());
    expect(CODIGOS_PERMISO).toHaveLength(18);
  });
});

describe("crear usuario", () => {
  it("guarda el correo en minúsculas, la clave con argon2id y audita sin el hash", async () => {
    const u = await bd().transaction((tx) =>
      crearUsuario(tx, { email: " Paula@Neltume.CL ", nombre: "Paula", clave: "una-clave-larga-1" }, { tipo: "sistema" }, "consola"),
    );
    expect(u.email).toBe("paula@neltume.cl");
    const { rows } = await app.query("SELECT hash_password FROM usuario WHERE id = $1", [u.id]);
    expect(rows[0].hash_password).toMatch(/^\$argon2id\$/);
    expect(await verificarPassword(rows[0].hash_password, "una-clave-larga-1")).toBe(true);
    const audit = await app.query("SELECT despues FROM audit_log WHERE recurso = 'usuario' AND recurso_id = $1", [u.id]);
    expect(JSON.stringify(audit.rows[0].despues)).not.toContain("argon2");
  });

  it("rechaza correos duplicados y claves cortas", async () => {
    const crear = (email: string, clave: string) =>
      bd().transaction((tx) => crearUsuario(tx, { email, nombre: "X", clave }, { tipo: "sistema" }, "consola"));
    await expect(crear("paula@neltume.cl", "otra-clave-larga")).rejects.toThrow(/Ya existe/);
    await expect(crear("nuevo@neltume.cl", "corta12")).rejects.toThrow(/al menos 8/);
    await expect(crear("ocho@neltume.cl", "ocho1234")).resolves.toMatchObject({ email: "ocho@neltume.cl" });
  });
});
