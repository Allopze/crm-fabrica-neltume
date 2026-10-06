import { afterAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";

const app = poolApp();
const owner = poolOwner();
afterAll(async () => { await app.end(); await owner.end(); });

describe("catálogo y precios: migración y referencia (T1.1–T1.2)", () => {
  it("siembra bodega, tipos, 9 rangos de ancho, 7 altos, parámetros y feriados", async () => {
    const n = async (t: string) => (await app.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    expect(await n("bodega")).toBe(1);
    expect(await n("tipo_puerta")).toBe(3);
    expect(await n("rango_ancho")).toBe(9);
    expect(await n("alto")).toBe(7);
    expect(await n("feriado")).toBeGreaterThanOrEqual(15);
    const { rows } = await app.query("SELECT valor FROM parametro WHERE clave = 'vigencia_dias_habiles'");
    expect(rows[0].valor).toBe(10);
  });

  it("los precios son de solo inserción, incluso para el dueño", async () => {
    await expect(app.query("UPDATE precio SET precio_neto = 1")).rejects.toThrow(/permission denied/);
    await expect(owner.query("UPDATE precio SET precio_neto = 1")).resolves.toBeDefined(); // sin filas: no dispara
    await expect(owner.query("TRUNCATE precio")).rejects.toThrow(/solo inserción/);
  });

  it("solo puede haber una lista vigente", async () => {
    await owner.query("INSERT INTO lista_precio (origen, descripcion, vigente) VALUES ('excel', 'a', true)");
    await expect(owner.query("INSERT INTO lista_precio (origen, descripcion, vigente) VALUES ('excel', 'b', true)")).rejects.toThrow(/lista_una_vigente/);
    await owner.query("DELETE FROM lista_precio");
  });
});
