import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import { DobleIA } from "@/ai/doble";
import { procesarSiguiente } from "@/ai/procesar";
import * as rutaInterp from "@/app/api/v1/cotizaciones/interpretaciones/route";
import * as rutaMetricas from "@/app/api/v1/metricas/ia/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const sistema = { tipo: "sistema" as const };
let s: { token: string; csrf: string };

async function sesionDe(email: string, clave: string, ip: string) {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
const metricas = async () => (await llamar(rutaMetricas.GET, "GET", "/api/v1/metricas/ia", s)).cuerpo;

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "metricas@neltume.cl", nombre: "Metricas", clave: "clave-metricas" }, sistema, "consola"));
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  s = await sesionDe("metricas@neltume.cl", "clave-metricas", "10.20.0.1");
  for (const texto of ["2 Toltén raulí de 87x215", "Simular IA caída por favor"]) {
    await llamar(rutaInterp.POST, "POST", "/x", { ...s, cabeceras: { "idempotency-key": randomUUID() }, cuerpo: { texto } });
    await procesarSiguiente(new DobleIA(), { esperasMs: [1] });
  }
});
afterAll(async () => {
  delete process.env.LLM_TOPE_DIARIO_USD;
  delete process.env.LLM_PRESUPUESTO_MENSUAL_USD;
  await app.end(); await cerrarBd();
});

describe("métricas de IA (DESIGN §5, SECURITY T4)", () => {
  it("latencia pedido → borrador, fallas, cola y llamadas por resultado", async () => {
    const m = await metricas();
    expect(m.latencia.muestras).toBe(1);
    expect(m.latencia.p90Ms).toBeGreaterThanOrEqual(0);
    expect(m.trabajos).toMatchObject({ total: 2, fallidos: 1, pendientes: 0, tasaFalla: 0.5 });
    expect(m.llamadas.map((l: { resultado: string }) => l.resultado)).toEqual(expect.arrayContaining(["ok", "timeout"]));
    expect(m.alertas).toEqual([]);
  });

  it("alerta al 80 % del tope diario y del presupuesto mensual", async () => {
    process.env.LLM_TOPE_DIARIO_USD = "1";
    process.env.LLM_PRESUPUESTO_MENSUAL_USD = "10";
    const { rows: [t] } = await app.query("SELECT id FROM trabajo_ia LIMIT 1");
    await app.query("INSERT INTO llamada_ia (trabajo_id, proveedor, entrada_redactada, resultado, costo_usd) VALUES ($1, 'prueba', '', 'ok', 0.85)", [t.id]);
    let m = await metricas();
    expect(m.gasto.diaUsd).toBeCloseTo(0.85);
    expect(m.alertas).toEqual(["El gasto de IA de hoy va en 85 % del tope diario."]);
    await app.query("INSERT INTO llamada_ia (trabajo_id, proveedor, entrada_redactada, resultado, costo_usd) VALUES ($1, 'prueba', '', 'ok', 7.5)", [t.id]);
    m = await metricas();
    expect(m.alertas).toEqual([
      "Se alcanzó el tope diario de IA: las interpretaciones nuevas quedan para cotizar a mano.",
      "El gasto de IA del mes va en 84 % del presupuesto mensual.",
    ]);
  });

  it("sin auditoria.ver se deniega y se audita", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo cotiza", ["cotizaciones.crear"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "nometricas@neltume.cl", nombre: "No", clave: "clave-nometricas", rolId: rol.id }, sistema, "consola"));
    const otra = await sesionDe("nometricas@neltume.cl", "clave-nometricas", "10.20.0.2");
    const r = await llamar(rutaMetricas.GET, "GET", "/api/v1/metricas/ia", otra);
    expect(r.cuerpo.error.codigo).toBe("SIN_PERMISO");
    const { rows } = await app.query("SELECT 1 FROM audit_log WHERE resultado = 'denegado' AND accion = 'GET /api/v1/metricas/ia'");
    expect(rows).toHaveLength(1);
  });
});
