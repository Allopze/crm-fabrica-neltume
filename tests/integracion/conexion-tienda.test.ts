import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolOwner } from "./bd";
import { llamar } from "./http";
import { configurarIntegracion, idem, sesionDe, type Sesion } from "./tienda";
import * as rutaRecepcion from "@/app/api/integrations/neltume/connection-tests/route";
import * as rutaPruebas from "@/app/api/v1/integracion/tienda/pruebas/route";
import * as rutaPrueba from "@/app/api/v1/integracion/tienda/pruebas/[id]/route";
import * as rutaPdf from "@/app/api/v1/integracion/tienda/pruebas/[id]/pdf/route";
import { bd, cerrarBd } from "@/db/conexion";
import { armarPruebaSaliente, MAX_PDF_PRUEBA, mensajePruebaEnviada } from "@/domain/integracion-tienda/conexion";
import { solicitarPruebaEnviada } from "@/domain/integracion-tienda/conexion-datos";
import { verificarFirma } from "@/domain/integracion-tienda/firma";
import { fragmentosPdf } from "@/domain/pedidos/pdf-texto";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";
import { cabecerasFirmadas, pdf, SECRETO_PRUEBA } from "../fixtures/tienda/mensaje";
import { clavePruebaTienda, mensajePruebaTienda } from "../fixtures/tienda/prueba-conexion";

// Prueba de conexión con la tienda (ADR-0024, REQ-ADM-5.1–5.4): la ruta firmada que recibe, las rutas de la app, la
// retención de 20 por sentido y la auditoría. El servicio de enlace se prueba aparte (enlace-tienda).
const owner = poolOwner();
const sistema = { tipo: "sistema" as const };
const filas = async (sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows;
const contar = async (tabla: string, donde = "true") => Number((await filas(`SELECT count(*) AS n FROM ${tabla} WHERE ${donde}`))[0].n);
const RUTA = "/api/integrations/neltume/connection-tests";
let admin: Sesion;
let adminId: string;
let sinPermiso: Sesion;
let ipN = 0;

/** POST firmado a la ruta de recepción, como la tienda: bytes exactos y cabeceras propias (o las que se pasen). */
async function recibir(mensaje: object, o: { cuerpo?: Uint8Array; cabeceras?: Record<string, string>; ahora?: number; secreto?: string; clave?: string; ip?: string } = {}) {
  const cuerpo = o.cuerpo ?? new TextEncoder().encode(JSON.stringify(mensaje));
  const cabeceras = o.cabeceras ?? cabecerasFirmadas(cuerpo, o.clave ?? clavePruebaTienda(mensaje as { eventId: string }), { ahora: o.ahora, secreto: o.secreto });
  const req = new NextRequest(new URL(RUTA, "http://localhost"), {
    method: "POST", body: new Uint8Array(cuerpo), headers: { "user-agent": "tienda-prueba", "x-forwarded-for": o.ip ?? `10.52.0.${++ipN}`, ...cabeceras },
  });
  const res = await rutaRecepcion.POST(req, { params: Promise.resolve({} as never) });
  return { estado: res.status, cuerpo: await res.json() };
}
const limpiar = () => owner.query("DELETE FROM prueba_conexion");

beforeAll(async () => {
  configurarIntegracion();
  adminId = (await bd().transaction((tx) => crearUsuario(tx, { email: "conexion-admin@neltume.cl", nombre: "Admin", clave: "clave-admin-1" }, sistema, "consola"))).id;
  const rol = await bd().transaction((tx) => crearRol(tx, "solo stock conexion", ["stock.ver"], sistema, "consola"));
  await bd().transaction((tx) => crearUsuario(tx, { email: "conexion-stock@neltume.cl", nombre: "Stock", clave: "clave-stock-1", rolId: rol.id }, sistema, "consola"));
  admin = await sesionDe("conexion-admin@neltume.cl", "clave-admin-1", "10.51.0.1");
  sinPermiso = await sesionDe("conexion-stock@neltume.cl", "clave-stock-1", "10.51.0.2");
});
afterAll(async () => { await owner.end(); await cerrarBd(); });

describe("POST /api/integrations/neltume/connection-tests: recepción (contrato prueba-conexion-v1, REQ-ADM-5.2)", () => {
  it("201 con su identidad; guarda el PDF y la auditoría, y no crea notas, reservas ni movimientos", async () => {
    await limpiar();
    const antes = { notas: await contar("nota_pedido"), recepciones: await contar("recepcion_tienda"), movimientos: await contar("movimiento"), cotizaciones: await contar("cotizacion") };
    const m = await mensajePruebaTienda();
    const r = await recibir(m);
    expect(r).toMatchObject({ estado: 201, cuerpo: { status: "accepted", eventId: m.eventId, receiver: "neltume-factory" } });
    expect(Math.abs(Date.parse(r.cuerpo.receivedAt) - Date.now())).toBeLessThan(10_000);

    const [fila] = await filas("SELECT * FROM prueba_conexion");
    expect(fila).toMatchObject({ direccion: "recibida", estado: "recibida", event_id: m.eventId, sha256: m.document.sha256, nombre_archivo: m.document.filename, solicitud: null, cabeceras: null, creado_por: null, firmada_en: null });
    expect(Buffer.from(fila.contenido).toString("base64")).toBe(m.document.contentBase64);
    expect(fila.bytes).toBe(Buffer.from(m.document.contentBase64, "base64").length);
    expect(fila.hash_cuerpo).toBe(createHash("sha256").update(JSON.stringify(m)).digest("hex"));

    const [a] = await filas("SELECT * FROM audit_log WHERE accion = 'recibir prueba de conexion'");
    expect(a).toMatchObject({ actor_tipo: "sistema", actor_id: null, recurso: "prueba_conexion", recurso_id: fila.id, resultado: "ok", origen: "api" });
    expect(a.despues).toMatchObject({ eventId: m.eventId, archivo: m.document.filename, sha256: m.document.sha256 });
    expect(JSON.stringify(a)).not.toContain(m.document.contentBase64.slice(0, 40));
    expect(JSON.stringify(a)).not.toContain(SECRETO_PRUEBA);

    // Una prueba no toca los pedidos: ninguna fila nueva en lo que sí crea una nota real.
    expect({ notas: await contar("nota_pedido"), recepciones: await contar("recepcion_tienda"), movimientos: await contar("movimiento"), cotizaciones: await contar("cotizacion") }).toEqual(antes);
  });

  it("un reintento con el mismo contenido es 200 duplicate sin duplicar ni auditar de nuevo; con otro contenido, 409", async () => {
    await limpiar();
    const m = await mensajePruebaTienda();
    expect((await recibir(m)).estado).toBe(201);
    const auditorias = await contar("audit_log", "accion = 'recibir prueba de conexion'");
    expect(await recibir(m)).toMatchObject({ estado: 200, cuerpo: { status: "duplicate", eventId: m.eventId, receiver: "neltume-factory" } });
    expect(await contar("prueba_conexion")).toBe(1);
    expect(await contar("audit_log", "accion = 'recibir prueba de conexion'")).toBe(auditorias);
    // El mismo evento (misma clave) con otro PDF no es un reintento: es un conflicto.
    const otro = await mensajePruebaTienda({ eventId: m.eventId, contenido: await pdf(["Otro contenido"]) });
    expect(await recibir(otro)).toMatchObject({ estado: 409, cuerpo: { error: { code: "idempotency_conflict" } } });
    expect(await contar("prueba_conexion")).toBe(1);
  });

  it("diez envíos simultáneos del mismo evento dejan una sola prueba: uno acepta y nueve son duplicados", async () => {
    await limpiar();
    const m = await mensajePruebaTienda();
    const rs = await Promise.all(Array.from({ length: 10 }, () => recibir(m)));
    expect(rs.filter((r) => r.estado === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.estado === 200 && r.cuerpo.status === "duplicate")).toHaveLength(9);
    expect(await contar("prueba_conexion")).toBe(1);
    expect(await contar("audit_log", `accion = 'recibir prueba de conexion' AND despues->>'eventId' = '${m.eventId}'`)).toBe(1);
  });

  it("rechaza lo que no cumple el contrato, con su código, sin guardar nada y auditando el rechazo", async () => {
    await limpiar();
    const m = await mensajePruebaTienda();
    const bytes = (x: object) => new TextEncoder().encode(JSON.stringify(x));
    const conClave = (x: { eventId: string }) => cabecerasFirmadas(bytes(x), clavePruebaTienda(x));
    const grandeJson = Buffer.concat([Buffer.from(JSON.stringify(m)), Buffer.alloc(2 * 1024 * 1024, 0x20)]); // más de 2 MiB
    const pdfGrande = await mensajePruebaTienda({ contenido: Buffer.alloc(MAX_PDF_PRUEBA + 1024, 0x41) }); // 1 MiB y pico, bajo los 2 MiB del cuerpo
    const base64Salto = { ...m, document: { ...m.document, contentBase64: `${m.document.contentBase64.slice(0, 40)}\n${m.document.contentBase64.slice(40)}` } };
    const noPdf = Buffer.from("hola, esto no es un PDF");
    const roto = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("basura sin estructura alguna")]);
    const casos: [string, () => Promise<{ estado: number; cuerpo: { error?: { code: string } } }>, number, string][] = [
      ["sin firma", () => recibir(m, { cabeceras: { "content-type": "application/json" } }), 401, "invalid_signature"],
      ["otro secreto", () => recibir(m, { secreto: "otro-secreto-de-mas-de-treinta-y-dos-caracteres" }), 401, "invalid_signature"],
      ["firma de hace 6 minutos", () => recibir(m, { ahora: Date.now() - 6 * 60_000 }), 401, "invalid_signature"],
      ["JSON ilegible", () => { const c = new TextEncoder().encode("{no es json"); return recibir(m, { cuerpo: c, cabeceras: cabecerasFirmadas(c, clavePruebaTienda(m)) }); }, 400, "schema_invalid"],
      ["campo de más", () => recibir({ ...m, extra: 1 }), 400, "schema_invalid"],
      ["source de la propia fábrica (reflejo)", () => recibir({ ...m, source: "neltume-factory" }, { clave: `neltume-factory:connection-test:${m.eventId}` }), 400, "schema_invalid"],
      ["eventType de un pedido", () => recibir({ ...m, eventType: "order.ready" }), 400, "schema_invalid"],
      ["eventId en mayúsculas", () => { const x = { ...m, eventId: m.eventId.toUpperCase() }; return recibir(x, { cabeceras: conClave(x) }); }, 400, "schema_invalid"],
      ["clave de idempotencia de otro evento", () => recibir(m, { clave: clavePruebaTienda({ eventId: randomUUID() }) }), 400, "schema_invalid"],
      ["clave de idempotencia con el origen de la fábrica", () => recibir(m, { clave: `neltume-factory:connection-test:${m.eventId}` }), 400, "schema_invalid"],
      ["nombre de archivo con espacios", () => recibir({ ...m, document: { ...m.document, filename: "mi prueba.pdf" } }), 400, "schema_invalid"],
      ["versión de contrato 2.0", () => recibir({ ...m, schemaVersion: "2.0" }), 422, "unsupported_schema_version"],
      ["otra fábrica", () => recibir({ ...m, factoryCode: "SANTIAGO" }), 422, "destination_mismatch"],
      ["sha256 que no coincide", () => recibir({ ...m, document: { ...m.document, sha256: "0".repeat(64) } }), 422, "document_invalid"],
      ["base64 no canónico", () => recibir(base64Salto), 422, "document_invalid"],
      ["no es un PDF", async () => recibir(await mensajePruebaTienda({ contenido: noPdf })), 422, "document_invalid"],
      ["PDF dañado", async () => recibir(await mensajePruebaTienda({ contenido: roto })), 422, "document_invalid"],
      ["PDF de más de 1 MiB", () => recibir(pdfGrande), 413, "payload_too_large"],
      ["cuerpo de más de 2 MiB", () => recibir(m, { cuerpo: grandeJson, cabeceras: cabecerasFirmadas(grandeJson, clavePruebaTienda(m)) }), 413, "payload_too_large"],
      ["Content-Type distinto", () => recibir(m, { cabeceras: cabecerasFirmadas(bytes(m), clavePruebaTienda(m), { tipo: "text/plain" }) }), 415, "unsupported_media_type"],
    ];
    for (const [nombre, enviar, estado, code] of casos) expect(await enviar(), nombre).toMatchObject({ estado, cuerpo: { error: { code } } });
    expect(await contar("prueba_conexion")).toBe(0);

    // Tras la firma válida, cada rechazo queda auditado con su código; sin firma, agregado por IP y sin el secreto (ADR-0016).
    const codigos = new Set((await filas("SELECT despues->>'codigo' AS c FROM audit_log WHERE accion = $1 AND resultado = 'error' AND recurso = 'integracion'", [`POST ${RUTA}`])).map((f) => f.c));
    for (const esperado of ["schema_invalid", "unsupported_schema_version", "destination_mismatch", "document_invalid", "payload_too_large"]) expect(codigos, esperado).toContain(esperado);
    const [d] = await filas("SELECT despues FROM audit_log WHERE recurso = 'integracion' AND resultado = 'denegado' AND accion = $1 AND despues->>'motivo' = 'FIRMA_INVALIDA' ORDER BY id DESC LIMIT 1", [`POST ${RUTA}`]);
    expect(d.despues).toMatchObject({ motivo: "FIRMA_INVALIDA", agregado: true });
    // También lo rechazado antes de la firma (tamaño y tipo) deja su fila agregada por IP, sin lo que haya escrito quien envía.
    for (const motivo of ["CUERPO_GRANDE", "TIPO_NO_ADMITIDO"]) {
      const [f] = await filas("SELECT actor_tipo, resultado, despues FROM audit_log WHERE recurso = 'integracion' AND accion = $1 AND despues->>'motivo' = $2 ORDER BY id DESC LIMIT 1", [`POST ${RUTA}`, motivo]);
      expect(f, motivo).toMatchObject({ actor_tipo: "visitante", resultado: "denegado", despues: { motivo, agregado: true } });
    }
    expect(JSON.stringify(await filas("SELECT * FROM audit_log WHERE recurso = 'integracion'"))).not.toContain("text/plain");
    expect(JSON.stringify(await filas("SELECT * FROM audit_log WHERE recurso = 'integracion'"))).not.toContain(SECRETO_PRUEBA);
  });

  it("sin secreto configurado responde 503 not_configured (reintentable) y no guarda nada", async () => {
    await limpiar();
    const secreto = process.env.INTEGRACION_TIENDA_SECRETO;
    delete process.env.INTEGRACION_TIENDA_SECRETO;
    try {
      expect(await recibir(await mensajePruebaTienda())).toMatchObject({ estado: 503, cuerpo: { error: { code: "not_configured" } } });
    } finally {
      process.env.INTEGRACION_TIENDA_SECRETO = secreto;
    }
    expect(await contar("prueba_conexion")).toBe(0);
  });

  it("conserva las últimas 20 recibidas: las más antiguas se borran y la auditoría las recuerda", async () => {
    await limpiar();
    const ids: string[] = [];
    for (let i = 0; i < 22; i++) {
      const m = await mensajePruebaTienda();
      expect((await recibir(m)).estado).toBe(201);
      ids.push(m.eventId);
    }
    expect(await contar("prueba_conexion", "direccion = 'recibida'")).toBe(20);
    const quedan = new Set((await filas("SELECT event_id FROM prueba_conexion")).map((f) => f.event_id));
    expect(ids.slice(0, 2).some((id) => quedan.has(id))).toBe(false);
    expect(ids.slice(2).every((id) => quedan.has(id))).toBe(true);
    for (const id of ids.slice(0, 2)) expect(await contar("audit_log", `accion = 'recibir prueba de conexion' AND despues->>'eventId' = '${id}'`)).toBe(1);
  });
});

describe("retención con envíos simultáneos (REQ-ADM-5.3)", () => {
  it("con 20 pruebas ya guardadas, seis recepciones distintas a la vez dejan exactamente 20", async () => {
    await limpiar();
    await owner.query(
      `INSERT INTO prueba_conexion (direccion, event_id, estado, hash_cuerpo, contenido, sha256, bytes, nombre_archivo, creado_en)
       SELECT 'recibida', gen_random_uuid(), 'recibida', 'h', 'x'::bytea, 'x', 1, 'x.pdf', now() - make_interval(mins => g) FROM generate_series(1, 20) g`);
    expect(await contar("prueba_conexion")).toBe(20);
    const mensajes = await Promise.all(Array.from({ length: 6 }, () => mensajePruebaTienda()));
    const rs = await Promise.all(mensajes.map((m) => recibir(m)));
    expect(rs.map((r) => r.estado)).toEqual([201, 201, 201, 201, 201, 201]);
    // Cada una vio solo su propia vista si el candado fuera por evento: quedarían más de 20.
    expect(await contar("prueba_conexion", "direccion = 'recibida'")).toBe(20);
    const quedan = new Set((await filas("SELECT event_id FROM prueba_conexion")).map((f) => f.event_id));
    expect(mensajes.every((m) => quedan.has(m.eventId))).toBe(true);
  });
});

describe("rutas de la app: Conexión con la tienda (REQ-ADM-5.1, 5.3, 5.4)", () => {
  it("sin sesión, 401; sin config.editar, 403 en las cuatro rutas, y cada denegación queda en la auditoría", async () => {
    await limpiar();
    const antes = await contar("audit_log", "resultado = 'denegado'");
    const ejecutar = (s: Sesion | null, ruta: number) => {
      const id = randomUUID();
      const peticion = { ...(s ?? {}), cabeceras: ruta === 1 ? idem() : undefined } as Parameters<typeof llamar>[3];
      return [
        () => llamar(rutaPruebas.GET, "GET", "/api/v1/integracion/tienda/pruebas", peticion),
        () => llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", peticion),
        () => llamar(rutaPrueba.GET, "GET", `/api/v1/integracion/tienda/pruebas/${id}`, peticion, { id }),
        () => llamar(rutaPdf.GET, "GET", `/api/v1/integracion/tienda/pruebas/${id}/pdf`, peticion, { id }),
      ][ruta]();
    };
    for (let i = 0; i < 4; i++) expect(await ejecutar(null, i), `sin sesión, ruta ${i}`).toMatchObject({ estado: 401, cuerpo: { error: { codigo: "NO_AUTENTICADO" } } });
    for (let i = 0; i < 4; i++) expect(await ejecutar(sinPermiso, i), `sin permiso, ruta ${i}`).toMatchObject({ estado: 403, cuerpo: { error: { codigo: "SIN_PERMISO" } } });
    expect(await contar("prueba_conexion")).toBe(0);
    const denegadas = await filas("SELECT accion FROM audit_log WHERE resultado = 'denegado' AND actor_tipo = 'usuario' ORDER BY id DESC LIMIT 4");
    expect(denegadas.map((d) => String(d.accion).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id")).sort()).toEqual([
      "GET /api/v1/integracion/tienda/pruebas", "GET /api/v1/integracion/tienda/pruebas/:id", "GET /api/v1/integracion/tienda/pruebas/:id/pdf",
      "POST /api/v1/integracion/tienda/pruebas",
    ]);
    expect(await contar("audit_log", "resultado = 'denegado'")).toBeGreaterThanOrEqual(antes + 8);
  });

  it("POST firma la prueba y la deja pendiente para el servicio de enlace: la tienda puede verificarla y la BD no guarda el secreto", async () => {
    await limpiar();
    const r = await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: idem() });
    expect(r).toMatchObject({ estado: 202, cuerpo: { estado: "pendiente" } });
    expect(r.res.headers.get("cache-control")).toBe("private, no-store");
    const [f] = await filas("SELECT * FROM prueba_conexion WHERE id = $1", [r.cuerpo.id]);
    expect(f).toMatchObject({ direccion: "enviada", estado: "pendiente", creado_por: adminId, tomada_en: null, resuelto_en: null, destino: null });
    const solicitud = Buffer.from(f.solicitud);
    expect(f.hash_cuerpo).toBe(createHash("sha256").update(solicitud).digest("hex"));
    const cab = f.cabeceras as Record<string, string>;
    expect(Object.keys(cab).sort()).toEqual(["x-idempotency-key", "x-neltume-signature", "x-neltume-timestamp"]);
    expect(verificarFirma([SECRETO_PRUEBA], { timestamp: cab["x-neltume-timestamp"], firma: cab["x-neltume-signature"] }, solicitud)).toEqual({ ok: true });
    expect(Math.abs(new Date(f.firmada_en).getTime() - Date.now())).toBeLessThan(10_000);

    const mensaje = mensajePruebaEnviada.parse(JSON.parse(solicitud.toString("utf8")));
    expect(mensaje).toMatchObject({ eventId: f.event_id, source: "neltume-factory", factoryCode: "PANGUIPULLI" });
    expect(cab["x-idempotency-key"]).toBe(`neltume-factory:connection-test:${mensaje.eventId}`);
    expect(mensaje.document.contentBase64).toBe(Buffer.from(f.contenido).toString("base64"));
    // El PDF es el de prueba: rotulado, con el código para reconocerlo y sin un solo monto.
    const texto = (await fragmentosPdf(f.contenido)).map((x) => x.texto).join(" ").replace(/\s+/g, " ");
    expect(texto).toContain("PRUEBA DE CONEXIÓN");
    expect(texto).toContain(mensaje.eventId.slice(0, 8));
    expect(texto).not.toContain("$");

    const [a] = await filas("SELECT * FROM audit_log WHERE accion = 'solicitar prueba de conexion'");
    expect(a).toMatchObject({ actor_tipo: "usuario", actor_id: adminId, recurso: "prueba_conexion", recurso_id: f.id, resultado: "ok", origen: "web" });
    // El secreto no está en ninguna parte de la BD: ni en la solicitud, ni en las cabeceras, ni en la auditoría.
    expect(solicitud.toString("utf8")).not.toContain(SECRETO_PRUEBA);
    expect(JSON.stringify(cab) + JSON.stringify(a)).not.toContain(SECRETO_PRUEBA);
  });

  it("una prueba en curso a la vez; repetir la misma Idempotency-Key devuelve la misma respuesta sin crear otra", async () => {
    await limpiar();
    const clave = randomUUID();
    const primera = await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: { "idempotency-key": clave } });
    expect(primera.estado).toBe(202);
    const repetida = await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: { "idempotency-key": clave } });
    expect(repetida).toMatchObject({ estado: 202, cuerpo: { id: primera.cuerpo.id } });
    const otra = await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: idem() });
    expect(otra).toMatchObject({ estado: 409, cuerpo: { error: { codigo: "PRUEBA_EN_CURSO" } } });
    expect(await contar("prueba_conexion")).toBe(1);
    // Cuando el servicio termina la primera, se puede probar de nuevo.
    await owner.query("UPDATE prueba_conexion SET estado = 'aceptada', solicitud = NULL, cabeceras = NULL, resuelto_en = now()");
    expect((await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: idem() })).estado).toBe(202);
    expect(await contar("prueba_conexion")).toBe(2);
  });

  it("una pendiente que el servicio no tomó en más de 60 s se da por reemplazada al pedir otra: no se acumulan ni se mandarían juntas", async () => {
    await limpiar();
    const vieja = async (hace: string) => (await owner.query(
      `INSERT INTO prueba_conexion (direccion, event_id, estado, hash_cuerpo, contenido, sha256, bytes, nombre_archivo, solicitud, cabeceras, firmada_en, creado_por, creado_en)
       VALUES ('enviada', gen_random_uuid(), 'pendiente', 'h', 'pdf'::bytea, 'x', 3, 'x.pdf', 'sol'::bytea, '{}'::jsonb, now() - $2::interval, $1, now() - $2::interval) RETURNING id`, [adminId, hace])).rows[0].id as string;
    const [a, b] = [await vieja("5 minutes"), await vieja("2 minutes")];
    const r = await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: idem() });
    expect(r.estado).toBe(202);
    for (const id of [a, b]) {
      expect((await filas("SELECT * FROM prueba_conexion WHERE id = $1", [id]))[0], id).toMatchObject({ estado: "vencida", codigo_error: "reemplazada", solicitud: null, cabeceras: null });
    }
    expect(await contar("prueba_conexion", "estado = 'pendiente'")).toBe(1);
    expect((await filas("SELECT despues FROM audit_log WHERE accion = 'solicitar prueba de conexion' AND recurso_id = $1", [r.cuerpo.id]))[0].despues).toMatchObject({ reemplazadas: 2 });
  });

  it("sin INTEGRACION_TIENDA_SECRETO: 409 INTEGRACION_APAGADA, nada queda en la BD y el estado lo dice", async () => {
    await limpiar();
    const secreto = process.env.INTEGRACION_TIENDA_SECRETO;
    delete process.env.INTEGRACION_TIENDA_SECRETO;
    try {
      expect(await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: idem() })).toMatchObject({ estado: 409, cuerpo: { error: { codigo: "INTEGRACION_APAGADA" } } });
      const e = (await llamar(rutaPruebas.GET, "GET", "/api/v1/integracion/tienda/pruebas", admin)).cuerpo;
      expect(e).toMatchObject({ recepcion: { activa: false, fabrica: "PANGUIPULLI" }, envio: { secretoConfigurado: false, destino: null } });
    } finally {
      process.env.INTEGRACION_TIENDA_SECRETO = secreto;
    }
    expect(await contar("prueba_conexion")).toBe(0);
  });

  it("la lista y cada prueba muestran ambos sentidos con su estado, sin el PDF ni la solicitud firmada", async () => {
    await limpiar();
    const enviada = (await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: idem() })).cuerpo.id;
    const m = await mensajePruebaTienda();
    expect((await recibir(m)).estado).toBe(201);
    const { cuerpo: e } = await llamar(rutaPruebas.GET, "GET", "/api/v1/integracion/tienda/pruebas", admin);
    expect(e).toMatchObject({ recepcion: { activa: true, fabrica: "PANGUIPULLI" }, envio: { secretoConfigurado: true, destino: null } });
    expect(e.pruebas.map((p: { direccion: string; estado: string }) => [p.direccion, p.estado])).toEqual([["recibida", "recibida"], ["enviada", "pendiente"]]);
    const recibida = e.pruebas[0];
    expect(recibida).toMatchObject({ eventId: m.eventId, codigo: m.eventId.slice(0, 8), nombreArchivo: m.document.filename, httpStatus: null, resueltoEn: null });
    expect(recibida.detalle).toMatch(/^PDF de \d+ KB recibido de la tienda\.$/);
    expect(e.pruebas[1].detalle).toBe("Esperando al servicio de enlace.");
    for (const p of e.pruebas) for (const prohibida of ["contenido", "solicitud", "cabeceras", "hashCuerpo", "sha256", "creadoPor"]) expect(p, prohibida).not.toHaveProperty(prohibida);
    const una = await llamar(rutaPrueba.GET, "GET", `/api/v1/integracion/tienda/pruebas/${enviada}`, admin, { id: enviada });
    expect(una).toMatchObject({ estado: 200, cuerpo: { id: enviada, direccion: "enviada", estado: "pendiente" } });
    expect(una.res.headers.get("cache-control")).toBe("private, no-store");
    // Un resultado del servicio se muestra con su diagnóstico, destino y latencia.
    await owner.query("UPDATE prueba_conexion SET estado = 'aceptada', solicitud = NULL, cabeceras = NULL, destino = 'cotizador.puertasneltume.cl', http_status = 201, latencia_ms = 312, detalle = 'Aceptada en 312 ms.', resuelto_en = now() WHERE id = $1", [enviada]);
    const despues = (await llamar(rutaPruebas.GET, "GET", "/api/v1/integracion/tienda/pruebas", admin)).cuerpo;
    expect(despues.envio.destino).toBe("cotizador.puertasneltume.cl");
    expect(despues.pruebas.find((p: { id: string }) => p.id === enviada)).toMatchObject({ estado: "aceptada", httpStatus: 201, latenciaMs: 312, destino: "cotizador.puertasneltume.cl", detalle: "Aceptada en 312 ms." });
  });

  it("un id mal formado o inexistente es 404 en el estado y en el PDF", async () => {
    for (const id of ["no-es-un-uuid", randomUUID()]) {
      expect(await llamar(rutaPrueba.GET, "GET", `/api/v1/integracion/tienda/pruebas/${id}`, admin, { id })).toMatchObject({ estado: 404, cuerpo: { error: { codigo: "NO_ENCONTRADO" } } });
      expect((await llamar(rutaPdf.GET, "GET", `/api/v1/integracion/tienda/pruebas/${id}/pdf`, admin, { id })).estado).toBe(404);
    }
  });

  it("el PDF se sirve en el visor, privado y con nosniff, tanto el enviado como el recibido", async () => {
    await limpiar();
    const enviada = (await llamar(rutaPruebas.POST, "POST", "/api/v1/integracion/tienda/pruebas", { ...admin, cabeceras: idem() })).cuerpo.id;
    const m = await mensajePruebaTienda();
    await recibir(m);
    const [{ id: recibida }] = await filas("SELECT id FROM prueba_conexion WHERE direccion = 'recibida'");
    for (const [id, nombre] of [[enviada, /^prueba-conexion-[0-9a-f]{8}\.pdf$/], [recibida, new RegExp(`^${m.document.filename}$`)]] as const) {
      const r = await llamar(rutaPdf.GET, "GET", `/api/v1/integracion/tienda/pruebas/${id}/pdf`, admin, { id });
      expect(r.estado).toBe(200);
      expect(r.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const h = r.res.headers;
      expect(h.get("content-type")).toBe("application/pdf");
      expect(h.get("content-disposition")).toMatch(new RegExp(`^inline; filename="${nombre.source.slice(1, -1)}"$`));
      expect(h.get("cache-control")).toBe("private, no-store");
      expect(h.get("x-content-type-options")).toBe("nosniff");
      // Sin `sandbox`: es un PDF propio o verificado, y se abre en el visor (ADR-0024 §3).
      expect(h.get("content-security-policy")).toBeNull();
    }
    expect((await llamar(rutaPdf.GET, "GET", `/api/v1/integracion/tienda/pruebas/${recibida}/pdf`, admin, { id: recibida })).bytes.toString("base64")).toBe(m.document.contentBase64);
  });

  it("conserva las 20 enviadas más recientes; una que quedó enviando hace mucho no se borra", async () => {
    await limpiar();
    const contenido = await pdf(["Prueba de conexión"]);
    const actor = { tipo: "usuario" as const, id: adminId };
    // Un envío colgado de hace una hora: el servicio lo cierra, esta limpieza nunca lo borra.
    await owner.query(
      `INSERT INTO prueba_conexion (direccion, event_id, estado, hash_cuerpo, contenido, sha256, bytes, nombre_archivo, solicitud, cabeceras, firmada_en, creado_por, tomada_en, creado_en)
       VALUES ('enviada', gen_random_uuid(), 'enviando', 'h', $1, 'x', 1, 'x.pdf', $1, '{"a":"b"}'::jsonb, now() - interval '1 hour', $2, now() - interval '1 hour', now() - interval '1 hour')`,
      [contenido, adminId]);
    const ids: string[] = [];
    for (let i = 0; i < 22; i++) {
      const prueba = armarPruebaSaliente({ secreto: SECRETO_PRUEBA, fabrica: "PANGUIPULLI", pdf: contenido });
      const r = await bd().transaction((tx) => solicitarPruebaEnviada(tx, { actor, prueba, pdf: contenido }));
      ids.push(r.id);
      // Como el servicio: la termina antes de pedir la siguiente (una a la vez).
      await owner.query("UPDATE prueba_conexion SET estado = 'aceptada', solicitud = NULL, cabeceras = NULL, resuelto_en = now() WHERE id = $1", [r.id]);
    }
    expect(await contar("prueba_conexion", "estado = 'aceptada'")).toBe(20);
    expect(await contar("prueba_conexion", "estado = 'enviando'")).toBe(1);
    const quedan = new Set((await filas("SELECT id FROM prueba_conexion")).map((f) => f.id));
    expect(ids.slice(0, 2).some((id) => quedan.has(id))).toBe(false);
    expect(ids.slice(2).every((id) => quedan.has(id))).toBe(true);
  });
});
