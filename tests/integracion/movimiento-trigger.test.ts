import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";

// ADR-0002, REQ-STK-5.3: movimientos inmutables y saldo derivado.
const app = poolApp();
const owner = poolOwner();
let art: string;
let bod: string;
let usr: string;

let n = 0;
// Una puerta nueva del artículo de prueba (ADR-0018): toda entrada, salida o ajuste de un artículo mueve una puerta.
const puertaNueva = async (articulo = art) =>
  (await app.query("INSERT INTO puerta (codigo, articulo_id, ubicacion, origen) VALUES ($1, $2, 'Fábrica', 'manual') RETURNING id", [`PRU${++n}`, articulo])).rows[0].id as string;

const insertar = (tipo: string, cantidad: number, extra: { motivo?: string; mp?: boolean; puerta?: string | null } = {}) =>
  app.query(
    `INSERT INTO movimiento (bodega_id, articulo_id, materia_prima_id, puerta_id, tipo, cantidad, motivo, usuario_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [bod, extra.mp ? null : art, extra.mp ? "00000000-0000-0000-0000-000000000001" : null, extra.puerta ?? null, tipo, cantidad, extra.motivo ?? null, usr],
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
    const puertas = [];
    for (let i = 0; i < 5; i++) {
      puertas.push(await puertaNueva());
      await insertar("entrada_produccion", 1, { puerta: puertas[i] });
    }
    await insertar("reserva", 2);
    await insertar("salida_despacho", -1, { puerta: puertas[0] });
    await insertar("ajuste", -1, { motivo: "Puerta dañada", puerta: puertas[1] });
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
    const puerta = await puertaNueva();
    await expect(insertar("entrada_produccion", -1, { puerta })).rejects.toThrow(/mov_signo/);
    await expect(insertar("salida_despacho", 1, { puerta })).rejects.toThrow(/mov_signo/);
    await expect(insertar("ajuste", 1, { puerta })).rejects.toThrow(/mov_ajuste_motivo/);
    await expect(insertar("ajuste", 1, { motivo: "  ", puerta })).rejects.toThrow(/mov_ajuste_motivo/);
    await expect(insertar("reserva", 1, { mp: true })).rejects.toThrow(/mov_reserva_solo_puertas/);
    await expect(insertar("entrada_produccion", 1.5, { puerta })).rejects.toThrow(/mov_puertas_enteras|mov_puerta_unidad/);
    await expect(insertar("entrada_produccion", 0, { puerta })).rejects.toThrow(/mov_cantidad_no_cero|mov_signo|mov_puerta_unidad/);
  });

  it("toda entrada, salida o ajuste de un artículo mueve una sola puerta suya (ADR-0018, REQ-STK-8.1)", async () => {
    await expect(insertar("entrada_produccion", 1)).rejects.toThrow(/mov_articulo_por_puerta/);
    await expect(insertar("ajuste", -1, { motivo: "sin puerta" })).rejects.toThrow(/mov_articulo_por_puerta/);
    await expect(insertar("entrada_produccion", 2, { puerta: await puertaNueva() })).rejects.toThrow(/mov_puerta_unidad/);
    const otro = (await owner.query(
      "INSERT INTO articulo (codigo, modelo_id, madera_id, ancho_codigo, ancho_etiqueta, alto_codigo, alto_m) SELECT 'PRU-L-4-B', modelo_id, madera_id, '4', '0,90 a 0,95', 'B', 2.1 FROM articulo WHERE id = $1 RETURNING id", [art],
    )).rows[0].id;
    await expect(insertar("entrada_produccion", 1, { puerta: await puertaNueva(otro) })).rejects.toThrow(/mov_puerta_fk/);
  });

  it("una puerta está 0 o 1 vez en stock y solo se aparta si está (trigger diferido)", async () => {
    const p = await puertaNueva();
    await insertar("entrada_produccion", 1, { puerta: p });
    await expect(insertar("entrada_produccion", 1, { puerta: p })).rejects.toThrow(/solo se admiten 0 o 1/);
    await insertar("reserva", 1, { puerta: p });
    await expect(insertar("reserva", 1, { puerta: p })).rejects.toThrow(/solo se admiten 0 o 1/);
    const q = await puertaNueva();
    await expect(insertar("reserva", 1, { puerta: q })).rejects.toThrow(/solo se admiten 0 o 1|stock en negativo/);
  });

  it("el historial de despachos es de solo inserción (REQ-STK-10.3)", async () => {
    await app.query("INSERT INTO despacho_historico (fila, codigo, huella) VALUES (2, '202308000000001', 'h-prueba')");
    await expect(app.query("UPDATE despacho_historico SET cliente = 'x'")).rejects.toThrow(/permission denied/);
    await expect(app.query("DELETE FROM despacho_historico")).rejects.toThrow(/permission denied/);
    await expect(owner.query("UPDATE despacho_historico SET cliente = 'x'")).rejects.toThrow(/solo inserción/);
    await expect(owner.query("DELETE FROM despacho_historico")).rejects.toThrow(/solo inserción/);
  });

  it("cada movimiento es de un artículo o de una materia prima, no ambos ni ninguno", async () => {
    await expect(app.query(
      "INSERT INTO movimiento (bodega_id, tipo, cantidad, usuario_id) VALUES ($1, 'recepcion', 1, $2)", [bod, usr],
    )).rejects.toThrow(/mov_item_xor/);
  });
});
