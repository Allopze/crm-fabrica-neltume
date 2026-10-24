import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { enviar, prepararTienda, subirAdjunto } from "./tienda";
import { cerrarBd } from "@/db/conexion";
import { cabecerasFirmadas, claveDe, lineaTienda, mensajeListo, pdf, SECRETO_PRUEBA } from "../fixtures/tienda/mensaje";

// Recepción automática de las notas de la tienda (ADR-0023): autenticación, validación, idempotencia, concurrencia,
// atomicidad y adjuntos. Casos 1–9 y 12–14 de la Fase 19 (TASKS T19.8).
const app = poolApp();
const owner = poolOwner();
const filas = async (sql: string, params: unknown[] = []) => (await app.query(sql, params)).rows;
const contar = async (tabla: string) => Number((await filas(`SELECT count(*) AS n FROM ${tabla}`))[0].n);

beforeAll(async () => { await prepararTienda("rec"); });
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("POST /api/integrations/neltume/orders: autenticación (ADR-0023 §2)", () => {
  it("sin cabeceras, con firma inválida, con otro secreto o fuera de la ventana: 401 y nada se crea", async () => {
    const m = await mensajeListo();
    const antes = await contar("nota_pedido");
    expect((await enviar(m, { cabeceras: { "content-type": "application/json" } }))).toMatchObject({ estado: 401, cuerpo: { error: { code: "invalid_signature" } } });
    expect((await enviar(m, { secreto: "otro-secreto-de-mas-de-treinta-y-dos-caracteres" })).estado).toBe(401);
    // Una petición válida capturada y repetida 6 minutos después (reproducción) ya no sirve.
    expect((await enviar(m, { ahora: Date.now() - 6 * 60_000 })).estado).toBe(401);
    expect((await enviar(m, { ahora: Date.now() + 6 * 60_000 })).estado).toBe(401);
    expect(await contar("nota_pedido")).toBe(antes);
    // La denegación queda en la auditoría (agregada por IP, ADR-0016), sin la firma ni el secreto.
    const [d] = await filas("SELECT despues FROM audit_log WHERE recurso = 'integracion' AND resultado = 'denegado' ORDER BY id DESC LIMIT 1");
    expect(d.despues).toMatchObject({ motivo: "FIRMA_INVALIDA", agregado: true });
    expect(JSON.stringify(d)).not.toContain(SECRETO_PRUEBA);
  });

  it("sin secreto configurado responde 503 reintentable; un Content-Type distinto, 415", async () => {
    const m = await mensajeListo();
    const secreto = process.env.INTEGRACION_TIENDA_SECRETO;
    delete process.env.INTEGRACION_TIENDA_SECRETO;
    try {
      expect(await enviar(m)).toMatchObject({ estado: 503, cuerpo: { error: { code: "not_configured" } } });
    } finally {
      process.env.INTEGRACION_TIENDA_SECRETO = secreto;
    }
    const cuerpo = new TextEncoder().encode(JSON.stringify(m));
    expect((await enviar(m, { cabeceras: cabecerasFirmadas(cuerpo, claveDe(m), { tipo: "text/plain" }) })).estado).toBe(415);
  });
});

describe("validación del contrato (ADR-0023 §2, contrato §5)", () => {
  it("rechaza destino Santiago, versión desconocida, campos de más, datos faltantes y una clave que no calza", async () => {
    expect(await enviar(await mensajeListo({ destino: "SANTIAGO" }))).toMatchObject({ estado: 422, cuerpo: { error: { code: "destination_mismatch" } } });
    expect(await enviar({ ...(await mensajeListo()), schemaVersion: "2.0" })).toMatchObject({ estado: 422, cuerpo: { error: { code: "unsupported_schema_version" } } });
    expect(await enviar({ ...(await mensajeListo()), precioEspecial: 1 })).toMatchObject({ estado: 400, cuerpo: { error: { code: "schema_invalid" } } });
    const sinItems = await mensajeListo();
    expect((await enviar({ ...sinItems, order: { ...sinItems.order, items: [] } })).estado).toBe(400);
    const sinNumero = await mensajeListo();
    expect((await enviar({ ...sinNumero, order: { ...sinNumero.order, orderNumber: undefined } })).estado).toBe(400);
    const m = await mensajeListo();
    expect((await enviar(m, { clave: "neltume-store:otro:PANGUIPULLI:1" })).cuerpo.error.code).toBe("schema_invalid");
    expect(await contar("nota_pedido")).toBe(0);
  });

  it("un PDF dañado o con otro sha256 es 422 document_invalid", async () => {
    const m = await mensajeListo();
    const malo = { ...m, documents: { ...m.documents, commercial: { ...m.documents.commercial, sha256: "a".repeat(64) } } };
    expect(await enviar(malo)).toMatchObject({ estado: 422, cuerpo: { error: { code: "document_invalid" } } });
    const texto = Buffer.from("%PDF-1.4 roto");
    const roto = { ...m, documents: { ...m.documents, production: { ...m.documents.production, contentBase64: texto.toString("base64"), sha256: createHash("sha256").update(texto).digest("hex") } } };
    expect((await enviar(roto)).cuerpo.error.code).toBe("document_invalid");
  });
});

describe("recepción válida (ADR-0023 §3, §5)", () => {
  let mensaje: Awaited<ReturnType<typeof mensajeListo>>;
  let notaId: string;

  it("crea la nota pendiente, con productos, cantidades, medidas, observaciones, reserva y ambos PDF", async () => {
    mensaje = await mensajeListo({ numero: "601" });
    const r = await enviar(mensaje);
    expect(r).toMatchObject({ estado: 201, cuerpo: { status: "accepted", eventId: mensaje.eventId } });
    notaId = r.cuerpo.factoryOrderId;
    const [n] = await filas("SELECT * FROM nota_pedido WHERE id = $1", [notaId]);
    expect(n).toMatchObject({ estado: "pendiente", origen: "tienda_api", ref_externa: "601", revision_externa: 1, proyecto: "Casa Lago", medio_transporte: "Starken", exige_pago: false });
    expect(n.observaciones).toBe("Entregar en dos etapas.\nEntrega acordada con la tienda: Semana del 16 de noviembre");
    const items = await filas("SELECT a.codigo, i.cantidad, i.medida_solicitada, i.observacion, i.revisar, i.precio_unitario FROM pedido_item i JOIN articulo a ON a.id = i.articulo_id WHERE nota_pedido_id = $1 ORDER BY orden", [notaId]);
    expect(items).toEqual([
      { codigo: "FUY-O-2-A", cantidad: 3, medida_solicitada: "720 × 2000 mm (Hoja)", observacion: "Bisagras a la derecha", revisar: null, precio_unitario: expect.anything() },
      { codigo: "MAR-O-2X4-B", cantidad: 2, medida_solicitada: "2x4 pulg. × 2,10 m", observacion: null, revisar: null, precio_unitario: expect.anything() },
    ]);
    // El precio es el de la lista de la fábrica, no el que mandó la tienda (100.000), y se avisa la diferencia.
    expect(Number(items[0].precio_unitario)).not.toBe(100000);
    const docs = await filas("SELECT d.tipo, d.sha256, d.retenido FROM documento_tienda d JOIN recepcion_tienda r ON r.id = d.recepcion_id WHERE r.nota_pedido_id = $1 ORDER BY tipo", [notaId]);
    expect(docs).toEqual([
      { tipo: "comercial", sha256: mensaje.documents.commercial.sha256, retenido: false },
      { tipo: "produccion", sha256: mensaje.documents.production.sha256, retenido: false },
    ]);
    // Del cliente final solo queda el proyecto; quien aprobó en la tienda tampoco se guarda (D1, REQ-COT-8.9).
    const guardado = JSON.stringify(await filas("SELECT payload, comercial, avisos FROM recepcion_tienda WHERE nota_pedido_id = $1", [notaId]));
    for (const dato of ["Cliente Final de Prueba", "12.345.678-5", "+56 9 1111 2222", "Calle Falsa 123", "Vendedora 1"]) expect(guardado).not.toContain(dato);
    const auditoria = JSON.stringify(await filas("SELECT despues FROM audit_log WHERE origen = 'api'"));
    expect(auditoria).not.toContain("Cliente Final de Prueba");
    const [a] = await filas("SELECT actor_tipo, despues FROM audit_log WHERE recurso = 'recepcion_tienda' ORDER BY id DESC LIMIT 1");
    expect(a).toMatchObject({ actor_tipo: "sistema", despues: { estado: "incorporada", notaTienda: "601" } });
  });

  it("un reintento idéntico responde 200 duplicate con la misma nota; otro contenido con la misma clave, 409", async () => {
    const r = await enviar(mensaje);
    expect(r).toMatchObject({ estado: 200, cuerpo: { status: "duplicate", eventId: mensaje.eventId, factoryOrderId: notaId } });
    expect(Number((await filas("SELECT count(*) AS n FROM nota_pedido WHERE ref_externa = '601'"))[0].n)).toBe(1);
    const otro = { ...mensaje, order: { ...mensaje.order, notes: "otra cosa" } };
    expect(await enviar(otro)).toMatchObject({ estado: 409, cuerpo: { error: { code: "idempotency_conflict" } } });
  });

  it("10 envíos simultáneos del mismo pedido crean una sola nota", async () => {
    const m = await mensajeListo({ numero: "602" });
    const respuestas = await Promise.all(Array.from({ length: 10 }, () => enviar(m)));
    expect(respuestas.filter((r) => r.estado === 201)).toHaveLength(1);
    expect(respuestas.every((r) => r.estado === 201 || (r.estado === 200 && r.cuerpo.status === "duplicate"))).toBe(true);
    expect(new Set(respuestas.map((r) => r.cuerpo.factoryOrderId)).size).toBe(1);
    expect(Number((await filas("SELECT count(*) AS n FROM nota_pedido WHERE ref_externa = '602'"))[0].n)).toBe(1);
  });

  it("un fallo a mitad de la transacción no deja nota, reserva, recepción ni documentos; el reintento sí entra", async () => {
    await owner.query(`CREATE FUNCTION falla_prueba() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo de prueba'; END; $$`);
    await owner.query("CREATE TRIGGER falla_prueba BEFORE INSERT ON documento_tienda FOR EACH ROW EXECUTE FUNCTION falla_prueba()");
    const m = await mensajeListo({ numero: "603" });
    const antes = { notas: await contar("nota_pedido"), movimientos: await contar("movimiento"), recepciones: await contar("recepcion_tienda") };
    try {
      expect(await enviar(m)).toMatchObject({ estado: 500, cuerpo: { error: { code: "internal" } } });
    } finally {
      await owner.query("DROP TRIGGER falla_prueba ON documento_tienda");
      await owner.query("DROP FUNCTION falla_prueba()");
    }
    expect({ notas: await contar("nota_pedido"), movimientos: await contar("movimiento"), recepciones: await contar("recepcion_tienda") }).toEqual(antes);
    expect((await enviar(m)).estado).toBe(201);
  });

  it("un código que la fábrica no tiene y un especial entran «a pedido» para revisar (D3, D4)", async () => {
    const m = await mensajeListo({
      numero: "604",
      items: [
        lineaTienda(1, "IA-7F3K2M9QXA", 1, { description: "Puerta Lican oregón" }),
        lineaTienda(2, "ESPECIAL", 1, { isCustom: true, catalogReference: null, model: "Puerta según diseño", wood: "Roble", description: "Puerta según diseño · Roble",
          dimensions: { widthMm: 900, heightMm: 2100, lengthMm: null, section: null, measureType: "vano", requested: "900 × 2100 mm (Vano)" } }),
      ],
      comercial: [{ lineNumber: 1, unitPrice: 150000, lineTotal: 150000 }, { lineNumber: 2, unitPrice: null, lineTotal: null }],
    });
    const r = await enviar(m);
    expect(r.estado).toBe(201);
    const items = await filas("SELECT articulo_id, descripcion, medida_solicitada, revisar, precio_unitario FROM pedido_item WHERE nota_pedido_id = $1 ORDER BY orden", [r.cuerpo.factoryOrderId]);
    expect(items[0]).toMatchObject({ articulo_id: null, descripcion: expect.stringContaining("Puerta Lican oregón"), revisar: expect.stringContaining("IA-7F3K2M9QXA") });
    expect(Number(items[0].precio_unitario)).toBe(150000);
    expect(items[1]).toMatchObject({ articulo_id: null, medida_solicitada: "900 × 2100 mm (Vano)", revisar: "Pedido especial de la tienda; precio por definir" });
    expect(Number(items[1].precio_unitario)).toBe(0);
  });

  it("un PDF de producción con montos no rechaza el pedido: queda retenido", async () => {
    const r = await enviar(await mensajeListo({ numero: "605", produccion: ["Nota de pedido N° 605", "Observación: cobrar $50.000 de flete"] }));
    expect(r.estado).toBe(201);
    const [d] = await filas("SELECT d.retenido, d.motivo_retencion FROM documento_tienda d JOIN recepcion_tienda r ON r.id = d.recepcion_id WHERE r.nota_pedido_id = $1 AND d.tipo = 'produccion'", [r.cuerpo.factoryOrderId]);
    expect(d).toMatchObject({ retenido: true, motivo_retencion: expect.stringContaining("montos") });
  });

  it("los documentos son de solo inserción", async () => {
    await expect(app.query("UPDATE documento_tienda SET retenido = true")).rejects.toThrow();
    await expect(app.query("DELETE FROM adjunto_tienda")).rejects.toThrow();
  });
});

describe("PUT /api/integrations/neltume/attachments/:sha256 (contrato §2)", () => {
  it("guarda por sha256, es idempotente y rechaza hash o tipo que no calzan", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("imagen de prueba")]);
    const sha = createHash("sha256").update(png).digest("hex");
    expect(await subirAdjunto(sha, png, "image/png")).toMatchObject({ estado: 201, cuerpo: { status: "accepted" } });
    expect(await subirAdjunto(sha, png, "image/png")).toMatchObject({ estado: 200, cuerpo: { status: "duplicate" } });
    expect((await subirAdjunto("b".repeat(64), png, "image/png", `neltume-store:attachment:${"b".repeat(64)}`)).cuerpo.error.code).toBe("attachment_hash_mismatch");
    const doc = await pdf(["no es una foto"]);
    const shaDoc = createHash("sha256").update(doc).digest("hex");
    expect((await subirAdjunto(shaDoc, doc, "image/jpeg")).cuerpo.error.code).toBe("attachment_type_mismatch");
    expect((await subirAdjunto(shaDoc, doc, "text/html")).estado).toBe(415);
    expect(Number((await filas("SELECT count(*) AS n FROM adjunto_tienda"))[0].n)).toBe(1);
  });
});
