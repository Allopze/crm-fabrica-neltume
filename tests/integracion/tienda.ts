// Preparación común de las pruebas de la API de la tienda (ADR-0023): catálogo mini, cliente tienda, integración
// configurada y dos perfiles, administrador y «producción» (sin importes ni clientes).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAdjunto from "@/app/api/integrations/neltume/attachments/[sha256]/route";
import * as rutaPedidos from "@/app/api/integrations/neltume/orders/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";
import { cabecerasFirmadas, claveDe, RUT_TIENDA_PRUEBA, SECRETO_PRUEBA } from "../fixtures/tienda/mensaje";

export type Sesion = { token: string; csrf: string };
const sistema = { tipo: "sistema" as const };

export async function sesionDe(email: string, clave: string, ip: string): Promise<Sesion> {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

export function configurarIntegracion() {
  process.env.INTEGRACION_TIENDA_SECRETO = SECRETO_PRUEBA;
  process.env.INTEGRACION_TIENDA_FABRICA = "PANGUIPULLI";
  process.env.INTEGRACION_TIENDA_CLIENTE_RUT = RUT_TIENDA_PRUEBA;
}

/** Catálogo mini, la tienda, la integración y dos sesiones: administrador (todo) y producción (sin importes). */
export async function prepararTienda(prefijo: string) {
  configurarIntegracion();
  const admin = await bd().transaction((tx) => crearUsuario(tx, { email: `${prefijo}-admin@neltume.cl`, nombre: "Admin", clave: "clave-admin-1" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: admin.id });
  const tienda = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Neltume.co (tienda)", rut: RUT_TIENDA_PRUEBA, tipo: "tienda" }, sistema, "consola"))).id;
  const rol = await bd().transaction((tx) => crearRol(tx, `produccion ${prefijo}`, ["pedidos.gestionar", "produccion.gestionar", "stock.ver"], sistema, "consola"));
  await bd().transaction((tx) => crearUsuario(tx, { email: `${prefijo}-prod@neltume.cl`, nombre: "Producción", clave: "clave-prod-1", rolId: rol.id }, sistema, "consola"));
  return {
    tienda, adminId: admin.id,
    admin: await sesionDe(`${prefijo}-admin@neltume.cl`, "clave-admin-1", "10.30.0.1"),
    produccion: await sesionDe(`${prefijo}-prod@neltume.cl`, "clave-prod-1", "10.30.0.2"),
  };
}

/** POST firmado a la API de pedidos, como la tienda: bytes exactos y cabeceras propias (o las que se pasen). */
export async function enviar(mensaje: object, opciones: { cabeceras?: Record<string, string>; ahora?: number; secreto?: string; clave?: string } = {}) {
  const cuerpo = new TextEncoder().encode(JSON.stringify(mensaje));
  const m = mensaje as { sourceOrderId: string; destinationFactoryCode: string; sourceOrderRevision: number };
  const cabeceras = opciones.cabeceras ?? cabecerasFirmadas(cuerpo, opciones.clave ?? claveDe(m), { ahora: opciones.ahora, secreto: opciones.secreto });
  const req = new NextRequest(new URL("/api/integrations/neltume/orders", "http://localhost"), {
    method: "POST", body: cuerpo, headers: { "user-agent": "tienda-prueba", "x-forwarded-for": "10.40.0.1", ...cabeceras },
  });
  const res = await rutaPedidos.POST(req, { params: Promise.resolve({} as never) });
  return { estado: res.status, cuerpo: await res.json() };
}

export async function subirAdjunto(sha: string, contenido: Buffer, tipo: string, clave = `neltume-store:attachment:${sha}`) {
  const req = new NextRequest(new URL(`/api/integrations/neltume/attachments/${sha}`, "http://localhost"), {
    method: "PUT", body: new Uint8Array(contenido), headers: { "x-forwarded-for": "10.40.0.1", ...cabecerasFirmadas(new Uint8Array(contenido), clave, { tipo }) },
  });
  const res = await rutaAdjunto.PUT(req, { params: Promise.resolve({ sha256: sha }) });
  return { estado: res.status, cuerpo: await res.json() };
}

export const idem = () => ({ "idempotency-key": randomUUID() });
