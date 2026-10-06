import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAprobar from "@/app/api/v1/cotizaciones/[id]/aprobar/route";
import * as rutaCots from "@/app/api/v1/cotizaciones/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import * as rutaCancelar from "@/app/api/v1/pedidos/[id]/cancelar/route";
import * as rutaPedido from "@/app/api/v1/pedidos/[id]/route";
import * as rutaPedidos from "@/app/api/v1/pedidos/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { articuloPorCodigo, saldo } from "@/domain/stock";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
const idem = () => ({ "idempotency-key": randomUUID() });
let s: { token: string; csrf: string };
let clienteId: string;
let usuarioId: string;
let fuy: string;

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
async function cotizacionAprobada(items: { codigo: string; cantidad: number }[]) {
  const id = (await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { clienteId, items } })).cuerpo.id;
  await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: 1 } }, { id });
  return id as string;
}
const pedir = (cotizacionId: string, extra = {}) => llamar(rutaPedidos.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { cotizacionId, ...extra } });
const disponibleFuy = async () => (await saldo(bd(), { articuloId: fuy })).disponible;

beforeAll(async () => {
  usuarioId = (await bd().transaction((tx) => crearUsuario(tx, { email: "pedidos@neltume.cl", nombre: "Pedidos", clave: "clave-pedidos" }, sistema, "consola"))).id;
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: usuarioId });
  clienteId = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Ferretería Puyehue", rut: "11.111.111-1", direccionDespacho: "Camino a Neltume km 3" }, sistema, "consola"))).id;
  s = await sesionDe("pedidos@neltume.cl", "clave-pedidos", "10.17.0.1");
  fuy = (await articuloPorCodigo(bd(), "FUY-O-2-A")).id;
  await llamar(rutaEntradas.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { codigo: "FUY-O-2-A", cantidad: 2, referencia: "stock inicial" } });
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("nota de pedido y reserva (REQ-COT-8.1–8.4, REQ-STK-7.1–7.4)", () => {
  let cot: string;
  let pedido: string;

  it("un borrador no se convierte → 409 NO_APROBADA", async () => {
    const id = (await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { clienteId, items: [{ codigo: "FUY-O-2-A", cantidad: 1 }] } })).cuerpo.id;
    expect((await pedir(id)).cuerpo.error.codigo).toBe("NO_APROBADA");
  });

  it("reserva lo disponible, marca el faltante y copia los precios congelados", async () => {
    cot = await cotizacionAprobada([{ codigo: "FUY-O-2-A", cantidad: 3 }, { codigo: "LIC-L-4-B", cantidad: 1 }]);
    const r = await pedir(cot, { medioTransporte: "Camión propio" });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.faltante).toBe(2);
    pedido = r.cuerpo.id;
    const p = (await llamar(rutaPedido.GET, "GET", "/x", s, { id: pedido })).cuerpo;
    expect(p).toMatchObject({ estado: "pendiente", direccionDespacho: "Camino a Neltume km 3", medioTransporte: "Camión propio", cliente: { nombre: "Ferretería Puyehue" } });
    expect(p.items.map((i: { codigo: string; reservado: number; faltante: number }) => [i.codigo, i.reservado, i.faltante])).toEqual([["FUY-O-2-A", 2, 1], ["LIC-L-4-B", 0, 1]]);
    expect(Number(p.items[0].totalLinea)).toBe(Number(p.items[0].precioUnitario) * 3);
    expect(await disponibleFuy()).toBe(0);
    const { rows } = await app.query("SELECT estado FROM cotizacion WHERE id = $1", [cot]);
    expect(rows[0].estado).toBe("aceptada");
    const movs = await app.query("SELECT cantidad FROM movimiento WHERE tipo = 'reserva' AND ref_tipo = 'pedido' AND ref_id = $1", [pedido]);
    expect(movs.rows.map((m) => Number(m.cantidad))).toEqual([2]);
  });

  it("la misma cotización no genera otro pedido → 409 YA_TIENE_PEDIDO", async () => {
    expect((await pedir(cot)).cuerpo.error.codigo).toBe("YA_TIENE_PEDIDO");
  });

  it("una cotización vencida no se convierte → 409 VENCIDA", async () => {
    const { rows } = await app.query(
      "INSERT INTO cotizacion (estado, origen, cliente_id, vigencia_hasta, creado_por) VALUES ('aprobada', 'manual', $1, '2026-01-02', $2) RETURNING id", [clienteId, usuarioId]);
    expect((await pedir(rows[0].id)).cuerpo.error.codigo).toBe("VENCIDA");
  });

  it("cancelar libera las reservas con un movimiento y no se cancela dos veces", async () => {
    expect((await llamar(rutaCancelar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { motivo: "" } }, { id: pedido })).estado).toBe(400);
    const r = await llamar(rutaCancelar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { motivo: "El cliente desistió" } }, { id: pedido });
    expect(r.cuerpo.estado).toBe("cancelada");
    expect(await disponibleFuy()).toBe(2);
    const movs = await app.query("SELECT cantidad FROM movimiento WHERE tipo = 'liberacion' AND ref_id = $1", [pedido]);
    expect(movs.rows.map((m) => Number(m.cantidad))).toEqual([-2]);
    const otra = await llamar(rutaCancelar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { motivo: "otra vez" } }, { id: pedido });
    expect(otra.cuerpo.error.codigo).toBe("NO_EDITABLE");
  });

  it("dos pedidos simultáneos nunca reservan más de lo disponible", async () => {
    const [a, b] = await Promise.all([cotizacionAprobada([{ codigo: "FUY-O-2-A", cantidad: 2 }]), cotizacionAprobada([{ codigo: "FUY-O-2-A", cantidad: 2 }])]);
    const [ra, rb] = await Promise.all([pedir(a), pedir(b)]);
    expect([ra.estado, rb.estado]).toEqual([201, 201]);
    expect(ra.cuerpo.faltante + rb.cuerpo.faltante).toBe(2);
    expect(await disponibleFuy()).toBe(0);
  });

  it("sin pedidos.gestionar se deniega y se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo cotiza", ["cotizaciones.crear", "cotizaciones.aprobar"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "sinpedidos@neltume.cl", nombre: "Sin Pedidos", clave: "clave-sinpedidos", rolId: rol.id }, sistema, "consola"));
    const otra = await sesionDe("sinpedidos@neltume.cl", "clave-sinpedidos", "10.17.0.2");
    const r = await llamar(rutaPedidos.POST, "POST", "/api/v1/pedidos", { ...otra, cabeceras: idem(), cuerpo: { cotizacionId: cot } });
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion = 'POST /api/v1/pedidos'");
    expect(rows).toHaveLength(1);
  });
});
