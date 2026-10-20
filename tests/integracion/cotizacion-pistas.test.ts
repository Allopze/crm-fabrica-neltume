import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import { DobleIA } from "@/ai/doble";
import { procesarSiguiente } from "@/ai/procesar";
import * as rutaCot from "@/app/api/v1/cotizaciones/[id]/route";
import * as rutaInterp from "@/app/api/v1/cotizaciones/interpretaciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

type S = { token: string; csrf: string };
const app = poolApp();
const sistema = { tipo: "sistema" } as const;
let s: S;
let sinClientes: S;
let alerces: string;
let mirador: string;

const PEDIDO = "Necesito cotizar 3 puertas Neltume en raulí de 90x210 para el 30 de octubre.";
const entrar = async (email: string, ip: string): Promise<S> => {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-pistas" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
};
async function interpretar(texto: string, sesion = s) {
  const id = (await llamar(rutaInterp.POST, "POST", "/x", { ...sesion, cabeceras: { "idempotency-key": randomUUID() }, cuerpo: { texto } })).cuerpo.id as string;
  await procesarSiguiente(new DobleIA(), { esperasMs: [1] });
  return id;
}
const ver = async (id: string, sesion = s) => (await llamar(rutaCot.GET, "GET", "/x", sesion, { id })).cuerpo;

beforeAll(async () => {
  const u = await bd().transaction(async (tx) => {
    await crearRol(tx, "cotiza-sin-clientes", ["cotizaciones.crear"], sistema, "consola");
    await crearUsuario(tx, { email: "sinclientes@neltume.cl", nombre: "Sin Clientes", clave: "clave-pistas", rolNombre: "cotiza-sin-clientes" }, sistema, "consola");
    return crearUsuario(tx, { email: "pistas@neltume.cl", nombre: "Pistas", clave: "clave-pistas" }, sistema, "consola");
  });
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  alerces = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Constructora Los Alerces", rut: "12.345.678-5", email: "compras@alerces.cl" }, sistema, "consola"))).id;
  mirador = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Casas El Mirador", rut: "11.111.111-1", telefono: "+56 9 8765 4321" }, sistema, "consola"))).id;
  s = await entrar("pistas@neltume.cl", "10.21.0.1");
  sinClientes = await entrar("sinclientes@neltume.cl", "10.21.0.2");
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("sugerencias del borrador, sin IA (REQ-COT-2.18–2.20)", () => {
  let id: string;

  it("detecta el cliente por el RUT del texto y lee el plazo, sin asignar nada", async () => {
    id = await interpretar(`${PEDIDO} RUT 12.345.678-5`);
    const c = await ver(id);
    expect(c.clienteId).toBeNull();
    expect(c.pistas.cliente).toEqual({ por: "rut", clientes: [{ id: alerces, nombre: "Constructora Los Alerces" }] });
    expect(c.pistas.plazo.frase).toBe("30 de octubre");
    expect(c.pistas.plazo.fecha).toMatch(/^\d{4}-10-30$/);
  });

  it("sin clientes.ver no hay sugerencia de cliente", async () => {
    const otro = await interpretar(`${PEDIDO} RUT 12.345.678-5`, sinClientes);
    expect((await ver(otro, sinClientes)).pistas.cliente).toBeNull();
  });

  it("aceptar la sugerencia asigna el cliente y lo deja en la auditoría", async () => {
    const c = await ver(id);
    const r = await llamar(rutaCot.PATCH, "PATCH", "/x", { ...s, cuerpo: { clienteId: alerces, clienteDetectadoPor: "rut", version: c.version } }, { id });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ clienteId: alerces, pistas: { cliente: null } });
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE recurso = 'cotizacion' AND recurso_id = $1 AND accion = 'editar cabecera'", [id]);
    expect(rows.at(-1).despues).toEqual({ clienteId: alerces, clienteDetectadoPor: "rut" });
  });

  it("el origen sugerido sin cliente se rechaza", async () => {
    const c = await ver(id);
    const r = await llamar(rutaCot.PATCH, "PATCH", "/x", { ...s, cuerpo: { clienteDetectadoPor: "rut", version: c.version } }, { id });
    expect(r.estado).toBe(400);
  });

  it("el mismo texto otra vez avisa que puede estar repetida", async () => {
    const otra = await interpretar(`  ${PEDIDO}   RUT 12.345.678-5 `);
    const { repetidas } = (await ver(otra)).pistas;
    expect(repetidas.map((r: { id: string }) => r.id)).toContain(id);
    expect(repetidas.find((r: { id: string }) => r.id === id).motivo).toBe("mismo_texto");
  });

  it("el mismo cliente con un artículo en común también avisa", async () => {
    const otra = await interpretar("Hola de nuevo. Necesito cotizar 3 puertas Neltume en raulí de 90x210, sin apuro.");
    let c = await ver(otra);
    expect(c.pistas.repetidas).toEqual([]);
    c = (await llamar(rutaCot.PATCH, "PATCH", "/x", { ...s, cuerpo: { clienteId: alerces, version: c.version } }, { id: otra })).cuerpo;
    expect(c.pistas.repetidas.find((r: { id: string }) => r.id === id)?.motivo).toBe("mismo_cliente");
  });

  it("sin RUT, detecta por correo o por teléfono en otro formato", async () => {
    expect((await ver(await interpretar(`${PEDIDO} Escribir a Compras@Alerces.cl`))).pistas.cliente).toMatchObject({ por: "correo", clientes: [{ id: alerces }] });
    expect((await ver(await interpretar(`${PEDIDO} Llamar al (9) 8765-4321`))).pistas.cliente).toMatchObject({ por: "telefono", clientes: [{ id: mirador }] });
  });

  it("un RUT válido sin cliente se ofrece para crearlo; uno inválido se ignora", async () => {
    expect((await ver(await interpretar(`${PEDIDO} RUT 10.000.013-K`))).pistas.cliente).toEqual({ por: "rut", clientes: [], rutNuevo: "10000013-K" });
    expect((await ver(await interpretar(`${PEDIDO} RUT 12.345.678-9`))).pistas.cliente).toBeNull();
  });
});
