import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CREDENCIALES_PRUEBA, crearChipaxSimulado, type FacturaSimulada } from "../fixtures/chipax/simulado";
import { poolApp } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAsociar from "@/app/api/v1/compras/lineas/[id]/asociar/route";
import * as rutaIgnorar from "@/app/api/v1/compras/lineas/[id]/ignorar/route";
import * as rutaCompras from "@/app/api/v1/compras/route";
import * as rutaSincronizar from "@/app/api/v1/compras/sincronizar/route";
import * as rutaProveedores from "@/app/api/v1/proveedores-compra/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { clienteChipax } from "@/compras/chipax";
import { ejecutarCorrida, tomarCorrida } from "@/compras/corrida";
import { bd, cerrarBd, esquema } from "@/db/conexion";
import { urlCompras } from "@/db/urls";
import { crearMateriaPrima } from "@/domain/materias-primas";
import { hoySantiago } from "@/domain/precios/dias-habiles";
import { crearRol } from "@/domain/roles";
import { digitoVerificador } from "@/domain/rut";
import { saldo } from "@/domain/stock";
import { crearUsuario } from "@/domain/usuarios";

// Compras desde Chipax (ADR-0021, REQ-MP-7.1–7.10) contra un Chipax simulado: la corrida usa el rol neltume_compras.
const app = poolApp();
const poolCompras = new Pool({ connectionString: urlCompras(process.env.DATABASE_URL), max: 2 });
const bdCompras = drizzle(poolCompras, { schema: esquema, casing: "snake_case" });
const sistema = { tipo: "sistema" as const };
const idem = () => ({ "idempotency-key": randomUUID() });
const rut = (n: number) => `${n}-${digitoVerificador(n)}`;
const P1 = rut(76543210);
const OTRO = rut(77111222);
const hoy = hoySantiago();
const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
type S = { token: string; csrf: string };
let s: S;
let tablon: string;
const facturas: FacturaSimulada[] = [];
let sim: Awaited<ReturnType<typeof crearChipaxSimulado>>;

const factura = (id: number, extra: Partial<FacturaSimulada> & Pick<FacturaSimulada, "lineas">): FacturaSimulada =>
  ({ id, rut: P1, razon: "Maderas Ñuble SpA", tipo: 33, folio: 1000 + id, fecha: hoy, ...extra });

async function sesionDe(email: string, clave: string, ip: string): Promise<S> {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
}
const cliente = (secretKey = CREDENCIALES_PRUEBA.secretKey) =>
  clienteChipax({ appId: CREDENCIALES_PRUEBA.appId, secretKey, base: sim.api, hostsXml: ["127.0.0.1"], esperaMs: 0, dormir: async () => {} });
/** «Sincronizar ahora» por la API y el servicio toma la petición (como en producción, pero sin esperar el sondeo). */
async function correr(c = cliente()) {
  expect((await llamar(rutaSincronizar.POST, "POST", "/x", { ...s, cabeceras: idem() })).estado).toBe(202);
  const id = await tomarCorrida(bdCompras);
  expect(id).toBeTruthy();
  return { id: id!, conteos: await ejecutarCorrida(bdCompras, c, id!) };
}
const resumen = async (sesion = s) => (await llamar(rutaCompras.GET, "GET", "/x", sesion)).cuerpo;
const stockTablon = async () => (await saldo(bd(), { materiaPrimaId: tablon })).existencia;

beforeAll(async () => {
  await bd().transaction((tx) => crearUsuario(tx, { email: "compras@neltume.cl", nombre: "Bodega", clave: "clave-compras-1" }, sistema, "consola"));
  s = await sesionDe("compras@neltume.cl", "clave-compras-1", "10.27.0.1");
  tablon = (await bd().transaction((tx) => crearMateriaPrima(tx, { nombre: "Tablón pino oregón", unidadCodigo: "pulg" }, sistema, "consola"))).id;
  sim = await crearChipaxSimulado(() => facturas);
});
afterAll(async () => { await sim.cerrar(); await poolCompras.end(); await app.end(); await cerrarBd(); });

describe("compras desde Chipax (ADR-0021)", () => {
  it("sin proveedores habilitados la corrida no llama a Chipax", async () => {
    facturas.push(factura(1, { lineas: [{ codigo: "TAB-01", nombre: "Tablón pino oregón 2x8", cantidad: 2, unidad: "M3", precio: 180000 }, { nombre: "Flete", cantidad: 1, unidad: "UN", precio: 35000 }] }));
    const { conteos } = await correr();
    expect(conteos.leidas).toBe(0);
    expect(sim.control.llamadasCompras).toBe(0);
  });

  it("solo se leen las facturas de RUT habilitados; sin mapeo quedan por asociar, sin mover stock", async () => {
    expect((await llamar(rutaProveedores.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { rut: "76.543.210-0", nombre: "x" } })).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await llamar(rutaProveedores.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { rut: P1, nombre: "Maderas Ñuble" } })).estado).toBe(201);
    facturas.push(
      factura(3, { rut: OTRO, razon: "Otro proveedor", lineas: [{ codigo: "TAB-01", nombre: "Tablón", cantidad: 9, unidad: "M3" }] }),
      factura(4, { fecha: ayer, lineas: [{ codigo: "TAB-01", nombre: "Tablón", cantidad: 9, unidad: "M3" }] }),
      factura(5, { tipo: 61, lineas: [{ codigo: "TAB-01", nombre: "Devolución tablón", cantidad: 1, unidad: "M3" }] }),
      factura(6, { xml: "pendiente", lineas: [{ nombre: "Cola fría", cantidad: 20, unidad: "LT", precio: 4500 }] }),
      factura(7, { crudo: `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><DTE><Documento><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>1007</Folio></IdDoc><Emisor><RUTEmisor>${P1}</RUTEmisor></Emisor></Encabezado><Detalle><NmbItem>&e;</NmbItem></Detalle></Documento></DTE>`, lineas: [] }),
    );
    sim.control.forzar429 = 1; // la corrida espera el Retry-After y sigue
    const { conteos } = await correr();
    expect(conteos).toMatchObject({ nuevas: 4, porAsociar: 2, porRevisar: 1, xmlPendientes: 1, avisos: 1, lineasRecibidas: 0, errores: 0 });
    const { rows } = await app.query("SELECT folio, xml_pendiente, aviso IS NOT NULL AS aviso FROM compra ORDER BY folio");
    expect(rows).toEqual([
      { folio: "1001", xml_pendiente: false, aviso: false }, { folio: "1005", xml_pendiente: false, aviso: false },
      { folio: "1006", xml_pendiente: true, aviso: false }, { folio: "1007", xml_pendiente: false, aviso: true },
    ]);
    expect(await stockTablon()).toBe(0);
    const r = await resumen();
    expect(r.porAsociar.map((l: { nombreItem: string }) => l.nombreItem)).toEqual(["Tablón pino oregón 2x8", "Flete"]);
    expect(r.porRevisar[0]).toMatchObject({ tipo: 61, motivoRevision: expect.stringContaining("Nota de crédito") });
  });

  it("asociar un ítem recibe cantidad × factor; «no es materia prima» queda recordado", async () => {
    const [tab, flete] = (await resumen()).porAsociar;
    expect((await llamar(rutaAsociar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: tablon, factor: 0 } }, { id: tab.id })).estado).toBe(400);
    const r = await llamar(rutaAsociar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: tablon, factor: 424 } }, { id: tab.id });
    expect(r.cuerpo).toEqual({ recibidas: 1, porRevisar: 0, ignoradas: 0 });
    expect(await stockTablon()).toBe(848);
    expect((await llamar(rutaIgnorar.POST, "POST", "/x", { ...s, cabeceras: idem() }, { id: flete.id })).cuerpo).toMatchObject({ ignoradas: 1 });
    expect((await llamar(rutaAsociar.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo: { materiaPrimaId: tablon, factor: 1 } }, { id: tab.id })).cuerpo.error.codigo).toBe("NO_EDITABLE");
    expect((await resumen()).porAsociar).toEqual([]);
  });

  it("las facturas siguientes con el ítem asociado entran solas; otra unidad queda por revisar; repetir no duplica", async () => {
    facturas.push(
      factura(2, { lineas: [{ codigo: "TAB-01", nombre: "Tablón pino oregón 2x8", cantidad: 1.5, unidad: "m3" }, { nombre: "Flete", cantidad: 1, unidad: "UN" }] }),
      factura(8, { lineas: [{ codigo: "TAB-01", nombre: "Tablón pino oregón 2x8", cantidad: 100, unidad: "PULG" }] }),
    );
    facturas.find((f) => f.id === 6)!.xml = "ok";
    const { conteos } = await correr();
    expect(conteos).toMatchObject({ nuevas: 2, lineasRecibidas: 1, ignoradas: 1, porAsociar: 1, porRevisar: 1, xmlPendientes: 0 });
    expect(await stockTablon()).toBe(848 + 636);
    const antes = (await app.query("SELECT count(*)::int AS n FROM movimiento WHERE tipo = 'recepcion'")).rows[0].n;
    expect((await correr()).conteos).toMatchObject({ nuevas: 0, lineasRecibidas: 0 });
    expect((await app.query("SELECT count(*)::int AS n FROM movimiento WHERE tipo = 'recepcion'")).rows[0].n).toBe(antes);
    const { rows } = await app.query("SELECT idempotencia_clave, usuario_id IS NOT NULL AS con_usuario FROM movimiento WHERE tipo = 'recepcion' ORDER BY ocurrido_en");
    expect(rows.map((x) => x.idempotencia_clave)).toEqual([`chipax:${P1}:33:1001:1:0`, `chipax:${P1}:33:1002:1:0`]);
  });

  it("si Chipax rechaza una factura ya recibida, queda el aviso y no se borra nada", async () => {
    facturas.find((f) => f.id === 1)!.estado = "rechazado";
    await correr();
    const { rows: [c] } = await app.query("SELECT aviso FROM compra WHERE folio = 1001");
    expect(c.aviso).toContain("Rechazada en Chipax después de recibirla");
    expect(await stockTablon()).toBe(848 + 636);
  });

  it("con credenciales malas la corrida queda con error, sin registrar la clave", async () => {
    const { id } = await correr(cliente("otra-clave"));
    const { rows: [r] } = await app.query("SELECT resultado, error, conteos::text AS conteos FROM sincronizacion_chipax WHERE id = $1", [id]);
    expect(r).toMatchObject({ resultado: "error", error: "Chipax rechazó las credenciales (app_id y secret_key)." });
    const { rows } = await app.query("SELECT count(*)::int AS n FROM audit_log WHERE despues::text LIKE '%otra-clave%' OR despues::text LIKE '%jwt-de-prueba%' OR despues::text LIKE '%firma-de-prueba%'");
    expect(rows[0].n).toBe(0);
  });

  it("el rol de compras solo inserta recepciones de materias primas y no ve clientes ni usuarios", async () => {
    const { rows: [u] } = await app.query("SELECT id FROM usuario LIMIT 1");
    const { rows: [b] } = await app.query("SELECT id FROM bodega LIMIT 1");
    await expect(poolCompras.query("INSERT INTO movimiento (bodega_id, materia_prima_id, tipo, cantidad, motivo, usuario_id) VALUES ($1, $2, 'ajuste', 1, 'x', $3)", [b.id, tablon, u.id]))
      .rejects.toThrow(/solo registra recepciones/);
    await expect(poolCompras.query("UPDATE compra_linea SET estado = 'ignorada'")).rejects.toThrow(/permission denied/);
    await expect(poolCompras.query("SELECT * FROM cliente")).rejects.toThrow(/permission denied/);
    await expect(poolCompras.query("SELECT * FROM usuario")).rejects.toThrow(/permission denied/);
  });

  it("sin permisos se deniega y se audita; el precio de compra solo se ve con costos.ver", async () => {
    const rol = await bd().transaction((tx) => crearRol(tx, "solo ver stock", ["stock.ver"], sistema, "consola"));
    await bd().transaction((tx) => crearUsuario(tx, { email: "mirar@neltume.cl", nombre: "Mira", clave: "clave-mirar-1", rolId: rol.id }, sistema, "consola"));
    const mirar = await sesionDe("mirar@neltume.cl", "clave-mirar-1", "10.27.0.2");
    const r = await resumen(mirar);
    expect(r.porAsociar[0].precioUnitario).toBeNull();
    expect((await resumen()).porAsociar[0].precioUnitario).not.toBeNull();
    const linea = r.porAsociar[0].id;
    expect((await llamar(rutaProveedores.POST, "POST", "/api/v1/proveedores-compra", { ...mirar, cabeceras: idem(), cuerpo: { rut: OTRO, nombre: "x" } })).estado).toBe(403);
    expect((await llamar(rutaAsociar.POST, "POST", `/api/v1/compras/lineas/${linea}/asociar`, { ...mirar, cabeceras: idem(), cuerpo: { materiaPrimaId: tablon, factor: 1 } }, { id: linea })).estado).toBe(403);
    expect((await llamar(rutaSincronizar.POST, "POST", "/api/v1/compras/sincronizar", { ...mirar, cabeceras: idem() })).estado).toBe(403);
    const { rows: [d] } = await app.query("SELECT count(*)::int AS n FROM audit_log WHERE resultado = 'denegado' AND accion IN ($1, $2, $3)",
      ["POST /api/v1/proveedores-compra", `POST /api/v1/compras/lineas/${linea}/asociar`, "POST /api/v1/compras/sincronizar"]);
    expect(d.n).toBe(3);
    const { rows } = await app.query(`SELECT accion, count(*)::int AS n FROM audit_log WHERE resultado = 'ok' AND accion IN
      ('habilitar proveedor', 'asociar item compra', 'ignorar item compra', 'leer factura chipax', 'solicitar sincronizacion') GROUP BY accion ORDER BY accion`);
    expect(Object.fromEntries(rows.map((x) => [x.accion, x.n]))).toMatchObject({ "habilitar proveedor": 1, "asociar item compra": 1, "ignorar item compra": 1, "leer factura chipax": 5 });
  });
});
