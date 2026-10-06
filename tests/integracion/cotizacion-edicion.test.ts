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
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
let s: { token: string; csrf: string };
let id: string;
let clienteId: string;
const idem = () => ({ "idempotency-key": randomUUID() });
const ver = async () => (await llamar(rutaCot.GET, "GET", "/x", s, { id })).cuerpo;

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "edita@neltume.cl", nombre: "Edita", clave: "clave-edita" }, { tipo: "sistema" }, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  clienteId = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Constructora Los Alerces", rut: "12.345.678-5" }, { tipo: "sistema" }, "consola"))).id;
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "edita@neltume.cl", clave: "clave-edita" }, ip: "10.13.0.1" });
  s = { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
  id = (await llamar(rutaInterp.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { texto: "Necesito cotizar 3 puertas Neltume en raulí de 90x210, 2 de roble con chapa y 2 Toltén raulí de 87x215" } })).cuerpo.id;
  await procesarSiguiente(new DobleIA(), { esperasMs: [1] });
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("revisión y aprobación (REQ-COT-2.5, 3.2–3.4, 4.1, 4.5, 6.1, 6.2)", () => {
  it("no se aprueba con ítems por confirmar", async () => {
    const c = await ver();
    const r = await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: c.version } }, { id });
    expect(r.cuerpo.error.codigo).toBe("ITEMS_POR_CONFIRMAR");
  });

  it("no acepta importes en ítems que no son a pedido (SECURITY T2) ni campos de total", async () => {
    const c = await ver();
    const ok = c.items.find((i: { estadoItem: string }) => i.estadoItem === "ok");
    const r = await llamar(rutaItem.PATCH, "PATCH", "/x", { ...s, cuerpo: { precioUnitario: 1, version: c.version } }, { id, itemId: ok.id });
    expect(r.cuerpo.error.codigo).toBe("CAMPO_NO_PERMITIDO");
    const t = await llamar(rutaItem.PATCH, "PATCH", "/x", { ...s, cuerpo: { totalLinea: 1, version: c.version } }, { id, itemId: ok.id });
    expect(t.estado).toBe(400);
  });

  it("resuelve el ítem por confirmar eligiendo un artículo y fija el precio del a pedido", async () => {
    let c = await ver();
    const roble = c.items.find((i: { estadoItem: string }) => i.estadoItem === "por_confirmar");
    c = (await llamar(rutaItem.PATCH, "PATCH", "/x", { ...s, cuerpo: { codigo: "LIC-L-4-B", version: c.version } }, { id, itemId: roble.id })).cuerpo;
    expect(c.items.find((i: { id: string }) => i.id === roble.id)).toMatchObject({ estadoItem: "ok", descripcion: expect.stringContaining("Lican") });
    const aPedido = c.items.find((i: { estadoItem: string }) => i.estadoItem === "a_pedido");
    expect(Number(aPedido.precioReferencia)).toBeGreaterThan(0);
    c = (await llamar(rutaItem.PATCH, "PATCH", "/x", { ...s, cuerpo: { precioUnitario: 400000, version: c.version } }, { id, itemId: aPedido.id })).cuerpo;
    expect(c.items.find((i: { id: string }) => i.id === aPedido.id)).toMatchObject({ estadoItem: "ok", precioUnitario: 400000, totalLinea: 800000 });
    expect(c.pendientes).toBe(0);
    expect(Number(c.subtotal)).toBe(c.items.reduce((t: number, i: { totalLinea: number }) => t + Number(i.totalLinea), 0));
  });

  it("una versión vieja → 409 VERSION_OBSOLETA", async () => {
    const c = await ver();
    const r = await llamar(rutaItems.POST, "POST", "/x", { ...s, cuerpo: { codigo: "FUY-O-2-A", cantidad: 1, version: c.version - 1 } }, { id });
    expect(r.cuerpo.error.codigo).toBe("VERSION_OBSOLETA");
  });

  it("aprobar exige cliente; luego congela, fija vigencia de 10 días hábiles y aprobador", async () => {
    let c = await ver();
    expect((await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: c.version } }, { id })).estado).toBe(400);
    c = (await llamar(rutaCot.PATCH, "PATCH", "/x", { ...s, cuerpo: { clienteId, version: c.version } }, { id })).cuerpo;
    const r = await llamar(rutaAprobar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { version: c.version } }, { id });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.vigenciaHasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    c = await ver();
    expect(c).toMatchObject({ estado: "aprobada", aprobador: "Edita" });
  });

  it("aprobada: no se editan ítems ni cabecera (409 NO_EDITABLE)", async () => {
    const c = await ver();
    const r = await llamar(rutaItems.POST, "POST", "/x", { ...s, cuerpo: { codigo: "FUY-O-2-A", cantidad: 1, version: c.version } }, { id });
    expect(r.cuerpo.error.codigo).toBe("NO_EDITABLE");
    const { rows } = await app.query("SELECT accion FROM audit_log WHERE recurso = 'cotizacion' AND recurso_id = $1 AND resultado = 'ok' ORDER BY id", [id]);
    expect(rows.map((x) => x.accion)).toEqual(expect.arrayContaining(["resolver ítem", "fijar precio a pedido", "aprobar"]));
  });
});
