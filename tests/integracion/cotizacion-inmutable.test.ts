import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";

// REQ-COT-6.1, 6.2, 6.5: aprobada = solo lectura; solo puede pasar a aceptada.
const app = poolApp();
let cot: string;

beforeAll(async () => {
  const rol = (await app.query("SELECT id FROM rol LIMIT 1")).rows[0].id;
  const u = (await app.query("INSERT INTO usuario (email, nombre, hash_password, rol_id) VALUES ('cot@neltume.cl', 'C', 'x', $1) RETURNING id", [rol])).rows[0].id;
  cot = (await app.query("INSERT INTO cotizacion (estado, origen, creado_por) VALUES ('borrador', 'manual', $1) RETURNING id", [u])).rows[0].id;
  await app.query("INSERT INTO cotizacion_item (cotizacion_id, orden, descripcion, cantidad, estado_item, precio_unitario, total_linea) VALUES ($1, 1, 'Puerta', 2, 'ok', 1000, 2000)", [cot]);
});
afterAll(() => app.end());

describe("cotización inmutable desde aprobada (REQ-COT-6.2, 6.5)", () => {
  it("un ítem ok exige precio y total = cantidad × unitario", async () => {
    await expect(app.query("INSERT INTO cotizacion_item (cotizacion_id, orden, descripcion, cantidad, estado_item, precio_unitario, total_linea) VALUES ($1, 2, 'X', 2, 'ok', 1000, 1999)", [cot]))
      .rejects.toThrow(/item_ok_con_precio/);
  });

  it("en borrador se puede editar; aprobada ya no, ni sus ítems", async () => {
    await app.query("UPDATE cotizacion SET total = 2380, estado = 'aprobada' WHERE id = $1", [cot]);
    await expect(app.query("UPDATE cotizacion SET total = 1 WHERE id = $1", [cot])).rejects.toThrow(/solo lectura/);
    await expect(app.query("UPDATE cotizacion_item SET cantidad = 5 WHERE cotizacion_id = $1", [cot])).rejects.toThrow(/solo lectura/);
    await expect(app.query("INSERT INTO cotizacion_item (cotizacion_id, orden, descripcion, cantidad, estado_item) VALUES ($1, 3, 'X', 1, 'por_confirmar')", [cot])).rejects.toThrow(/solo lectura/);
    await expect(app.query("DELETE FROM cotizacion WHERE id = $1", [cot])).rejects.toThrow(/no se puede borrar/);
  });

  it("solo permite pasar de aprobada a aceptada sin tocar nada más", async () => {
    await expect(app.query("UPDATE cotizacion SET estado = 'aceptada', total = 9 WHERE id = $1", [cot])).rejects.toThrow(/solo lectura/);
    await app.query("UPDATE cotizacion SET estado = 'aceptada', actualizado_en = now(), version = version + 1 WHERE id = $1", [cot]);
    await expect(app.query("UPDATE cotizacion SET estado = 'borrador' WHERE id = $1", [cot])).rejects.toThrow(/solo lectura/);
  });
});
