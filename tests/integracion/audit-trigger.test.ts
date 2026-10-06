import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";

// REQ-ADM-3.3: el registro de auditoría no se puede editar ni borrar, ni siquiera por el dueño.
const app = poolApp();
const owner = poolOwner();
let id: number;

beforeAll(async () => {
  const { rows } = await app.query(
    `INSERT INTO audit_log (actor_tipo, accion, recurso, resultado, origen) VALUES ('sistema', 'prueba', 'test', 'ok', 'web') RETURNING id`,
  );
  id = rows[0].id;
});
afterAll(async () => {
  await app.end();
  await owner.end();
});

describe("audit_log de solo inserción (REQ-ADM-3.3)", () => {
  it("la app puede insertar y leer", async () => {
    const { rowCount } = await app.query("SELECT 1 FROM audit_log WHERE id = $1", [id]);
    expect(rowCount).toBe(1);
  });

  it("la app no tiene permiso de UPDATE ni DELETE", async () => {
    await expect(app.query("UPDATE audit_log SET accion = 'x' WHERE id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(app.query("DELETE FROM audit_log WHERE id = $1", [id])).rejects.toThrow(/permission denied/);
  });

  it("el trigger lo impide también al dueño del esquema", async () => {
    await expect(owner.query("UPDATE audit_log SET accion = 'x' WHERE id = $1", [id])).rejects.toThrow(/solo inserción/);
    await expect(owner.query("DELETE FROM audit_log WHERE id = $1", [id])).rejects.toThrow(/solo inserción/);
    await expect(owner.query("TRUNCATE audit_log")).rejects.toThrow(/solo inserción/);
  });

  it("rechaza resultados fuera de ok, denegado o error", async () => {
    await expect(
      app.query(`INSERT INTO audit_log (actor_tipo, accion, recurso, resultado, origen) VALUES ('sistema', 'p', 't', 'quizas', 'web')`),
    ).rejects.toThrow(/audit_resultado/);
  });
});
