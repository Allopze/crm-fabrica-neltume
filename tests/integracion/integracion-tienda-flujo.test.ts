import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar } from "./http";
import { enviar, idem, prepararTienda, type Sesion, sesionDe, subirAdjunto } from "./tienda";
import * as rutaAdjunto from "@/app/api/v1/pedidos/[id]/adjuntos/[sha256]/route";
import * as rutaComercial from "@/app/api/v1/pedidos/[id]/documentos/comercial/route";
import * as rutaProdDoc from "@/app/api/v1/pedidos/[id]/documentos/produccion/route";
import * as rutaDespachar from "@/app/api/v1/pedidos/[id]/despachar/route";
import * as rutaLista from "@/app/api/v1/pedidos/[id]/lista/route";
import * as rutaOrden from "@/app/api/v1/pedidos/[id]/orden-trabajo/route";
import * as rutaPdf from "@/app/api/v1/pedidos/[id]/pdf/route";
import * as rutaProduccion from "@/app/api/v1/pedidos/[id]/produccion/route";
import * as rutaResolver from "@/app/api/v1/pedidos/[id]/recepciones/[recepcionId]/route";
import * as rutaPedido from "@/app/api/v1/pedidos/[id]/route";
import * as rutaPedidos from "@/app/api/v1/pedidos/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import { bd, cerrarBd } from "@/db/conexion";
import { fragmentosPdf } from "@/domain/pedidos/pdf-texto";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";
import { lineaTienda, mensajeAnulacion, mensajeListo } from "../fixtures/tienda/mensaje";

// Lo que pasa con la nota recibida dentro de la fábrica (ADR-0023): importes con permiso, documentos, orden de trabajo,
// adjuntos, ciclo de siempre y revisiones o anulaciones. Casos 10, 11, 15 y 16 de la Fase 19 (TASKS T19.8).
const app = poolApp();
const sistema = { tipo: "sistema" as const };
let admin: Sesion;
let produccion: Sesion;
let consulta: Sesion;
const filas = async (sql: string, params: unknown[] = []) => (await app.query(sql, params)).rows;
type Ruta = Parameters<typeof llamar>[0];
const get = (ruta: { GET: Ruta }, id: string, sesion: Sesion, extra: object = {}) => llamar(ruta.GET, "GET", "/x", sesion, { id, ...extra });
const post = (ruta: { POST: Ruta }, params: object, sesion: Sesion, cuerpo: object = {}) => llamar(ruta.POST, "POST", "/x", { ...sesion, cabeceras: idem(), cuerpo }, params);
const textoPdf = async (bytes: Buffer) => (await fragmentosPdf(new Uint8Array(bytes))).map((f) => f.texto).join(" ");
const estado = async (id: string) => (await filas("SELECT estado FROM nota_pedido WHERE id = $1", [id]))[0].estado;

beforeAll(async () => {
  ({ admin, produccion } = await prepararTienda("flujo"));
  const rol = await bd().transaction((tx) => crearRol(tx, "solo stock flujo", ["stock.ver"], sistema, "consola"));
  await bd().transaction((tx) => crearUsuario(tx, { email: "flujo-consulta@neltume.cl", nombre: "Consulta", clave: "clave-consulta-1", rolId: rol.id }, sistema, "consola"));
  consulta = await sesionDe("flujo-consulta@neltume.cl", "clave-consulta-1", "10.30.0.3");
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("importes y documentos con permiso (ADR-0023 §6–§8)", () => {
  let id: string;
  beforeAll(async () => { id = (await enviar(await mensajeListo({ numero: "701" }))).cuerpo.factoryOrderId; });

  it("producción ve la nota y sus ítems sin un peso; el administrador, con importes", async () => {
    const p = (await get(rutaPedido, id, produccion)).cuerpo;
    expect(p.items.map((i: { precioUnitario: unknown; totalLinea: unknown }) => [i.precioUnitario, i.totalLinea])).toEqual([[null, null], [null, null]]);
    expect(p.totales).toBeNull();
    expect(p.pago).toMatchObject({ total: null, pagado: null, saldo: null });
    expect(p.tienda).toMatchObject({ revision: 1, comercial: null });
    expect(p.tienda.documentos.map((d: { tipo: string }) => d.tipo)).toEqual(["produccion"]);
    expect(JSON.stringify(p)).not.toMatch(/100000|"total":\d/);
    const lista = (await llamar(rutaPedidos.GET, "GET", "/api/v1/pedidos", produccion)).cuerpo.datos.find((x: { id: string }) => x.id === id);
    expect(lista).toMatchObject({ total: null, pagado: null });
    const a = (await get(rutaPedido, id, admin)).cuerpo;
    expect(a.totales.total).toBeGreaterThan(0);
    expect(a.tienda.comercial).toMatchObject({ basis: "factory_price_net" });
    expect(a.tienda.documentos.map((d: { tipo: string }) => d.tipo).sort()).toEqual(["comercial", "produccion"]);
  });

  it("documento comercial solo con importes y clientes; la denegación se audita", async () => {
    const r = await get(rutaComercial, id, admin);
    expect(r.estado).toBe(200);
    expect(r.res.headers.get("content-security-policy")).toBe("sandbox");
    expect(await textoPdf(r.bytes)).toContain("$100.000");
    expect((await get(rutaComercial, id, produccion)).estado).toBe(404);
    const [d] = await filas("SELECT resultado, despues FROM audit_log WHERE resultado = 'denegado' AND recurso = 'api' ORDER BY id DESC LIMIT 1");
    expect(d).toMatchObject({ resultado: "denegado", despues: { motivo: "SIN_PERMISO" } });
    // La nota de pedido con precios tampoco: producción usa la orden de trabajo.
    expect((await get(rutaPdf, id, produccion)).estado).toBe(403);
  });

  it("producción descarga la orden de trabajo de la fábrica y el PDF de producción de la tienda, sin precios", async () => {
    const orden = await get(rutaOrden, id, produccion);
    expect(orden.estado).toBe(200);
    expect(orden.res.headers.get("content-type")).toBe("application/pdf");
    const texto = await textoPdf(orden.bytes);
    expect(texto).toContain("FUY-O-2-A");
    expect(texto).toContain("720 × 2000 mm (Hoja)");
    expect(texto).toContain("Bisagras a la derecha");
    expect(texto).not.toMatch(/\$|IVA|Cliente Final/);
    const doc = await get(rutaProdDoc, id, produccion);
    expect(doc.estado).toBe(200);
    expect(await textoPdf(doc.bytes)).not.toContain("$");
    expect((await get(rutaProdDoc, id, consulta)).estado).toBe(404);
    const [a] = await filas("SELECT despues FROM audit_log WHERE accion = 'descargar orden de trabajo' ORDER BY id DESC LIMIT 1");
    expect(a.despues).toMatchObject({ numero: expect.any(Number) });
  });

  it("las referencias del cliente se ven solo si un ítem de la nota las nombra; un adjunto que no llegó no bloquea", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("croquis")]);
    const sha = createHash("sha256").update(png).digest("hex");
    const ref = { attachmentId: sha, filename: "croquis.png", mimeType: "image/png", sizeBytes: png.length };
    const r = await enviar(await mensajeListo({ numero: "702", items: [lineaTienda(1, "FUY-O-2-A", 1, { references: [ref] })] }));
    expect(r.estado).toBe(201);
    const nota = r.cuerpo.factoryOrderId;
    expect((await get(rutaAdjunto, nota, produccion, { sha256: sha })).estado).toBe(404);
    await subirAdjunto(sha, png, "image/png");
    const a = await get(rutaAdjunto, nota, produccion, { sha256: sha });
    expect(a.estado).toBe(200);
    expect(a.res.headers.get("content-type")).toBe("image/png");
    expect((await get(rutaAdjunto, id, produccion, { sha256: sha })).estado).toBe(404);
  });
});

describe("compatibilidad con el ciclo de la nota de pedido (REQ-COT-8.5)", () => {
  it("con stock: producir, lista y despachar como cualquier nota; sin stock: la orden de producción sale del faltante", async () => {
    await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "FUY-O-2-A", cantidad: 3 } });
    await llamar(rutaEntradas.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { codigo: "MAR-O-2X4-B", cantidad: 2 } });
    const id = (await enviar(await mensajeListo({ numero: "710" }))).cuerpo.factoryOrderId;
    const items = await filas("SELECT reservado, faltante FROM pedido_item WHERE nota_pedido_id = $1 ORDER BY orden", [id]);
    expect(items).toEqual([{ reservado: 3, faltante: 0 }, { reservado: 2, faltante: 0 }]);
    expect((await post(rutaProduccion, { id }, produccion)).cuerpo.orden).toBeNull();
    expect((await post(rutaLista, { id }, produccion, { confirmarAPedido: false })).estado).toBe(200);
    expect((await post(rutaDespachar, { id }, produccion)).estado).toBe(200);
    expect(await estado(id)).toBe("despachada");

    const sinStock = (await enviar(await mensajeListo({ numero: "711" }))).cuerpo.factoryOrderId;
    const r = await post(rutaProduccion, { id: sinStock }, produccion);
    expect(r.estado).toBe(200);
    const [o] = await filas("SELECT a.codigo, l.cantidad FROM orden_linea l JOIN articulo a ON a.id = l.articulo_id WHERE l.orden_id = $1 AND a.codigo = 'FUY-O-2-A'", [r.cuerpo.orden.id]);
    expect(o).toEqual({ codigo: "FUY-O-2-A", cantidad: 3 });
  });
});

describe("revisiones y anulaciones de la tienda (ADR-0023 §4, D2, D5)", () => {
  it("una revisión sobre una nota sin iniciar la reemplaza; una revisión vieja después es 409", async () => {
    const m1 = await mensajeListo({ numero: "720" });
    const v1 = (await enviar(m1)).cuerpo.factoryOrderId;
    const m2 = await mensajeListo({ numero: "721", sourceOrderId: m1.sourceOrderId, revision: 2 });
    const r = await enviar(m2);
    expect(r.estado).toBe(201);
    expect(await estado(v1)).toBe("cancelada");
    const [n] = await filas("SELECT ref_externa, revision_externa, reemplaza_id, estado FROM nota_pedido WHERE id = $1", [r.cuerpo.factoryOrderId]);
    expect(n).toEqual({ ref_externa: "721", revision_externa: 2, reemplaza_id: v1, estado: "pendiente" });
    const viejo = await mensajeListo({ numero: "720", sourceOrderId: m1.sourceOrderId, revision: 1 });
    expect(await enviar(viejo)).toMatchObject({ estado: 409, cuerpo: { error: { code: "stale_revision" } } });
  });

  it("con la nota en producción, la revisión espera a una persona, que la aplica con motivo", async () => {
    const m1 = await mensajeListo({ numero: "730" });
    const v1 = (await enviar(m1)).cuerpo.factoryOrderId;
    await post(rutaProduccion, { id: v1 }, produccion);
    const r = await enviar(await mensajeListo({ numero: "730", sourceOrderId: m1.sourceOrderId, revision: 2, items: [lineaTienda(1, "FUY-O-2-A", 5)] }));
    expect(r).toMatchObject({ estado: 202, cuerpo: { status: "accepted", factoryOrderId: v1 } });
    expect(await estado(v1)).toBe("en_produccion");
    const pendiente = (await get(rutaPedido, v1, produccion)).cuerpo.tienda.pendientes[0];
    expect(pendiente).toMatchObject({ revision: 2, estado: "pendiente_revision" });
    // Sin pedidos.gestionar no se resuelve; la denegación se audita.
    expect((await post(rutaResolver, { id: v1, recepcionId: pendiente.id }, consulta, { accion: "aplicar", motivo: "x" })).estado).toBe(403);
    expect((await post(rutaResolver, { id: v1, recepcionId: pendiente.id }, produccion, { accion: "aplicar", motivo: "" })).estado).toBe(400);
    const ok = await post(rutaResolver, { id: v1, recepcionId: pendiente.id }, produccion, { accion: "aplicar", motivo: "Confirmado con la tienda" });
    expect(ok.estado).toBe(200);
    expect(await estado(v1)).toBe("cancelada");
    const [nueva] = await filas("SELECT i.cantidad, n.reemplaza_id FROM nota_pedido n JOIN pedido_item i ON i.nota_pedido_id = n.id WHERE n.id = $1", [ok.cuerpo.nueva.id]);
    expect(nueva).toEqual({ cantidad: 5, reemplaza_id: v1 });
    const [a] = await filas("SELECT despues FROM audit_log WHERE accion = 'aplicar revision de la tienda' ORDER BY id DESC LIMIT 1");
    expect(a.despues).toMatchObject({ motivo: "Confirmado con la tienda", revision: 2 });
    // Ya resuelta: la revisión quedó en la nota nueva y no se aplica dos veces.
    expect((await post(rutaResolver, { id: ok.cuerpo.nueva.id, recepcionId: pendiente.id }, produccion, { accion: "descartar", motivo: "x" })).estado).toBe(409);
  });

  it("una anulación cancela la nota sin iniciar, se pide con la nota en curso y se recuerda si el pedido no existe", async () => {
    const m1 = await mensajeListo({ numero: "740" });
    const v1 = (await enviar(m1)).cuerpo.factoryOrderId;
    expect((await enviar(mensajeAnulacion(m1.sourceOrderId, 2, "740"))).estado).toBe(200);
    expect(await estado(v1)).toBe("cancelada");

    const m2 = await mensajeListo({ numero: "741" });
    const v2 = (await enviar(m2)).cuerpo.factoryOrderId;
    await post(rutaProduccion, { id: v2 }, produccion);
    expect((await enviar(mensajeAnulacion(m2.sourceOrderId, 2, "741"))).estado).toBe(202);
    expect(await estado(v2)).toBe("en_produccion");
    const p = (await get(rutaPedido, v2, produccion)).cuerpo.tienda.pendientes[0];
    expect(p).toMatchObject({ estado: "anulacion_solicitada" });
    expect((await post(rutaResolver, { id: v2, recepcionId: p.id }, produccion, { accion: "descartar", motivo: "Ya está fabricada; la tienda la retira" })).estado).toBe(200);
    expect(await estado(v2)).toBe("en_produccion");

    const desconocido = "pedido-que-nunca-llego";
    const anulacion = await enviar(mensajeAnulacion(desconocido, 3, "742"));
    expect(anulacion).toMatchObject({ estado: 202, cuerpo: { status: "accepted" } });
    expect(anulacion.cuerpo.factoryOrderId).toBeUndefined();
    expect((await enviar(await mensajeListo({ numero: "742", sourceOrderId: desconocido, revision: 2 }))).cuerpo.error.code).toBe("stale_revision");
  });
});
