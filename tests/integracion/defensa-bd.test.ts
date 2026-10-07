// Defensa en profundidad en la BD (ADR-0017, auditoría M-02): rol propio del worker de IA con permisos mínimos y
// triggers para invariantes que antes solo protegía TypeScript.
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner, urlsTest } from "./bd";
import type { InterpreteIA } from "@/ai/interfaz";
import { procesarSiguiente } from "@/ai/procesar";
import { bd, cerrarBd } from "@/db/conexion";
import { urlWorker } from "@/db/urls";
import { crearInterpretacion } from "@/domain/cotizaciones/interpretacion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
const worker = new Pool({ connectionString: urlWorker(urlsTest.app), max: 2 });
let usuarioId: string;

beforeAll(async () => {
  usuarioId = (await bd().transaction((tx) => crearUsuario(tx, { email: "defensa@neltume.cl", nombre: "D", clave: "clave-defensa" }, { tipo: "sistema" }, "consola"))).id;
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: usuarioId });
});
afterAll(async () => { await app.end(); await owner.end(); await worker.end(); await cerrarBd(); });

const rechaza = async (p: Pool, consulta: string) => {
  await expect(p.query(consulta), consulta).rejects.toThrow(/permission denied|solo inserción|solo lectura/);
};

describe("rol de BD del worker de IA (ADR-0017)", () => {
  it("no ve usuarios, clientes, stock ni costos, y no puede cambiar permisos", async () => {
    await rechaza(worker, "SELECT email FROM usuario LIMIT 1");
    await rechaza(worker, "SELECT rut FROM cliente LIMIT 1");
    await rechaza(worker, "SELECT * FROM movimiento LIMIT 1");
    await rechaza(worker, "SELECT costo_total FROM precio LIMIT 1");
    await rechaza(worker, "SELECT margen FROM precio LIMIT 1");
    await rechaza(worker, "INSERT INTO rol_permiso (rol_id, permiso_codigo) SELECT id, 'usuarios.gestionar' FROM rol LIMIT 1");
    await rechaza(worker, "SELECT * FROM sesion LIMIT 1");
    expect((await worker.query("SELECT precio_neto FROM precio LIMIT 1")).rowCount).toBe(1);
  });

  it("con esos permisos interpreta un pedido de punta a punta", async () => {
    const c = await bd().transaction((tx) => crearInterpretacion(tx, { texto: "3 puertas Neltume en raulí de 90x210" }, { tipo: "usuario", id: usuarioId }, "web"));
    // Desde aquí, el proceso usa el rol del worker, como en Compose.
    await cerrarBd();
    const urlApp = process.env.DATABASE_URL;
    process.env.DATABASE_URL = urlWorker(urlsTest.app);
    try {
      // Un ítem real: el worker lee catálogo y precio neto, y escribe ítem, totales, llamada y auditoría.
      const ia: InterpreteIA = {
        nombre: "doble",
        interpretar: async () => ({
          propuesta: { items: [{ texto_fuente: "3 puertas Neltume en raulí de 90x210", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [] }], alertas: [], sin_items: false },
          proveedor: "doble", latenciaMs: 1, costoUsd: 0.001,
        }),
      };
      expect(await procesarSiguiente(ia, { esperasMs: [1, 1] })).toBe("listo");
    } finally {
      await cerrarBd();
      process.env.DATABASE_URL = urlApp;
    }
    const { rows: [cot] } = await app.query("SELECT estado FROM cotizacion WHERE id = $1", [c.id]);
    expect(cot.estado).toBe("borrador");
    const { rows: items } = await app.query("SELECT estado_item, precio_unitario FROM cotizacion_item WHERE cotizacion_id = $1", [c.id]);
    expect(items).toHaveLength(1);
    expect(items[0].estado_item).toBe("ok");
    expect(Number(items[0].precio_unitario)).toBeGreaterThan(0);
    expect((await app.query("SELECT count(*)::int AS n FROM audit_log WHERE recurso_id = $1 AND actor_tipo = 'worker'", [c.id])).rows[0].n).toBe(1);
  });
});

describe("invariantes en la BD (ADR-0017)", () => {
  it("llamada_ia es de solo inserción, también para el dueño", async () => {
    await rechaza(app, "UPDATE llamada_ia SET resultado = 'x'");
    await rechaza(app, "DELETE FROM llamada_ia");
    await rechaza(owner, "DELETE FROM llamada_ia");
  });

  it("un movimiento que deja el stock en negativo se rechaza al confirmar, aunque salte el código", async () => {
    const insertar = (tipo: string, cantidad: number, motivo: string | null) => app.query(
      `INSERT INTO movimiento (bodega_id, articulo_id, tipo, cantidad, motivo, usuario_id)
       SELECT b.id, a.id, $1, $2, $3, $4 FROM bodega b, articulo a WHERE a.codigo = 'LIC-L-4-B' LIMIT 1`, [tipo, cantidad, motivo, usuarioId]);
    await expect(insertar("ajuste", -5, "saldo negativo directo")).rejects.toThrow(/stock en negativo/);
    await expect(insertar("reserva", 3, null)).rejects.toThrow(/stock en negativo/);
    await insertar("ajuste", 2, "stock inicial");
    await expect(insertar("reserva", 2, null)).resolves.toBeDefined();
    await expect(insertar("salida_despacho", -1, null)).rejects.toThrow(/stock en negativo/);
  });

  it("una nota de pedido despachada o cancelada y sus ítems no cambian", async () => {
    const { rows: [cli] } = await app.query("INSERT INTO cliente (nombre, rut, tipo) VALUES ('Tienda', '11111111-1', 'tienda') RETURNING id");
    const { rows: [p] } = await app.query(
      "INSERT INTO nota_pedido (cliente_id, origen, ref_externa, archivo_hash, estado, motivo_cancelacion, creado_por) VALUES ($1, 'nota_tienda', 'N1', 'h1', 'cancelada', 'prueba', $2) RETURNING id",
      [cli.id, usuarioId]);
    await rechaza(app, `UPDATE nota_pedido SET estado = 'pendiente' WHERE id = '${p.id}'`);
    await rechaza(app, `DELETE FROM nota_pedido WHERE id = '${p.id}'`);
    await rechaza(app, `INSERT INTO pedido_item (nota_pedido_id, orden, descripcion, cantidad, reservado, faltante, precio_unitario, total_linea) VALUES ('${p.id}', 1, 'x', 1, 0, 1, 1, 1)`);
  });
});
