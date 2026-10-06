import { afterAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { bd, cerrarBd } from "@/db/conexion";
import { rol, usuario } from "@/db/esquema/seguridad";
import { registrarAuditoria } from "@/domain/auditoria";

const app = poolApp();
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("auditoría en la misma transacción (REQ-ADM-3.1, 3.5; DESIGN §5)", () => {
  it("si el registro de auditoría falla, la operación se revierte", async () => {
    const [r] = await bd().select({ id: rol.id }).from(rol).limit(1);
    await expect(
      bd().transaction(async (tx) => {
        await tx.insert(usuario).values({ email: "revertido@neltume.cl", nombre: "R", hashPassword: "x", rolId: r.id });
        // resultado inválido: la restricción de audit_log hace fallar la transacción completa
        await registrarAuditoria(tx, { actor: { tipo: "sistema" }, accion: "crear", recurso: "usuario", resultado: "quizas" as "ok", origen: "consola" });
      }),
    ).rejects.toThrow();
    const { rowCount } = await app.query("SELECT 1 FROM usuario WHERE email = 'revertido@neltume.cl'");
    expect(rowCount).toBe(0);
  });

  it("nunca guarda contraseñas, hashes ni tokens en antes/después, aunque vengan anidados", async () => {
    await registrarAuditoria(bd(), {
      actor: { tipo: "sistema" }, accion: "prueba", recurso: "sensibles", resultado: "ok", origen: "consola",
      antes: { hashPassword: "$argon2id$x", nombre: "A" },
      despues: { usuario: { clave: "secreta", tokenHash: "abc", email: "a@b.cl" }, lista: [{ password: "p" }] },
    });
    const { rows } = await app.query("SELECT antes, despues FROM audit_log WHERE recurso = 'sensibles'");
    expect(rows[0].antes).toEqual({ nombre: "A" });
    expect(rows[0].despues).toEqual({ usuario: { email: "a@b.cl" }, lista: [{}] });
  });
});
