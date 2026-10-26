import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import { DobleIA } from "@/ai/doble";
import { procesarSiguiente } from "@/ai/procesar";
import * as rutaCot from "@/app/api/v1/cotizaciones/[id]/route";
import * as rutaInterp from "@/app/api/v1/cotizaciones/interpretaciones/route";
import * as rutaCots from "@/app/api/v1/cotizaciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let s: { token: string; csrf: string };
const idem = () => ({ "idempotency-key": randomUUID() });

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "manual@neltume.cl", nombre: "Manual", clave: "clave-manual" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  s = await sesionDe("manual@neltume.cl", "clave-manual", "10.15.0.1");
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("cotización manual (REQ-COT-5.1–5.3)", () => {
  it("calcula igual que la cotización con IA para el mismo artículo y cantidad", async () => {
    const ia = (await llamar(rutaInterp.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { texto: "Necesito cotizar 3 puertas Neltume en raulí de 90x210, 2 de roble con chapa y 2 Toltén raulí de 87x215" } })).cuerpo.id;
    await procesarSiguiente(new DobleIA(), { esperasMs: [1] });
    const conIa = (await llamar(rutaCot.GET, "GET", "/x", s, { id: ia })).cuerpo.items.find((i: { estadoItem: string }) => i.estadoItem === "ok");
    const { rows: [{ codigo }] } = await app.query("SELECT codigo FROM articulo WHERE id = $1", [conIa.articuloId]);

    const r = await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { items: [{ codigo, cantidad: conIa.cantidad }] } });
    expect(r.estado).toBe(201);
    const manual = (await llamar(rutaCot.GET, "GET", "/x", s, { id: r.cuerpo.id })).cuerpo;
    expect(manual).toMatchObject({ origen: "manual", estado: "borrador", textoOriginal: null });
    // La cotización con IA trae la medida exacta pedida; la manual, sin medida pedida, la descripción del catálogo (su rango).
    expect(conIa).toMatchObject({ descripcion: "Neltume · Raulí · 0,90 × 2,10 m", medidaSolicitada: "900 × 2100 mm" });
    expect(manual.items[0]).toMatchObject({ estadoItem: "ok", descripcion: "Neltume · Raulí · 0,90 a 0,95 × 2,10 m", medidaSolicitada: null, precioUnitario: conIa.precioUnitario, totalLinea: conIa.totalLinea });
    expect(Number(manual.subtotal)).toBe(Number(conIa.totalLinea));
  });

  it("una línea fuera de catálogo queda por confirmar y sin precio", async () => {
    const r = await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { items: [{ codigo: "FUY-O-2-A", cantidad: 1 }, { detalle: "Puerta corredera 1,20 × 2,40", cantidad: 1 }] } });
    const c = (await llamar(rutaCot.GET, "GET", "/x", s, { id: r.cuerpo.id })).cuerpo;
    expect(c.items[1]).toMatchObject({ estadoItem: "por_confirmar", precioUnitario: null, duda: "Puerta corredera 1,20 × 2,40" });
    expect(c.pendientes).toBe(1);
    expect(Number(c.subtotal)).toBe(Number(c.items[0].totalLinea));
  });

  it("un código inexistente o un importe en el cuerpo se rechazan", async () => {
    const r = await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { items: [{ codigo: "NO-EXISTE-9", cantidad: 1 }] } });
    expect(r.cuerpo.error.codigo).toBe("VALIDACION");
    const p = await llamar(rutaCots.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { items: [{ codigo: "FUY-O-2-A", cantidad: 1, precioUnitario: 1 }] } });
    expect(p.estado).toBe(400);
  });

  it("sin cotizaciones.crear se deniega y se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "stock@neltume.cl", nombre: "Stock", clave: "clave-stock", rolId: rol.id }, sistema, "consola"));
    const otra = await sesionDe("stock@neltume.cl", "clave-stock", "10.15.0.2");
    const r = await llamar(rutaCots.POST, "POST", "/api/v1/cotizaciones", { ...otra, cabeceras: idem(), cuerpo: { items: [{ codigo: "FUY-O-2-A", cantidad: 1 }] } });
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion LIKE 'POST%cotizaciones'");
    expect(rows.length).toBeGreaterThan(0);
  });
});
