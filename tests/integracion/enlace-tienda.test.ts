import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolOwner } from "./bd";
import { configurarIntegracion } from "./tienda";
import { registrarResultado, tomarPrueba } from "@/enlace/cola";
import { configEnlace, enviarPrueba } from "@/enlace/envio";
import { bd, cerrarBd, esquema } from "@/db/conexion";
import { urlEnlace } from "@/db/urls";
import { armarPruebaSaliente } from "@/domain/integracion-tienda/conexion";
import { solicitarPruebaEnviada } from "@/domain/integracion-tienda/conexion-datos";
import { crearUsuario } from "@/domain/usuarios";
import { pdf, SECRETO_PRUEBA } from "../fixtures/tienda/mensaje";
import { crearTiendaSimulada, type ModoTienda } from "../fixtures/tienda/simulada";

// Servicio de enlace con la tienda (ADR-0024, REQ-ADM-5.1, 5.4): toma la prueba que la app dejó firmada, la envía a una
// tienda simulada y deja su resultado, con el rol `neltume_enlace` y sin conocer el secreto de la integración.
const owner = poolOwner();
const poolEnlace = new Pool({ connectionString: urlEnlace(process.env.DATABASE_URL), max: 3 });
const bdEnlace = drizzle(poolEnlace, { schema: esquema, casing: "snake_case" });
const filas = async (sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows;
let tienda: Awaited<ReturnType<typeof crearTiendaSimulada>>;
let adminId: string;
let contenido: Buffer;
const cfgTienda = (ms = 1_500) => configEnlace({ ENLACE_TIENDA_URL: tienda.base, ENLACE_TIENDA_TIMEOUT_MS: String(ms) } as unknown as NodeJS.ProcessEnv);

/** La app deja una prueba firmada (como el botón); `ahora` permite una firma antigua. */
async function encolar(ahora = new Date()) {
  const prueba = armarPruebaSaliente({ secreto: SECRETO_PRUEBA, fabrica: "PANGUIPULLI", pdf: contenido, ahora });
  const { id } = await bd().transaction((tx) => solicitarPruebaEnviada(tx, { actor: { tipo: "usuario", id: adminId }, prueba, pdf: contenido }));
  return { id, prueba };
}
const fila = async (id: string) => (await filas("SELECT * FROM prueba_conexion WHERE id = $1", [id]))[0];
const auditoria = async (id: string) => (await filas("SELECT * FROM audit_log WHERE recurso = 'prueba_conexion' AND recurso_id = $1 AND accion = 'enviar prueba de conexion'", [id]))[0];

/** Un ciclo del servicio: toma la prueba, la envía y registra el resultado. */
async function ciclo(modo: ModoTienda, cfg = cfgTienda()) {
  tienda.control.modo = modo;
  const { id, prueba } = await encolar();
  const tomada = await tomarPrueba(bdEnlace);
  expect(tomada?.id).toBe(id);
  const r = await enviarPrueba(cfg, tomada!);
  await registrarResultado(bdEnlace, tomada!, r);
  return { id, prueba, r, f: await fila(id) };
}

beforeAll(async () => {
  configurarIntegracion();
  adminId = (await bd().transaction((tx) => crearUsuario(tx, { email: "enlace-admin@neltume.cl", nombre: "Admin", clave: "clave-admin-1" }, { tipo: "sistema" }, "consola"))).id;
  contenido = await pdf(["Prueba de conexión", "PRUEBA DE CONEXIÓN — no es un pedido"]);
  tienda = await crearTiendaSimulada();
});
afterAll(async () => { await tienda.cerrar(); await poolEnlace.end(); await owner.end(); await cerrarBd(); });

describe("el envío a la tienda (ADR-0024 §3)", () => {
  it("reenvía los mismos bytes firmados que dejó la app: la tienda los verifica y la prueba queda aceptada, sin la solicitud firmada", async () => {
    tienda.control.recibidas.length = 0;
    const { id, prueba, r, f } = await ciclo("ok");
    expect(r).toMatchObject({ estado: "aceptada", httpStatus: 201, codigoError: null, destino: new URL(tienda.base).host });
    expect(f).toMatchObject({ estado: "aceptada", http_status: 201, codigo_error: null, solicitud: null, cabeceras: null, destino: new URL(tienda.base).host });
    expect(f.detalle).toMatch(/^Aceptada en [\d.]+ ms\.$/);
    expect(f.latencia_ms).toBeGreaterThanOrEqual(0);
    expect(f.resuelto_en).not.toBeNull();
    // Lo que llegó a la tienda: exactamente los bytes firmados, con su firma y su clave de idempotencia.
    const [recibida] = tienda.control.recibidas;
    expect(Buffer.from(recibida.cuerpo).equals(Buffer.from(prueba.cuerpo))).toBe(true);
    expect(recibida).toMatchObject({ firmaValida: true, mensaje: { eventId: prueba.eventId, source: "neltume-factory", factoryCode: "PANGUIPULLI" } });
    expect(recibida.cabeceras).toMatchObject({ "content-type": "application/json", "x-idempotency-key": prueba.cabeceras["x-idempotency-key"], "x-neltume-signature": prueba.cabeceras["x-neltume-signature"] });
    // La auditoría de lo que hizo el servicio, sin el PDF, la firma ni el secreto.
    expect(await auditoria(id)).toMatchObject({ actor_tipo: "sistema", actor_id: null, resultado: "ok", origen: "enlace" });
    expect((await auditoria(id)).despues).toMatchObject({ estado: "aceptada", httpStatus: 201, destino: new URL(tienda.base).host, codigo: prueba.eventId.slice(0, 8) });
    expect(JSON.stringify(await filas("SELECT * FROM audit_log WHERE recurso = 'prueba_conexion'"))).not.toContain(SECRETO_PRUEBA);
  });

  it("un 200 duplicate también cuenta como entregada", async () => {
    expect((await ciclo("duplicado")).f).toMatchObject({ estado: "duplicada", http_status: 200 });
  });

  it("explica cada fallo de la tienda con el texto acordado y lo audita como error", async () => {
    const casos: [ModoTienda, string, string, RegExp][] = [
      ["401", "rechazada", "invalid_signature", /La tienda rechazó la firma: el secreto no coincide o los relojes difieren en más de 5 minutos/],
      ["403", "rechazada", "forbidden", /La tienda rechazó el acceso \(403\): revisa el Host permitido o el acceso por Cloudflare/],
      ["404", "rechazada", "not_found", /La tienda aún no tiene esta ruta \(versión sin desplegar\)/],
      ["405", "rechazada", "method_not_allowed", /La tienda aún no tiene esta ruta/],
      ["503", "rechazada", "not_configured", /La tienda no tiene configurada la integración/],
      ["400", "rechazada", "schema_invalid", /rechazó la prueba \(400\): schema_invalid/],
      ["409", "rechazada", "idempotency_conflict", /rechazó la prueba \(409\): idempotency_conflict/],
      ["413", "rechazada", "payload_too_large", /rechazó la prueba \(413\): payload_too_large/],
      ["415", "rechazada", "unsupported_media_type", /rechazó la prueba \(415\): unsupported_media_type/],
      ["422", "rechazada", "document_invalid", /rechazó la prueba \(422\): document_invalid/],
      ["429", "rechazada", "rate_limited", /La tienda respondió 429/],
      ["500", "rechazada", "http_500", /La tienda respondió 500/],
      ["otra_app", "rechazada", "otra_aplicacion", /^Respondió otra aplicación$/],
      ["otro_evento", "rechazada", "otra_aplicacion", /^Respondió otra aplicación$/],
      ["ilegible", "rechazada", "otra_aplicacion", /^Respondió otra aplicación$/],
      ["enorme", "rechazada", "otra_aplicacion", /^Respondió otra aplicación$/], // la respuesta se corta a los 64 KB
    ];
    for (const [modo, estado, codigo, detalle] of casos) {
      const { id, f } = await ciclo(modo);
      expect(f, modo).toMatchObject({ estado, codigo_error: codigo, solicitud: null, cabeceras: null });
      expect(f.detalle, modo).toMatch(detalle);
      expect(await auditoria(id), modo).toMatchObject({ resultado: "error", origen: "enlace" });
    }
  });

  it("avisa si el reloj de la tienda difiere más de 60 s, sin fallar", async () => {
    const { f } = await ciclo("reloj");
    expect(f).toMatchObject({ estado: "aceptada" });
    expect(f.desfase_reloj_ms).toBeGreaterThan(290_000);
    expect(f.detalle).toMatch(/Aviso: el reloj de la tienda difiere 30\d s del nuestro/);
  });

  it("una respuesta con datos que no caben en la BD se guarda igual, acotada y saneada, y la prueba no queda colgada", async () => {
    const reloj = await ciclo("reloj_absurdo");
    expect(reloj.f).toMatchObject({ estado: "aceptada", desfase_reloj_ms: 2_000_000_000, solicitud: null, cabeceras: null });
    expect(reloj.f.detalle).toMatch(/Aviso: el reloj de la tienda difiere 2\.000\.000 s/);
    const codigo = await ciclo("codigo_raro");
    expect(codigo.f).toMatchObject({ estado: "rechazada", codigo_error: "http_422", solicitud: null });
    expect(codigo.f.detalle).toBe("La tienda rechazó la prueba (422): sin código — x y");
    expect(await auditoria(codigo.id)).toMatchObject({ resultado: "error", origen: "enlace" });
  });

  it("una redirección no se sigue: «redirección inesperada», sin respuesta", async () => {
    const { f } = await ciclo("redireccion");
    expect(f).toMatchObject({ estado: "sin_respuesta", codigo_error: "redirect", http_status: null });
    expect(f.detalle).toBe("No se pudo conectar: redirección inesperada (¿Cloudflare Access?)");
  });

  it("si la tienda no contesta a tiempo, «sin respuesta en N ms»", async () => {
    const { f } = await ciclo("colgar", cfgTienda(1_000));
    expect(f).toMatchObject({ estado: "sin_respuesta", codigo_error: "timeout" });
    expect(f.detalle).toBe("No se pudo conectar con la tienda: sin respuesta en 1.000 ms");
  });

  it("un 201 cuyo cuerpo no termina de llegar es un fallo de red, no «otra aplicación»", async () => {
    // Se cuelga a mitad del cuerpo: el plazo vence mientras se lee la respuesta.
    const lento = await ciclo("cuerpo_lento", cfgTienda(1_000));
    expect(lento.f).toMatchObject({ estado: "sin_respuesta", codigo_error: "timeout", http_status: null });
    expect(lento.f.detalle).toBe("No se pudo conectar con la tienda: sin respuesta en 1.000 ms");
    // La conexión se corta a mitad del cuerpo: tampoco es una confirmación ni otra aplicación.
    const cortado = await ciclo("cuerpo_cortado");
    expect(cortado.f).toMatchObject({ estado: "sin_respuesta", codigo_error: "network", http_status: null });
    expect(cortado.f.detalle).toMatch(/^No se pudo conectar con la tienda: /);
    expect(cortado.f.detalle).not.toMatch(/otra aplicación/);
  });

  it("si nadie escucha en esa dirección, «conexión rechazada»", async () => {
    const cerrado = createServer();
    await new Promise<void>((ok) => cerrado.listen(0, "127.0.0.1", ok));
    const puerto = (cerrado.address() as AddressInfo).port;
    await new Promise<void>((ok) => cerrado.close(() => ok()));
    const cfg = configEnlace({ ENLACE_TIENDA_URL: `http://127.0.0.1:${puerto}` } as unknown as NodeJS.ProcessEnv);
    const { f } = await ciclo("ok", cfg);
    expect(f).toMatchObject({ estado: "sin_respuesta", codigo_error: "connection_refused", destino: `127.0.0.1:${puerto}` });
    expect(f.detalle).toBe("No se pudo conectar con la tienda: conexión rechazada");
  });

  it("sin ENLACE_TIENDA_URL (o con una no permitida) queda «sin configurar» y ni se intenta la llamada", async () => {
    const antes = tienda.control.peticiones;
    for (const url of [undefined, "http://tienda.example.cl", "https://tienda.example.cl/api"]) {
      const cfg = configEnlace((url ? { ENLACE_TIENDA_URL: url } : {}) as unknown as NodeJS.ProcessEnv);
      const { f } = await ciclo("ok", cfg);
      expect(f, String(url)).toMatchObject({ estado: "no_configurada", codigo_error: "no_configurada", destino: null, http_status: null });
      expect(f.detalle).toMatch(/ENLACE_TIENDA_URL/);
    }
    expect(tienda.control.peticiones).toBe(antes);
  });
});

describe("la cola del servicio (ADR-0024 §3)", () => {
  it("una firma de más de 4 minutos no se envía: queda vencida y se audita", async () => {
    const antes = tienda.control.peticiones;
    const { id } = await encolar(new Date(Date.now() - 5 * 60_000));
    expect(await tomarPrueba(bdEnlace)).toBeNull();
    expect(await fila(id)).toMatchObject({ estado: "vencida", codigo_error: "vencida", solicitud: null, cabeceras: null });
    expect((await fila(id)).detalle).toMatch(/más de 4 minutos/);
    expect(await auditoria(id)).toMatchObject({ resultado: "error", origen: "enlace" });
    expect(tienda.control.peticiones).toBe(antes);
  });

  it("lo que quedó «enviando» de un servicio caído pasa a «sin respuesta» y nunca se reenvía solo", async () => {
    const antes = tienda.control.peticiones;
    const { id } = await encolar();
    expect((await tomarPrueba(bdEnlace))?.id).toBe(id);
    expect(await fila(id)).toMatchObject({ estado: "enviando" });
    // Mientras corre el plazo normal sigue «enviando»; pasado un minuto, el servicio lo da por interrumpido.
    expect(await tomarPrueba(bdEnlace)).toBeNull();
    expect(await fila(id)).toMatchObject({ estado: "enviando" });
    await owner.query("UPDATE prueba_conexion SET tomada_en = now() - interval '2 minutes' WHERE id = $1", [id]);
    expect(await tomarPrueba(bdEnlace)).toBeNull();
    expect(await fila(id)).toMatchObject({ estado: "sin_respuesta", codigo_error: "interrumpida", solicitud: null, cabeceras: null });
    expect(await auditoria(id)).toMatchObject({ resultado: "error", origen: "enlace" });
    expect(tienda.control.peticiones).toBe(antes);
  });

  it("dos servicios a la vez no toman la misma prueba", async () => {
    const { id } = await encolar();
    const tomadas = await Promise.all([tomarPrueba(bdEnlace), tomarPrueba(bdEnlace), tomarPrueba(bdEnlace)]);
    expect(tomadas.filter(Boolean).map((t) => t!.id)).toEqual([id]);
    await owner.query("UPDATE prueba_conexion SET estado = 'aceptada', solicitud = NULL, cabeceras = NULL, resuelto_en = now() WHERE id = $1", [id]);
  });

  it("solo toma pruebas enviadas: una recibida de la tienda no se reenvía", async () => {
    await owner.query(
      `INSERT INTO prueba_conexion (direccion, event_id, estado, hash_cuerpo, contenido, sha256, bytes, nombre_archivo)
       VALUES ('recibida', gen_random_uuid(), 'recibida', 'h', $1, 'x', 1, 'x.pdf')`, [contenido]);
    expect(await tomarPrueba(bdEnlace)).toBeNull();
  });
});
