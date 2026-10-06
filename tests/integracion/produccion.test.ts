import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaBomModelo from "@/app/api/v1/bom/[modelo]/route";
import * as rutaBom from "@/app/api/v1/bom/route";
import * as rutaMaderaInsumo from "@/app/api/v1/maderas/[codigo]/insumo/route";
import * as rutaMp from "@/app/api/v1/materias-primas/route";
import * as rutaCerrar from "@/app/api/v1/ordenes/[id]/cerrar/route";
import * as rutaOrden from "@/app/api/v1/ordenes/[id]/route";
import * as rutaOrdenes from "@/app/api/v1/ordenes/route";
import * as rutaRecepcion from "@/app/api/v1/recepciones/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import * as rutaStockArt from "@/app/api/v1/stock/[codigo]/route";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { cargarBomReal } from "@/domain/bom-real";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
let s: { token: string; csrf: string };
const mp: Record<string, string> = {};
const idem = () => ({ "idempotency-key": randomUUID() });
const existenciaMp = async (id: string) => (await llamar(rutaMp.GET, "GET", "/x", s)).cuerpo.datos.find((m: { id: string }) => m.id === id).existencia;
const crearOrden = async (codigo: string, cantidad: number) =>
  (await llamar(rutaOrdenes.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { lineas: [{ codigo, cantidad }] } })).cuerpo.id as string;

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "prod@neltume.cl", nombre: "Producción", clave: "clave-prod-1" }, { tipo: "sistema" }, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "prod@neltume.cl", clave: "clave-prod-1" }, ip: "10.10.0.1" });
  s = { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
  for (const [n, u2] of [["Tabla raulí", "pulg"], ["Cola", "lt"]]) {
    mp[n] = (await llamar(rutaMp.POST, "POST", "/x", { ...s, cuerpo: { nombre: n, unidadCodigo: u2 } })).cuerpo.id;
  }
  await llamar(rutaRecepcion.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: mp["Tabla raulí"], cantidad: 20 } });
  await llamar(rutaRecepcion.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: mp.Cola, cantidad: 1 } });
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("BOM (REQ-MP-3)", () => {
  it("define el BOM de un modelo y valida cantidades y materias primas", async () => {
    const ok = await llamar(rutaBomModelo.PUT, "PUT", "/x", { ...s, cuerpo: { origen: "demo", lineas: [{ materiaPrimaId: mp["Tabla raulí"], cantidad: 6 }, { materiaPrimaId: mp.Cola, cantidad: 0.4 }] } }, { modelo: "NEL" });
    expect(ok.estado).toBe(201);
    expect((await llamar(rutaBomModelo.PUT, "PUT", "/x", { ...s, cuerpo: { origen: "real", lineas: [{ materiaPrimaId: mp.Cola, cantidad: 0 }] } }, { modelo: "NEL" })).estado).toBe(400);
    expect((await llamar(rutaBomModelo.PUT, "PUT", "/x", { ...s, cuerpo: { origen: "real", lineas: [{ materiaPrimaId: randomUUID(), cantidad: 1 }] } }, { modelo: "NEL" })).estado).toBe(400);
    const lista = await llamar(rutaBom.GET, "GET", "/api/v1/bom?modelo=NEL", s);
    expect(lista.cuerpo.datos[0]).toMatchObject({ modeloCodigo: "NEL", origen: "demo", lineas: expect.arrayContaining([expect.objectContaining({ cantidad: 6 })]) });
  });
});

describe("cierre de órdenes de producción (REQ-MP-4)", () => {
  it("cerrar consume insumos por BOM y da entrada a las puertas, todo junto", async () => {
    const id = await crearOrden("NEL-R-4-B", 2);
    const previa = await llamar(rutaOrden.GET, "GET", "/x", s, { id });
    expect(previa.cuerpo.plan.insumos).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: "Tabla raulí", usa: 12, faltante: 0 })]));
    const r = await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: {} }, { id });
    expect(r.estado).toBe(200);
    expect(await existenciaMp(mp["Tabla raulí"])).toBe(8);
    expect(await existenciaMp(mp.Cola)).toBe(0.2);
    expect((await llamar(rutaStockArt.GET, "GET", "/x", s, { codigo: "NEL-R-4-B" })).cuerpo.existencia).toBe(2);
  });

  it("cerrar dos veces no repite movimientos (409 ORDEN_CERRADA)", async () => {
    // Reponer para esta orden: tabla 8 → 14 y cola 0,2 → 1,2 (después del cierre quedan 8 y 0,8).
    await llamar(rutaRecepcion.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: mp["Tabla raulí"], cantidad: 6 } });
    await llamar(rutaRecepcion.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: mp.Cola, cantidad: 1 } });
    const id = await crearOrden("NEL-M-4-B", 1);
    await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: {} }, { id });
    expect(await existenciaMp(mp["Tabla raulí"])).toBe(8);
    const segunda = await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: {} }, { id });
    expect(segunda.cuerpo.error.codigo).toBe("ORDEN_CERRADA");
    expect((await llamar(rutaStockArt.GET, "GET", "/x", s, { codigo: "NEL-M-4-B" })).cuerpo.existencia).toBe(1);
  });

  it("con insumos insuficientes no mueve nada y lista los faltantes", async () => {
    const id = await crearOrden("NEL-R-3-B", 5);
    const r = await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: {} }, { id });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.error).toMatchObject({ codigo: "INSUMOS_INSUFICIENTES", detalles: { faltantes: expect.arrayContaining([expect.objectContaining({ nombre: "Tabla raulí", faltante: 22 })]) } });
    expect((await llamar(rutaStockArt.GET, "GET", "/x", s, { codigo: "NEL-R-3-B" })).cuerpo.existencia).toBe(0);
  });

  it("sin BOM exige consumo manual; con él, cierra", async () => {
    const id = await crearOrden("FUY-O-2-A", 1);
    const sin = await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: {} }, { id });
    expect(sin.cuerpo.error).toMatchObject({ codigo: "SIN_BOM", detalles: { sinBom: ["FUY-O-2-A"] } });
    const con = await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { consumosManuales: [{ materiaPrimaId: mp["Tabla raulí"], cantidad: 5 }] } }, { id });
    expect(con.estado).toBe(200);
    expect(await existenciaMp(mp["Tabla raulí"])).toBe(3);
  });
});

describe("madera de la puerta (REQ-MP-3.4, 3.5; ADR-0012)", () => {
  it("una receta para todas las maderas: descuenta las pulgadas del artículo de la materia prima de su madera", async () => {
    const pulg = (await llamar(rutaMp.POST, "POST", "/x", { ...s, cuerpo: { nombre: "Pulgadas de raulí", unidadCodigo: "pulg" } })).cuerpo.id as string;
    await llamar(rutaRecepcion.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: pulg, cantidad: 100 } });
    const bomNel = (lineas: unknown[]) => llamar(rutaBomModelo.PUT, "PUT", "/x", { ...s, cuerpo: { origen: "real", lineas } }, { modelo: "NEL" });
    // Una línea es un insumo o la madera, nunca ambos; la madera va una sola vez.
    expect((await bomNel([{ maderaPuerta: true, materiaPrimaId: pulg, cantidad: 1 }])).estado).toBe(400);
    expect((await bomNel([{ maderaPuerta: true, cantidad: 1 }, { maderaPuerta: true, cantidad: 2 }])).estado).toBe(400);
    expect((await bomNel([{ maderaPuerta: true, cantidad: 1 }])).estado).toBe(201);
    const lista = await llamar(rutaBom.GET, "GET", "/api/v1/bom?modelo=NEL", s);
    expect(lista.cuerpo.datos[0]).toMatchObject({ origen: "real", lineas: [expect.objectContaining({ maderaPuerta: true, cantidad: 1, mp: "Madera de la puerta" })] });

    // Sin materia prima asociada a la madera no se cierra ni se completa en silencio.
    const id = await crearOrden("NEL-R-4-B", 2);
    const sin = await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: {} }, { id });
    expect(sin.estado).toBe(409);
    expect(sin.cuerpo.error).toMatchObject({ codigo: "BOM_INCOMPLETO", detalles: { incompletos: ["NEL-R-4-B: la madera raulí no tiene materia prima asociada"] } });

    expect((await llamar(rutaMaderaInsumo.PUT, "PUT", "/x", { ...s, cuerpo: { materiaPrimaId: pulg } }, { codigo: "R" })).estado).toBe(204);
    const { rows: [{ pulgadas }] } = await app.query("SELECT pulgadas::float AS pulgadas FROM articulo WHERE codigo = 'NEL-R-4-B'");
    expect(pulgadas).toBeGreaterThan(0);
    const previa = await llamar(rutaOrden.GET, "GET", "/x", s, { id });
    expect(previa.cuerpo.plan.insumos).toEqual([expect.objectContaining({ nombre: "Pulgadas de raulí", usa: Number((pulgadas * 2).toFixed(3)) })]);
    expect((await llamar(rutaCerrar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: {} }, { id })).estado).toBe(200);
    expect(await existenciaMp(pulg)).toBeCloseTo(100 - pulgadas * 2, 3);
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE recurso = 'madera_insumo' AND resultado = 'ok'");
    expect(rows).toEqual([{ despues: { madera: "RAULI", materiaPrimaId: pulg } }]);
  });

  it("asociar la madera exige mp.editar: 403 auditado, y la madera debe existir", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo stock bom", ["stock.ver"], { tipo: "sistema" }, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "lee-bom@neltume.cl", nombre: "Lee", clave: "clave-lee-bom", rolId: rol.id }, { tipo: "sistema" }, "consola"));
    const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email: "lee-bom@neltume.cl", clave: "clave-lee-bom" }, ip: "10.10.0.9" });
    const lector = { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
    const denegado = await llamar(rutaMaderaInsumo.PUT, "PUT", "/api/v1/maderas/L/insumo", { ...lector, cuerpo: { materiaPrimaId: null } }, { codigo: "L" });
    expect(denegado.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion = 'PUT /api/v1/maderas/L/insumo'");
    expect(rows).toHaveLength(1);
    expect((await llamar(rutaMaderaInsumo.PUT, "PUT", "/x", { ...s, cuerpo: { materiaPrimaId: null } }, { codigo: "Z" })).estado).toBe(404);
  });
});

describe("carga de los BOM reales (T2.7, ADR-0012)", () => {
  it("crea insumos, asocia maderas y un BOM real por modelo; es idempotente y no pisa un BOM real existente", async () => {
    const { rows: [u] } = await app.query("SELECT id FROM usuario WHERE email = 'prod@neltume.cl'");
    const actor = { tipo: "usuario" as const, id: u.id as string };
    const { rows: [{ n: modelos }] } = await app.query("SELECT count(*)::int AS n FROM modelo");
    const primera = await bd().transaction((tx) => cargarBomReal(tx, actor, "consola"));
    // NEL ya tenía un BOM real (de la prueba anterior): se conserva; «Pulgadas de raulí» ya existía y R ya estaba asociada.
    expect(primera).toMatchObject({ insumosCreados: 19, maderasAsociadas: 3, bomsCreados: modelos - 1, bomsConservados: 1 });
    expect(await bd().transaction((tx) => cargarBomReal(tx, actor, "consola"))).toEqual({ insumosCreados: 0, maderasAsociadas: 0, bomsCreados: 0, bomsConservados: modelos });
    const fuy = (await llamar(rutaBom.GET, "GET", "/api/v1/bom?modelo=FUY", s)).cuerpo.datos[0];
    expect(fuy).toMatchObject({ origen: "real", lineas: expect.arrayContaining([
      expect.objectContaining({ maderaPuerta: true, cantidad: 1 }),
      expect.objectContaining({ mp: "Lija de banda manual grano 80", cantidad: 0.1 }),
      expect.objectContaining({ mp: "Lija de banda industrial grano 100 (lijadora nueva)", cantidad: 0.0143 }),
    ]) });
    const nel = (await llamar(rutaBom.GET, "GET", "/api/v1/bom?modelo=NEL", s)).cuerpo.datos[0];
    expect(nel.lineas).toHaveLength(1); // el BOM real definido a mano no se reemplaza
  });
});
