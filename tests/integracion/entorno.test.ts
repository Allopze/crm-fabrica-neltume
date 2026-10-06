import { afterAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";

const app = poolApp();
afterAll(() => app.end());

describe("entorno de BD local (T0.4)", () => {
  it("cada archivo usa su propia copia de la base de test", async () => {
    const { rows } = await app.query("SELECT current_database() AS base, current_user AS rol");
    expect(rows[0]).toMatchObject({ rol: "neltume_app" });
    expect(rows[0].base).toMatch(/^neltume_t_[0-9a-f]{10}$/);
  });

  it("el rol de la app no puede crear tablas", async () => {
    await expect(app.query("CREATE TABLE intruso (id int)")).rejects.toThrow(/permission denied|permiso denegado/);
  });
});
