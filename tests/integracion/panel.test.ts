import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAprobar from "@/app/api/v1/cotizaciones/[id]/aprobar/route";
import * as rutaCots from "@/app/api/v1/cotizaciones/route";
import * as rutaPedidos from "@/app/api/v1/pedidos/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { cifrasDelMes, pedidosConFaltante, porRevisar } from "@/domain/panel";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
const idem = () => ({ "idempotency-key": randomUUID() });
let s: { token: string; csrf: string };

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "panel@neltume.cl", nombre: "Panel", clave: "clave-panel-1" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  const clienteId = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Maderas del Sur", rut: "11.111.111-1" }, sistema, "consola"))).id;
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "panel@neltume.cl", clave: "clave-panel-1" }, ip: "10.19.0.1" });
  s = { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
  // Un borrador con una línea por confirmar y una cotización aprobada convertida en pedido sin stock.
  await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { clienteId, items: [{ codigo: "FUY-O-2-A", cantidad: 1 }, { detalle: "Corredera 1,20", cantidad: 1 }] } });
  const id = (await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { clienteId, items: [{ codigo: "FUY-O-2-A", cantidad: 3 }] } })).cuerpo.id;
  await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: 1 } }, { id });
  await llamar(rutaPedidos.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { cotizacionId: id } });
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("panel de inicio (UX §1)", () => {
  it("lista los borradores con sus pendientes y oculta el cliente sin clientes.ver", async () => {
    const r = await porRevisar(bd(), true);
    expect(r.total).toBe(1);
    expect(r.filas[0]).toMatchObject({ estado: "borrador", pendientes: 1, cliente: "Maderas del Sur" });
    expect((await porRevisar(bd(), false)).filas[0].cliente).toBe("(oculto)");
  });

  it("cuenta las cotizaciones del mes, los ítems por confirmar y lo que hay en pedidos abiertos", async () => {
    const c = await cifrasDelMes(bd());
    expect(c).toMatchObject({ creadas: 2, porConfirmar: 1, borradores: 1, pedidosAbiertos: 1 });
    expect(c.totalPedidos).toBeGreaterThan(0);
    expect(c.medianaMin).not.toBeNull();
  });

  it("muestra los pedidos abiertos que esperan fabricación", async () => {
    expect(await pedidosConFaltante(bd(), true)).toEqual([expect.objectContaining({ faltante: 3, cliente: "Maderas del Sur" })]);
  });
});
