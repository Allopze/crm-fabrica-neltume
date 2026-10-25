// Defensa en profundidad en la BD (ADR-0017, auditoría M-02): rol propio del worker de IA con permisos mínimos y
// triggers para invariantes que antes solo protegía TypeScript.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner, urlsTest } from "./bd";
import type { InterpreteIA } from "@/ai/interfaz";
import { procesarSiguiente } from "@/ai/procesar";
import { bd, cerrarBd } from "@/db/conexion";
import { urlEnlace, urlWorker } from "@/db/urls";
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
    // Las existencias de un artículo se mueven puerta por puerta (ADR-0018); la reserva de un pedido es del artículo.
    const puerta = async (codigo: string) => (await app.query(
      "INSERT INTO puerta (codigo, articulo_id, ubicacion, origen) SELECT $1, id, 'Fábrica', 'manual' FROM articulo WHERE codigo = 'LIC-L-4-B' RETURNING id", [codigo])).rows[0].id;
    const insertar = (tipo: string, cantidad: number, motivo: string | null, puertaId: string | null = null) => app.query(
      `INSERT INTO movimiento (bodega_id, articulo_id, puerta_id, tipo, cantidad, motivo, usuario_id)
       SELECT b.id, a.id, $5, $1, $2, $3, $4 FROM bodega b, articulo a WHERE a.codigo = 'LIC-L-4-B' LIMIT 1`, [tipo, cantidad, motivo, usuarioId, puertaId]);
    const [p1, p2] = [await puerta("DEF-1"), await puerta("DEF-2")];
    await expect(insertar("ajuste", -1, "saldo negativo directo", p1)).rejects.toThrow(/stock en negativo|solo se admiten 0 o 1/);
    await expect(insertar("reserva", 3, null)).rejects.toThrow(/stock en negativo/);
    await insertar("ajuste", 1, "stock inicial", p1);
    await insertar("ajuste", 1, "stock inicial", p2);
    await expect(insertar("reserva", 2, null)).resolves.toBeDefined();
    await expect(insertar("salida_despacho", -1, null, p1)).rejects.toThrow(/stock en negativo/);
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

describe("rol de BD del servicio de enlace (ADR-0024)", () => {
  const conEnlace = async (f: (enlace: Pool) => Promise<void>) => {
    const enlace = new Pool({ connectionString: urlEnlace(urlsTest.app), max: 2 });
    try { await f(enlace); } finally { await enlace.end(); }
  };
  /** Una prueba de conexión como la deja la app o la guarda la recepción; `o` cambia lo que cada caso quiere romper. */
  const nueva = (o: { direccion?: string; estado?: string; solicitud?: string | null; cabeceras?: string | null; autor?: boolean; firma?: boolean; bytes?: number; evento?: string } = {}) => owner.query(
    `INSERT INTO prueba_conexion (direccion, event_id, estado, hash_cuerpo, contenido, sha256, bytes, nombre_archivo, solicitud, cabeceras, firmada_en, creado_por)
     VALUES ($1, $2, $3, 'h', 'x'::bytea, 'x', $4, 'x.pdf', $5::bytea, $6::jsonb, $7, $8) RETURNING id`,
    [o.direccion ?? "enviada", o.evento ?? randomUUID(), o.estado ?? "pendiente", o.bytes ?? 1, o.solicitud === undefined ? "sol" : o.solicitud,
      o.cabeceras === undefined ? "{}" : o.cabeceras, o.firma === false ? null : new Date(), o.autor === false ? null : usuarioId]);

  it("no ve usuarios, clientes, stock, pedidos ni la recepción de la tienda, y de las pruebas solo lo necesario para tomar una", async () => {
    await conEnlace(async (enlace) => {
      for (const consulta of ["SELECT email FROM usuario LIMIT 1", "SELECT rut FROM cliente LIMIT 1", "SELECT * FROM movimiento LIMIT 1", "SELECT * FROM nota_pedido LIMIT 1",
        "SELECT costo_total FROM precio LIMIT 1", "SELECT * FROM sesion LIMIT 1", "SELECT * FROM recepcion_tienda LIMIT 1", "SELECT * FROM documento_tienda LIMIT 1", "SELECT * FROM audit_log LIMIT 1"]) {
        await rechaza(enlace, consulta);
      }
      for (const columna of ["contenido", "hash_cuerpo", "sha256", "bytes", "nombre_archivo", "creado_por", "destino", "detalle"]) await rechaza(enlace, `SELECT ${columna} FROM prueba_conexion LIMIT 1`);
      await expect(enlace.query("SELECT id, direccion, event_id, estado, solicitud, cabeceras, firmada_en, tomada_en, creado_en FROM prueba_conexion")).resolves.toBeDefined();
    });
  });

  it("solo escribe el resultado de una prueba: no cambia su PDF, su sentido ni su autor, no inserta ni borra, y la auditoría es de solo inserción", async () => {
    const { rows: [p] } = await nueva();
    await conEnlace(async (enlace) => {
      await rechaza(enlace, `UPDATE prueba_conexion SET contenido = 'otro'::bytea WHERE id = '${p.id}'`);
      await rechaza(enlace, `UPDATE prueba_conexion SET direccion = 'recibida' WHERE id = '${p.id}'`);
      await rechaza(enlace, `UPDATE prueba_conexion SET creado_por = NULL WHERE id = '${p.id}'`);
      await rechaza(enlace, `UPDATE prueba_conexion SET event_id = gen_random_uuid() WHERE id = '${p.id}'`);
      await rechaza(enlace, `DELETE FROM prueba_conexion WHERE id = '${p.id}'`);
      await rechaza(enlace, "INSERT INTO prueba_conexion (direccion, event_id, estado, hash_cuerpo, contenido, sha256, bytes, nombre_archivo) VALUES ('recibida', gen_random_uuid(), 'recibida', 'h', 'x'::bytea, 'x', 1, 'x.pdf')");
      await rechaza(enlace, "TRUNCATE prueba_conexion");
      await rechaza(enlace, "UPDATE audit_log SET resultado = 'ok'");
      await rechaza(enlace, "DELETE FROM audit_log");
      // Ninguna secuencia: no puede quemar los correlativos de cotizaciones, notas ni órdenes (y audit_log, identity, no la necesita).
      for (const seq of ["cotizacion_numero_seq", "nota_pedido_numero_seq", "orden_produccion_numero_seq", "lista_precio_version_seq"]) {
        await rechaza(enlace, `SELECT nextval('${seq}')`);
      }
      // Lo suyo sí: cerrar la prueba con su resultado y dejar la auditoría.
      await enlace.query(`UPDATE prueba_conexion SET estado = 'aceptada', solicitud = NULL, cabeceras = NULL, http_status = 201, detalle = 'Aceptada en 5 ms.', resuelto_en = now() WHERE id = '${p.id}'`);
      await enlace.query("INSERT INTO audit_log (actor_tipo, accion, recurso, resultado, origen) VALUES ('sistema', 'enviar prueba de conexion', 'prueba_conexion', 'ok', 'enlace')");
    });
    expect((await owner.query("SELECT estado FROM prueba_conexion WHERE id = $1", [p.id])).rows[0].estado).toBe("aceptada");
    await owner.query("DELETE FROM prueba_conexion");
  });

  it("la tabla se defiende sola: la solicitud firmada solo existe mientras la prueba espera, y cada sentido tiene su autor y su estado", async () => {
    const viola = (restriccion: string, o: Parameters<typeof nueva>[0]) => expect(nueva(o), restriccion).rejects.toThrow(new RegExp(`violates check constraint "${restriccion}"`));
    await expect(nueva()).resolves.toBeDefined(); // lo válido pasa
    await viola("prueba_solicitud", { estado: "aceptada" }); // terminada pero con la solicitud firmada
    await viola("prueba_solicitud", { solicitud: null, cabeceras: null }); // pendiente sin solicitud
    await viola("prueba_cabeceras", { cabeceras: null });
    await viola("prueba_autor", { autor: false });
    await viola("prueba_firma", { firma: false });
    await viola("prueba_estado_direccion", { direccion: "recibida", estado: "aceptada", solicitud: null, cabeceras: null, autor: false, firma: false });
    await viola("prueba_estado", { estado: "rara", solicitud: null, cabeceras: null });
    await viola("prueba_bytes", { bytes: 0 });
    // Un evento no se repite en el mismo sentido (la red de seguridad de la idempotencia).
    const evento = randomUUID();
    await nueva({ evento });
    await expect(nueva({ evento })).rejects.toThrow(/prueba_evento_unico/);
    await owner.query("DELETE FROM prueba_conexion");
  });
});
