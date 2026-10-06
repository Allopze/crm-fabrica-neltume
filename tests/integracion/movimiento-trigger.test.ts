import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";

// ADR-0002, REQ-STK-5.3: movimientos inmutables y saldo derivado.
const app = poolApp();
const owner = poolOwner();
let art: string;
let bod: string;
let usr: string;

const insertar = (tipo: string, cantidad: number, extra: { motivo?: string; mp?: boolean } = {}) =>
  app.query(
    `INSERT INTO movimiento (bodega_id, articulo_id, materia_prima_id, tipo, cantidad, motivo, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [bod, extra.mp ? null : art, extra.mp ? "00000000-0000-0000-0000-000000000001" : null, tipo, cantidad, extra.motivo ?? null, usr],
  );

beforeAll(async () => {
  const m = await owner.query("INSERT INTO modelo (nombre, codigo, familia) VALUES ('PRUEBA', 'PRU', 'puerta') RETURNING id");
  const ma = await owner.query("INSERT INTO madera (nombre, codigo) VALUES ('LENGA', 'L') ON CONFLICT (nombre) DO UPDATE SET codigo = 'L' RETURNING id");
  art = (await owner.query(
    "INSERT INTO articulo (codigo, modelo_id, madera_id, ancho_codigo, ancho_etiqueta, alto_codigo, alto_m) VALUES ('PRU-L-3-B', $1, $2, '3', '0,80 a 0,85', 'B', 2.1) RETURNING id",
    [m.rows[0].id, ma.rows[0].id],
  )).rows[0].id;
  bod = (await owner.query("SELECT id FROM bodega LIMIT 1")).rows[0].id;
  const r = (await owner.query("SELECT id FROM rol LIMIT 1")).rows[0].id;
  usr = (await owner.query("INSERT INTO usuario (email, nombre, hash_password, rol_id) VALUES ('mov@neltume.cl', 'M', 'x', $1) RETURNING id", [r])).rows[0].id;
});
afterAll(async () => { await app.end(); await owner.end(); });

describe("movimientos de inventario (ADR-0002)", () => {
  it("el saldo es la suma de movimientos: existencia, reservado y disponible", async () => {
    await insertar("entrada_produccion", 5);
    await insertar("reserva", 2);
    await insertar("salida_despacho", -1);
    await insertar("ajuste", -1, { motivo: "Puerta dañada" });
    const { rows } = await app.query("SELECT existencia::int, reservado::int, disponible::int FROM v_stock WHERE articulo_id = $1", [art]);
    expect(rows[0]).toEqual({ existencia: 3, reservado: 2, disponible: 1 });
  });

  it("nadie puede editar ni borrar movimientos (app sin permiso; dueño bloqueado por trigger)", async () => {
    await expect(app.query("UPDATE movimiento SET cantidad = 100")).rejects.toThrow(/permission denied/);
    await expect(app.query("DELETE FROM movimiento")).rejects.toThrow(/permission denied/);
    await expect(owner.query("UPDATE movimiento SET cantidad = 100")).rejects.toThrow(/solo inserción/);
    await expect(owner.query("DELETE FROM movimiento")).rejects.toThrow(/solo inserción/);
  });

  it("valida signo por tipo, motivo en ajustes, reservas solo de puertas y puertas enteras", async () => {
    await expect(insertar("entrada_produccion", -1)).rejects.toThrow(/mov_signo/);
    await expect(insertar("salida_despacho", 1)).rejects.toThrow(/mov_signo/);
    await expect(insertar("ajuste", 1)).rejects.toThrow(/mov_ajuste_motivo/);
    await expect(insertar("ajuste", 1, { motivo: "  " })).rejects.toThrow(/mov_ajuste_motivo/);
    await expect(insertar("reserva", 1, { mp: true })).rejects.toThrow(/mov_reserva_solo_puertas/);
    await expect(insertar("entrada_produccion", 1.5)).rejects.toThrow(/mov_puertas_enteras/);
    await expect(insertar("entrada_produccion", 0)).rejects.toThrow(/mov_cantidad_no_cero|mov_signo/);
  });

  it("cada movimiento es de un artículo o de una materia prima, no ambos ni ninguno", async () => {
    await expect(app.query(
      "INSERT INTO movimiento (bodega_id, tipo, cantidad, usuario_id) VALUES ($1, 'recepcion', 1, $2)", [bod, usr],
    )).rejects.toThrow(/mov_item_xor/);
  });
});
