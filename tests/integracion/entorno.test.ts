import { afterAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";

const app = poolApp();
afterAll(() => app.end());

describe("entorno de BD local (T0.4)", () => {
  it("la app se conecta a la base de test recreada", async () => {
    const { rows } = await app.query("SELECT current_database() AS base, current_user AS rol");
    expect(rows[0]).toEqual({ base: "neltume_test", rol: "neltume_app" });
  });

  it("el rol de la app no puede crear tablas", async () => {
    await expect(app.query("CREATE TABLE intruso (id int)")).rejects.toThrow(/permission denied|permiso denegado/);
  });
});
