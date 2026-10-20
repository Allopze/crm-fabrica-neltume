import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAprobar from "@/app/api/v1/cotizaciones/[id]/aprobar/route";
import * as rutaCots from "@/app/api/v1/cotizaciones/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import * as rutaCancelar from "@/app/api/v1/pedidos/[id]/cancelar/route";
import * as rutaCompletar from "@/app/api/v1/pedidos/[id]/completar-reserva/route";
import * as rutaDespachar from "@/app/api/v1/pedidos/[id]/despachar/route";
import * as rutaExcepcion from "@/app/api/v1/pedidos/[id]/excepcion-pago/route";
import * as rutaLista from "@/app/api/v1/pedidos/[id]/lista/route";
import * as rutaReverso from "@/app/api/v1/pedidos/[id]/pagos/[pagoId]/reverso/route";
import * as rutaPagos from "@/app/api/v1/pedidos/[id]/pagos/route";
import * as rutaProduccion from "@/app/api/v1/pedidos/[id]/produccion/route";
import * as rutaPedido from "@/app/api/v1/pedidos/[id]/route";
import * as rutaPedidos from "@/app/api/v1/pedidos/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { hoySantiago } from "@/domain/precios/dias-habiles";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

// Pagos de la nota de pedido (ADR-0020): abono para producir, pago total para despachar, excepción con motivo,
// reverso en vez de edición y cancelación que conserva lo pagado.
const app = poolApp();
const owner = poolOwner();
const sistema = { tipo: "sistema" as const };
const idem = () => ({ "idempotency-key": randomUUID() });
type S = { token: string; csrf: string };
let s: S;
let clienteId: string;
const pedidos: Record<string, string> = {};

async function sesionDe(email: string, clave: string, ip: string): Promise<S> {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
async function nuevoPedido(cantidad: number, cliente = clienteId) {
  const id = (await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { clienteId: cliente, items: [{ codigo: "FUY-O-2-A", cantidad }] } })).cuerpo.id;
  await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: 1 } }, { id });
  return (await llamar(rutaPedidos.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { cotizacionId: id } })).cuerpo.id as string;
}
const ver = async (id: string) => (await llamar(rutaPedido.GET, "GET", "/x", s, { id })).cuerpo;
const accion = (ruta: { POST: typeof rutaLista.POST }, id: string, cuerpo: object = {}, sesion = s, sub = "x") =>
  llamar(ruta.POST, "POST", `/api/v1/pedidos/${id}/${sub}`, { ...sesion, cabeceras: idem(), cuerpo }, { id });
const pagar = (id: string, monto: number, extra: object = {}, sesion = s) =>
  accion(rutaPagos, id, { monto, fecha: hoySantiago(), medio: "transferencia", ...extra }, sesion, "pagos");
const revertir = (id: string, pagoId: string, motivo: string, sesion = s) =>
  llamar(rutaReverso.POST, "POST", `/api/v1/pedidos/${id}/pagos/${pagoId}/reverso`, { ...sesion, cabeceras: idem(), cuerpo: { motivo } }, { id, pagoId });
const entrada = (cantidad: number) => llamar(rutaEntradas.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { codigo: "FUY-O-2-A", cantidad } });

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "pagos@neltume.cl", nombre: "Caja", clave: "clave-pagos-1" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  clienteId = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Constructora Lican", rut: "11.111.111-1" }, sistema, "consola"))).id;
  s = await sesionDe("pagos@neltume.cl", "clave-pagos-1", "10.26.0.1");
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("pagos de la nota de pedido (REQ-COT-8.10–8.14, ADR-0020)", () => {
  it("sin abono no se produce; un pago no supera el saldo, no es futuro ni trae otros importes", async () => {
    const id = pedidos.a = await nuevoPedido(2);
    const { pago } = await ver(id);
    expect(pago).toMatchObject({ estado: "sin_abono", pagado: 0, abonoPct: 50, abonoRequerido: Math.ceil(pago.total / 2), saldo: pago.total });
    expect((await accion(rutaProduccion, id)).cuerpo.error.codigo).toBe("ABONO_PENDIENTE");

    expect((await pagar(id, pago.total + 1)).cuerpo.error.codigo).toBe("SOBREPAGO");
    expect((await pagar(id, 0)).estado).toBe(400);
    const manana = new Date(Date.parse(hoySantiago()) + 86_400_000).toISOString().slice(0, 10);
    expect((await pagar(id, 1000, { fecha: manana })).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await pagar(id, 1000, { total: 1 })).estado).toBe(400);

    expect((await pagar(id, pago.abonoRequerido - 1)).cuerpo).toMatchObject({ estado: "sin_abono", faltaAbono: 1 });
    expect((await accion(rutaProduccion, id)).cuerpo.error.codigo).toBe("ABONO_PENDIENTE");
    expect((await pagar(id, 1, { medio: "efectivo", referencia: "Boleta 77" })).cuerpo).toMatchObject({ estado: "abonado", faltaAbono: 0 });
    expect((await accion(rutaProduccion, id)).cuerpo.pedido.estado).toBe("en_produccion");
  });

  it("un error se corrige con un reverso con motivo, una sola vez", async () => {
    const id = pedidos.a;
    const [primero] = (await ver(id)).pagos;
    expect((await revertir(id, primero.id, " ")).estado).toBe(400);
    const r = await revertir(id, primero.id, "Transferencia duplicada");
    expect(r.cuerpo).toMatchObject({ pagado: 1, estado: "sin_abono" });
    expect((await revertir(id, primero.id, "otra vez")).cuerpo.error.codigo).toBe("YA_REVERTIDO");
    const { pagos } = await ver(id);
    const reverso = pagos.find((p: { revierteId: string | null }) => p.revierteId === primero.id);
    expect(reverso).toMatchObject({ monto: -primero.monto, motivo: "Transferencia duplicada" });
    expect(pagos.find((p: { id: string }) => p.id === primero.id).revertido).toBe(true);
    expect((await revertir(id, reverso.id, "deshacer")).cuerpo.error.codigo).toBe("VALIDACION");
  });

  it("con saldo no se despacha; pagado el saldo, sí", async () => {
    const id = pedidos.a;
    await entrada(2);
    await accion(rutaCompletar, id);
    expect((await accion(rutaLista, id)).cuerpo.estado).toBe("lista");
    expect((await accion(rutaDespachar, id)).cuerpo.error.codigo).toBe("SALDO_PENDIENTE");
    const { pago } = await ver(id);
    expect((await pagar(id, pago.saldo)).cuerpo).toMatchObject({ estado: "pagado", saldo: 0 });
    expect((await pagar(id, 1)).cuerpo.error.codigo).toBe("SOBREPAGO");
    expect((await accion(rutaDespachar, id)).cuerpo.estado).toBe("despachada");
  });

  it("las excepciones con motivo habilitan producir sin abono y despachar con saldo", async () => {
    const id = pedidos.b = await nuevoPedido(1);
    expect((await accion(rutaExcepcion, id, { tipo: "abono", motivo: "" })).estado).toBe(400);
    expect((await accion(rutaExcepcion, id, { tipo: "abono", motivo: "Cliente de años, paga al retirar" })).cuerpo.excepcionAbonoMotivo).toBe("Cliente de años, paga al retirar");
    expect((await accion(rutaExcepcion, id, { tipo: "abono", motivo: "otra" })).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await accion(rutaProduccion, id)).cuerpo.pedido.estado).toBe("en_produccion");
    await entrada(1);
    await accion(rutaCompletar, id);
    await accion(rutaLista, id);
    expect((await accion(rutaDespachar, id)).cuerpo.error.codigo).toBe("SALDO_PENDIENTE");
    await accion(rutaExcepcion, id, { tipo: "saldo", motivo: "Crédito a 30 días" });
    expect((await accion(rutaDespachar, id)).cuerpo.estado).toBe("despachada");
    // El saldo de una nota despachada a crédito se sigue pudiendo cobrar.
    const { pago } = await ver(id);
    expect((await pagar(id, pago.saldo)).cuerpo.estado).toBe("pagado");
  });

  it("se puede pagar el total de una vez", async () => {
    const id = pedidos.c = await nuevoPedido(3);
    const { pago } = await ver(id);
    expect((await pagar(id, pago.total)).cuerpo).toMatchObject({ estado: "pagado", saldo: 0, pagado: pago.total });
  });

  it("cancelar con pagos los conserva y deja anotado lo pagado; una nota cancelada no recibe pagos", async () => {
    const id = pedidos.d = await nuevoPedido(1);
    const { pago } = await ver(id);
    await pagar(id, pago.abonoRequerido);
    expect((await accion(rutaCancelar, id, { motivo: "El cliente desistió" })).cuerpo.estado).toBe("cancelada");
    const { rows: [a] } = await app.query("SELECT despues FROM audit_log WHERE accion = 'cancelar pedido' AND recurso_id = $1", [id]);
    expect(a.despues).toMatchObject({ estado: "cancelada", pagado: pago.abonoRequerido });
    expect((await ver(id)).pago).toMatchObject({ pagado: pago.abonoRequerido });
    expect((await pagar(id, 1)).cuerpo.error.codigo).toBe("NO_EDITABLE");
    const { rows: [u] } = await app.query("SELECT id FROM usuario WHERE email = 'pagos@neltume.cl'");
    await expect(owner.query("INSERT INTO pago_pedido (nota_pedido_id, monto, fecha, medio, registrado_por) VALUES ($1, 1, current_date, 'efectivo', $2)", [id, u.id]))
      .rejects.toThrow(/cancelada/);
  });

  it("las notas anteriores al control de pagos no lo exigen", async () => {
    const id = pedidos.e = await nuevoPedido(1);
    await owner.query("UPDATE nota_pedido SET exige_pago = false WHERE id = $1", [id]);
    expect((await ver(id)).pago.estado).toBe("sin_control");
    expect((await accion(rutaProduccion, id)).cuerpo.pedido.estado).toBe("en_produccion");
    expect((await accion(rutaExcepcion, id, { tipo: "saldo", motivo: "x" })).cuerpo.error.codigo).toBe("VALIDACION");
  });

  it("los pagos son de solo inserción y un reverso debe anular su pago por el mismo monto (BD)", async () => {
    const [p] = (await ver(pedidos.c)).pagos;
    await expect(app.query("UPDATE pago_pedido SET monto = 1 WHERE id = $1", [p.id])).rejects.toThrow();
    await expect(owner.query("UPDATE pago_pedido SET monto = 1 WHERE id = $1", [p.id])).rejects.toThrow();
    await expect(owner.query("DELETE FROM pago_pedido WHERE id = $1", [p.id])).rejects.toThrow();
    const { rows: [u] } = await app.query("SELECT id FROM usuario WHERE email = 'pagos@neltume.cl'");
    await expect(owner.query("INSERT INTO pago_pedido (nota_pedido_id, monto, fecha, medio, revierte_id, motivo, registrado_por) VALUES ($1, -1, current_date, 'efectivo', $2, 'x', $3)",
      [pedidos.c, p.id, u.id])).rejects.toThrow(/mismo monto/);
  });

  it("la lista filtra por estado de pago y la ficha trae el historial de estados", async () => {
    const lista = async (q: string) => (await llamar(rutaPedidos.GET, "GET", `/api/v1/pedidos?${q}`, s)).cuerpo.datos.map((p: { id: string }) => p.id);
    expect(await lista("estadoPago=pagado")).toEqual(expect.arrayContaining([pedidos.a, pedidos.b, pedidos.c]));
    expect(await lista("estadoPago=sin_control")).toEqual([pedidos.e]);
    expect(await lista("estadoPago=pagado&estado=despachada")).toEqual(expect.arrayContaining([pedidos.a, pedidos.b]));
    expect(await lista("estadoPago=pagado&estado=despachada")).not.toContain(pedidos.c);
    const { historial } = await ver(pedidos.a);
    expect(historial.map((h: { accion: string }) => h.accion)).toEqual(["crear pedido", "registrar pago", "registrar pago", "pedido en produccion",
      "revertir pago", "completar reserva", "pedido lista", "registrar pago", "pedido despachada"]);
    expect(historial[1]).toMatchObject({ actor: "Caja", detalle: expect.objectContaining({ medio: "transferencia" }) });
  });

  it("sin pagos.registrar se deniega y se audita; cada pago, reverso y excepción queda en audit_log", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "pedidos sin caja", ["pedidos.gestionar"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "sin-caja@neltume.cl", nombre: "Sin caja", clave: "clave-sin-caja", rolId: rol.id }, sistema, "consola"));
    const otro = await sesionDe("sin-caja@neltume.cl", "clave-sin-caja", "10.26.0.2");
    const id = pedidos.c;
    const [p] = (await ver(id)).pagos;
    expect((await pagar(id, 1, {}, otro)).estado).toBe(403);
    expect((await revertir(id, p.id, "x", otro)).estado).toBe(403);
    expect((await accion(rutaExcepcion, id, { tipo: "saldo", motivo: "x" }, otro, "excepcion-pago")).estado).toBe(403);
    const { rows: [d] } = await app.query(`SELECT count(*)::int AS n FROM audit_log WHERE resultado = 'denegado' AND despues->>'motivo' = 'SIN_PERMISO'
      AND accion IN ($1, $2, $3)`, [`POST /api/v1/pedidos/${id}/pagos`, `POST /api/v1/pedidos/${id}/pagos/${p.id}/reverso`, `POST /api/v1/pedidos/${id}/excepcion-pago`]);
    expect(d.n).toBe(3);
    const { rows } = await app.query("SELECT accion, count(*)::int AS n FROM audit_log WHERE resultado = 'ok' AND accion IN ('registrar pago', 'revertir pago', 'excepcion de pago') GROUP BY accion ORDER BY accion");
    expect(rows).toEqual([{ accion: "excepcion de pago", n: 2 }, { accion: "registrar pago", n: 6 }, { accion: "revertir pago", n: 1 }]);
  });
});

describe("la tienda no exige abono ni saldo (REQ-COT-8.17)", () => {
  it("su nota se produce sin abono y registra los pagos que lleguen", async () => {
    const tienda = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Tienda de prueba", rut: "22.222.222-2", tipo: "tienda" }, sistema, "consola"))).id;
    const id = await nuevoPedido(1, tienda);
    const { pago } = await ver(id);
    expect(pago.estado).toBe("sin_control");
    expect((await accion(rutaProduccion, id)).estado).toBe(200);
    expect((await pagar(id, pago.total)).cuerpo.estado).toBe("pagado");
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE recurso = 'nota_pedido' AND recurso_id = $1 AND accion = 'crear pedido'", [id]);
    expect(rows[0].despues.exigePago).toBe(false);
  });
});
