import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import { DobleIA } from "@/ai/doble";
import { procesarSiguiente } from "@/ai/procesar";
import * as rutaItems from "@/app/api/v1/cotizaciones/[id]/items/route";
import * as rutaRecalc from "@/app/api/v1/cotizaciones/[id]/recalcular/route";
import * as rutaCot from "@/app/api/v1/cotizaciones/[id]/route";
import * as rutaLista from "@/app/api/v1/cotizaciones/route";
import * as rutaInterp from "@/app/api/v1/cotizaciones/interpretaciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { crearCliente } from "@/domain/clientes";
import { importarExcel } from "@/domain/importacion/importar";
import { crearVersionEditada } from "@/domain/precios/listas";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let s: { token: string; csrf: string };
let usuarioId: string;
let id: string;
const ver = async () => (await llamar(rutaCot.GET, "GET", "/x", s, { id })).cuerpo;

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}

beforeAll(async () => {
  usuarioId = (await bd().transaction((tx) => crearUsuario(tx, { email: "recalc@neltume.cl", nombre: "Recalc", clave: "clave-recalc" }, sistema, "consola"))).id;
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: usuarioId });
  const clienteId = (await bd().transaction((tx) => crearCliente(tx, { nombre: "Maderas del Sur", rut: "11.111.111-1" }, sistema, "consola"))).id;
  s = await sesionDe("recalc@neltume.cl", "clave-recalc", "10.14.0.1");
  id = (await llamar(rutaInterp.POST, "POST", "/x", { ...s, cabeceras: { "idempotency-key": randomUUID() }, cuerpo: { texto: "Necesito cotizar 3 puertas Neltume en raulí de 90x210, 2 de roble con chapa y 2 Toltén raulí de 87x215", clienteId } })).cuerpo.id;
  await procesarSiguiente(new DobleIA(), { esperasMs: [1] });
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("recalcular con la lista vigente (REQ-COT-6.3)", () => {
  it("el borrador queda marcado como desactualizado y al recalcular toma el precio nuevo", async () => {
    let c = await ver();
    c = (await llamar(rutaItems.POST, "POST", "/x", { ...s, cuerpo: { codigo: "FUY-O-2-A", cantidad: 2, version: c.version } }, { id })).cuerpo;
    const antes = c.items.at(-1);
    expect(c.lista.desactualizada).toBe(false);

    await crearVersionEditada({ cambios: [{ codigo: "FUY-O-2-A", precioNeto: Number(antes.precioNetoLista) * 2 }] }, { tipo: "usuario", id: usuarioId });
    c = await ver();
    expect(c.lista.desactualizada).toBe(true);
    expect(Number(c.items.at(-1).precioUnitario)).toBe(Number(antes.precioUnitario));

    const r = await llamar(rutaRecalc.POST, "POST", "/x", { ...s, cuerpo: { version: c.version } }, { id });
    expect(r.estado).toBe(200);
    const despues = r.cuerpo.items.at(-1);
    expect(Number(despues.precioNetoLista)).toBe(Number(antes.precioNetoLista) * 2);
    expect(Number(despues.totalLinea)).toBe(Number(despues.precioUnitario) * 2);
    expect(r.cuerpo.lista.desactualizada).toBe(false);
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE accion = 'recalcular' AND recurso_id = $1", [id]);
    expect(rows).toHaveLength(1);
  });

  it("con una versión vieja → 409 VERSION_OBSOLETA", async () => {
    const c = await ver();
    const r = await llamar(rutaRecalc.POST, "POST", "/x", { ...s, cuerpo: { version: c.version - 1 } }, { id });
    expect(r.cuerpo.error.codigo).toBe("VERSION_OBSOLETA");
  });
});

describe("listado de cotizaciones y datos personales (REQ-COT-10.1, REQ-NFR-5)", () => {
  it("con clientes.ver muestra el nombre; sin él lo oculta y no busca por nombre", async () => {
    const todo = await llamar(rutaLista.GET, "GET", "/api/v1/cotizaciones?q=Maderas", s);
    expect(todo.cuerpo.datos.map((x: { cliente: string }) => x.cliente)).toEqual(["Maderas del Sur"]);

    const rol = await bd().transaction((tx) => crearRol(tx, "cotiza sin clientes", ["cotizaciones.crear"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "sinclientes@neltume.cl", nombre: "Sin Clientes", clave: "clave-sinclientes", rolId: rol.id }, sistema, "consola"));
    const otra = await sesionDe("sinclientes@neltume.cl", "clave-sinclientes", "10.14.0.2");
    const lista = await llamar(rutaLista.GET, "GET", "/api/v1/cotizaciones", otra);
    expect(lista.cuerpo.datos[0].cliente).toBe("(oculto)");
    expect((await llamar(rutaLista.GET, "GET", "/api/v1/cotizaciones?q=Maderas", otra)).cuerpo.datos).toHaveLength(0);
  });
});
