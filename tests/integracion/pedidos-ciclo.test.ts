import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import { DobleIA } from "@/ai/doble";
import { procesarSiguiente } from "@/ai/procesar";
import * as rutaAprobar from "@/app/api/v1/cotizaciones/[id]/aprobar/route";
import * as rutaItem from "@/app/api/v1/cotizaciones/[id]/items/[itemId]/route";
import * as rutaItems from "@/app/api/v1/cotizaciones/[id]/items/route";
import * as rutaCot from "@/app/api/v1/cotizaciones/[id]/route";
import * as rutaInterp from "@/app/api/v1/cotizaciones/interpretaciones/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import * as rutaCompletar from "@/app/api/v1/pedidos/[id]/completar-reserva/route";
import * as rutaDespachar from "@/app/api/v1/pedidos/[id]/despachar/route";
import * as rutaLista from "@/app/api/v1/pedidos/[id]/lista/route";
import * as rutaProduccion from "@/app/api/v1/pedidos/[id]/produccion/route";
import * as rutaPedido from "@/app/api/v1/pedidos/[id]/route";
import * as rutaPedidos from "@/app/api/v1/pedidos/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearMateriaPrima, registrarRecepcion } from "@/domain/materias-primas";
import { cerrarOrden } from "@/domain/ordenes";
import { crearRol } from "@/domain/roles";
import { articuloPorCodigo, saldo } from "@/domain/stock";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
const idem = () => ({ "idempotency-key": randomUUID() });
type S = { token: string; csrf: string };
let s: S;
let usuarioId: string;
let clienteId: string;
let fuy: string;
let pedido: string;

async function sesionDe(email: string, clave: string, ip: string): Promise<S> {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
const accion = (ruta: { POST: typeof rutaLista.POST }, cuerpo: object = {}, sesion = s) =>
  llamar(ruta.POST, "POST", `/api/v1/pedidos/${pedido}/x`, { ...sesion, cabeceras: idem(), cuerpo }, { id: pedido });
const ver = async () => (await llamar(rutaPedido.GET, "GET", "/x", s, { id: pedido })).cuerpo;
const stockFuy = () => saldo(bd(), { articuloId: fuy });

/** Cotización aprobada con 3 FUY-O-2-A (de catálogo) y 2 Toltén a pedido con precio fijado. */
async function cotizacionMixta() {
  const id = (await llamar(rutaInterp.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { texto: "2 Toltén raulí de 87x215", clienteId } })).cuerpo.id;
  await procesarSiguiente(new DobleIA(), { esperasMs: [1] });
  let c = (await llamar(rutaCot.GET, "GET", "/x", s, { id })).cuerpo;
  c = (await llamar(rutaItem.PATCH, "PATCH", "/x", { ...s, cuerpo: { precioUnitario: 400000, version: c.version } }, { id, itemId: c.items[0].id })).cuerpo;
  c = (await llamar(rutaItems.POST, "POST", "/x", { ...s, cuerpo: { codigo: "FUY-O-2-A", cantidad: 3, version: c.version } }, { id })).cuerpo;
  await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: c.version } }, { id });
  return id as string;
}

beforeAll(async () => {
  usuarioId = (await bd().transaction((tx) => crearUsuario(tx, { email: "ciclo@neltume.cl", nombre: "Ciclo", clave: "clave-ciclo-1" }, sistema, "consola"))).id;
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: usuarioId });
  clienteId = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Ferretería Puyehue", rut: "11.111.111-1" }, sistema, "consola"))).id;
  s = await sesionDe("ciclo@neltume.cl", "clave-ciclo-1", "10.25.0.1");
  fuy = (await articuloPorCodigo(bd(), "FUY-O-2-A")).id;
  await llamar(rutaEntradas.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { codigo: "FUY-O-2-A", cantidad: 2 } });
  pedido = (await llamar(rutaPedidos.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { cotizacionId: await cotizacionMixta() } })).cuerpo.id;
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("ciclo de la nota de pedido (REQ-COT-8.5, REQ-STK-4.4, 7.5)", () => {
  it("con faltante no se marca lista", async () => {
    expect((await ver()).items.map((i: { reservado: number; faltante: number }) => [i.reservado, i.faltante])).toEqual([[0, 2], [2, 1]]);
    expect((await accion(rutaLista, { confirmarAPedido: true })).cuerpo.error.codigo).toBe("STOCK_INSUFICIENTE");
  });

  it("pasar a producción crea la orden por el faltante de catálogo (no por los ítems a pedido)", async () => {
    const r = await accion(rutaProduccion);
    expect(r.cuerpo.pedido.estado).toBe("en_produccion");
    const { rows } = await app.query("SELECT a.codigo, l.cantidad FROM orden_linea l JOIN articulo a ON a.id = l.articulo_id JOIN orden_produccion o ON o.id = l.orden_id WHERE o.nota_pedido_id = $1", [pedido]);
    expect(rows).toEqual([{ codigo: "FUY-O-2-A", cantidad: 1 }]);
    expect((await ver()).ordenes).toEqual([expect.objectContaining({ estado: "abierta" })]);
  });

  it("cerrar la orden reserva lo producido para el pedido", async () => {
    const mp = await bd().transaction((tx) => crearMateriaPrima(tx, { nombre: "Tabla oregón", unidadCodigo: "pulg" }, sistema, "consola"));
    await bd().transaction((tx) => registrarRecepcion(tx, { materiaPrimaId: mp.id, cantidad: 10 }, { tipo: "usuario", id: usuarioId }, "consola"));
    const orden = (await ver()).ordenes[0].id;
    await bd().transaction((tx) => cerrarOrden(tx, orden, [{ materiaPrimaId: mp.id, cantidad: 5 }], { tipo: "usuario", id: usuarioId }, "consola"));
    const p = await ver();
    expect(p.items[1]).toMatchObject({ reservado: 3, faltante: 0 });
    expect(await stockFuy()).toMatchObject({ existencia: 3, reservado: 3, disponible: 0 });
  });

  it("lista exige confirmar los ítems a pedido; la entrega comprometida y las observaciones se editan y auditan", async () => {
    expect((await accion(rutaLista)).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await accion(rutaLista, { confirmarAPedido: true })).cuerpo.estado).toBe("lista");
    const r = await llamar(rutaPedido.PATCH, "PATCH", "/x", { ...s, cuerpo: { entregaComprometida: "2026-11-20", observaciones: "Llamar antes de llegar" } }, { id: pedido });
    expect(r.cuerpo).toMatchObject({ entregaComprometida: "2026-11-20", observaciones: "Llamar antes de llegar" });
  });

  it("despachar libera la reserva y descuenta el stock; luego el pedido queda cerrado", async () => {
    const r = await accion(rutaDespachar);
    expect(r.cuerpo).toMatchObject({ estado: "despachada", despachadaEn: expect.any(String) });
    expect(await stockFuy()).toMatchObject({ existencia: 0, reservado: 0, disponible: 0 });
    // La reserva se libera por artículo; la salida es puerta por puerta, con su código (ADR-0018).
    const { rows } = await app.query(`SELECT tipo, sum(cantidad)::int AS cantidad, count(DISTINCT puerta_id)::int AS puertas FROM movimiento
      WHERE ref_tipo = 'pedido' AND ref_id = $1 AND tipo IN ('liberacion', 'salida_despacho') GROUP BY tipo ORDER BY tipo`, [pedido]);
    expect(rows).toEqual([{ tipo: "liberacion", cantidad: -3, puertas: 0 }, { tipo: "salida_despacho", cantidad: -3, puertas: 3 }]);
    expect(r.cuerpo.puertasDespachadas).toHaveLength(3);
    expect((await accion(rutaDespachar)).cuerpo.error.codigo).toBe("NO_EDITABLE");
    expect((await llamar(rutaPedido.PATCH, "PATCH", "/x", { ...s, cuerpo: { observaciones: "tarde" } }, { id: pedido })).cuerpo.error.codigo).toBe("NO_EDITABLE");
    const audit = await app.query("SELECT accion FROM audit_log WHERE recurso = 'nota_pedido' AND recurso_id = $1 ORDER BY id", [pedido]);
    expect(audit.rows.map((x) => x.accion)).toEqual(expect.arrayContaining(["pedido en produccion", "completar reserva", "pedido lista", "editar despacho", "pedido despachada"]));
  });

  it("completar la reserva a mano toma el stock que entró después", async () => {
    pedido = (await llamar(rutaPedidos.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { cotizacionId: await cotizacionMixta() } })).cuerpo.id;
    expect((await ver()).items[1]).toMatchObject({ reservado: 0, faltante: 3 });
    await llamar(rutaEntradas.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { codigo: "FUY-O-2-A", cantidad: 2 } });
    expect((await accion(rutaCompletar)).cuerpo).toMatchObject({ reservado: 2 });
    expect((await ver()).items[1]).toMatchObject({ reservado: 2, faltante: 1 });
  });

  it("al despachar se eligen las puertas: solo de los artículos del pedido y en la cantidad justa (REQ-STK-8.3)", async () => {
    await llamar(rutaEntradas.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { codigo: "FUY-O-2-A", puertas: ["FUY-ELEGIDA"] } });
    await accion(rutaCompletar);
    await accion(rutaLista, { confirmarAPedido: true });
    const { rows } = await app.query(`SELECT p.codigo FROM puerta p JOIN v_puerta v ON v.puerta_id = p.id JOIN articulo a ON a.id = p.articulo_id
      WHERE a.codigo = 'FUY-O-2-A' AND v.existencia = 1 ORDER BY p.codigo`);
    const codigos = rows.map((x) => x.codigo as string);
    expect(codigos).toContain("FUY-ELEGIDA");
    expect((await accion(rutaDespachar, { puertas: codigos.slice(0, 2) })).cuerpo.error.codigo).toBe("VALIDACION");
    const r = await accion(rutaDespachar, { puertas: codigos.slice(0, 3) });
    expect(r.cuerpo).toMatchObject({ estado: "despachada" });
    expect([...r.cuerpo.puertasDespachadas].sort()).toEqual(codigos.slice(0, 3).sort());
  });

  it("sin pedidos.gestionar (o sin producción para crear la orden) se deniega y se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "pedidos sin produccion", ["pedidos.gestionar"], sistema, "consola"));
    const rol2 = await bd().transaction((tx) => crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "ped@neltume.cl", nombre: "Ped", clave: "clave-ped-123", rolId: rol.id }, sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "nada-ped@neltume.cl", nombre: "Nada", clave: "clave-nada-ped", rolId: rol2.id }, sistema, "consola"));
    const ped = await sesionDe("ped@neltume.cl", "clave-ped-123", "10.25.0.2");
    const nada = await sesionDe("nada-ped@neltume.cl", "clave-nada-ped", "10.25.0.3");
    expect((await accion(rutaProduccion, {}, ped)).cuerpo.error.codigo).toBe("SIN_PERMISO");
    expect((await accion(rutaDespachar, {}, nada)).cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT count(*)::int AS n FROM audit_log WHERE resultado = 'denegado' AND accion LIKE 'POST /api/v1/pedidos/%'");
    expect(rows[0].n).toBe(2);
  });
});
