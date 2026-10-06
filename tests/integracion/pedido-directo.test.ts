import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaNota from "@/app/api/v1/pedidos/nota-tienda/route";
import * as rutaPrevia from "@/app/api/v1/pedidos/nota-tienda/vista-previa/route";
import * as rutaPdf from "@/app/api/v1/pedidos/[id]/pdf/route";
import * as rutaPedido from "@/app/api/v1/pedidos/[id]/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { COOKIE_SESION } from "@/domain/auth/politica";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
type S = { token: string; csrf: string };
let s: S;
let tienda: string;
let directo: string;
const pdf = (archivo: string) => readFileSync(`e2e/fixtures/${archivo}`);

async function sesionDe(email: string, clave: string, ip: string): Promise<S> {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

/** POST multipart a una ruta, como lo haría el navegador. */
async function subir(ruta: { POST: typeof rutaNota.POST }, url: string, archivo: Buffer, campos: Record<string, string>, sesion = s) {
  const form = new FormData();
  form.set("archivo", new File([new Uint8Array(archivo)], "nota.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  const req = new NextRequest(new URL(url, "http://localhost"), {
    method: "POST", body: form,
    headers: { cookie: `${COOKIE_SESION}=${sesion.token}`, "x-csrf-token": sesion.csrf, "idempotency-key": randomUUID(), "user-agent": "vitest", "x-forwarded-for": "10.26.0.1" },
  });
  const res = await ruta.POST(req, { params: Promise.resolve({} as never) });
  return { estado: res.status, cuerpo: await res.json() };
}

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "directo@neltume.cl", nombre: "Directo", clave: "clave-directo" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  tienda = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Neltume.co (tienda)", rut: "76.059.066-5", tipo: "tienda" }, sistema, "consola"))).id;
  directo = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Constructora Directa", rut: "11.111.111-1" }, sistema, "consola"))).id;
  s = await sesionDe("directo@neltume.cl", "clave-directo", "10.26.0.1");
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("pedido directo desde la nota de la tienda (ADR-0008, REQ-COT-8.6–8.9)", () => {
  it("la vista previa lee la nota, valida cada código y avisa si el precio difiere de la lista", async () => {
    const r = await subir(rutaPrevia, "/api/v1/pedidos/nota-tienda/vista-previa", pdf("nota-tienda-mini.pdf"), { clienteId: tienda });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ errores: [], duplicada: null, nota: { numero: "41", despacho: { proyecto: "Casa Lago" } } });
    expect(r.cuerpo.lineas.map((l: { codigo: string; precioLista: number; aviso: string | null }) => [l.codigo, l.precioLista, Boolean(l.aviso)]))
      .toEqual([["FUY-O-2-A", 144000, false], ["MAR-O-2X4-B", 19500, true]]);
    expect(JSON.stringify(r.cuerpo)).not.toContain("Cliente Final");
  });

  it("un código inexistente bloquea; un archivo que no es PDF o un cliente que no es tienda se rechazan", async () => {
    const malo = await subir(rutaPrevia, "/x", pdf("nota-tienda-codigo-malo.pdf"), {});
    expect(malo.cuerpo.errores[0]).toContain("ZZZ-O-9-Z");
    expect((await subir(rutaNota, "/x", pdf("nota-tienda-codigo-malo.pdf"), { clienteId: tienda })).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await subir(rutaPrevia, "/x", Buffer.from("no soy un pdf"), {})).estado).toBe(400);
    expect((await subir(rutaNota, "/x", pdf("nota-tienda-mini.pdf"), { clienteId: directo })).cuerpo.error.mensaje).toContain("tienda");
  });

  it("crea el pedido al precio de venta de lista, con reserva, medida solicitada y despacho, sin datos del cliente final", async () => {
    const r = await subir(rutaNota, "/x", pdf("nota-tienda-mini.pdf"), { clienteId: tienda, observaciones: "Llamar al llegar" });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.avisos).toEqual([expect.stringContaining("MAR-O-2X4-B")]);
    const p = (await llamar(rutaPedido.GET, "GET", "/x", s, { id: r.cuerpo.id })).cuerpo;
    expect(p).toMatchObject({
      origen: "nota_tienda", refExterna: "41", cotizacion: null, proyecto: "Casa Lago", estado: "pendiente",
      direccionDespacho: "Camino a Neltume km 3, Panguipulli", medioTransporte: "Camión de fábrica", entregaComprometida: "2026-11-20", observaciones: "Llamar al llegar",
    });
    expect(p.items.map((i: { codigo: string; precioUnitario: number; medidaSolicitada: string | null; faltante: number }) => [i.codigo, Number(i.precioUnitario), i.medidaSolicitada, i.faltante]))
      .toEqual([["FUY-O-2-A", 144000, "720 × 2000 mm (Vano)", 3], ["MAR-O-2X4-B", 19500, null, 3]]);
    expect(p.totales).toMatchObject({ subtotal: 3 * 144000 + 3 * 19500, total: Math.round((3 * 144000 + 3 * 19500) * 1.19) });
    const { rows } = await app.query("SELECT to_jsonb(n) AS fila FROM nota_pedido n WHERE id = $1", [r.cuerpo.id]);
    const auditoria = await app.query("SELECT despues FROM audit_log WHERE recurso_id = $1", [r.cuerpo.id]);
    for (const texto of [JSON.stringify(rows[0].fila), JSON.stringify(auditoria.rows)]) {
      expect(texto).not.toContain("Cliente Final");
      expect(texto).not.toContain("12.345.678-5");
    }
    const documento = await llamar(rutaPdf.GET, "GET", "/x", s, { id: r.cuerpo.id });
    expect(documento.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("la misma nota no se carga dos veces", async () => {
    const r = await subir(rutaNota, "/x", pdf("nota-tienda-mini.pdf"), { clienteId: tienda });
    expect(r.cuerpo.error.codigo).toBe("YA_IMPORTADA");
    const previa = await subir(rutaPrevia, "/x", pdf("nota-tienda-mini.pdf"), { clienteId: tienda });
    expect(previa.cuerpo.duplicada).toMatchObject({ numero: expect.any(Number) });
  });

  it("sin pedidos.gestionar se deniega y se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "sin-directo@neltume.cl", nombre: "Sin", clave: "clave-sin-directo", rolId: rol.id }, sistema, "consola"));
    const otro = await sesionDe("sin-directo@neltume.cl", "clave-sin-directo", "10.26.0.2");
    expect((await subir(rutaNota, "/api/v1/pedidos/nota-tienda", pdf("nota-tienda-mini.pdf"), { clienteId: tienda }, otro)).cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion = 'POST /api/v1/pedidos/nota-tienda'");
    expect(rows).toHaveLength(1);
  });
});
