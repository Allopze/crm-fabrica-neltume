import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { llamar, tokenDeCookie } from "./http";
import * as rutaAjustes from "@/app/api/v1/movimientos/ajustes/route";
import * as rutaEntradas from "@/app/api/v1/movimientos/entradas/route";
import * as rutaSalidas from "@/app/api/v1/movimientos/salidas/route";
import * as rutaApartar from "@/app/api/v1/puertas/[codigo]/apartar/route";
import * as rutaLiberar from "@/app/api/v1/puertas/[codigo]/liberar/route";
import * as rutaPuerta from "@/app/api/v1/puertas/[codigo]/route";
import * as rutaPuertas from "@/app/api/v1/puertas/route";
import * as rutaHistorico from "@/app/api/v1/despachos-historicos/route";
import * as rutaSesion from "@/app/api/v1/sesion/route";
import { bd, cerrarBd } from "@/db/conexion";
import { catalogoResumido, cargarCatalogoMapeo } from "@/domain/cotizaciones/catalogo";
import { articuloConDescripcion } from "@/domain/cotizaciones/edicion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearRol } from "@/domain/roles";
import { saldo } from "@/domain/stock";
import { crearUsuario } from "@/domain/usuarios";

// Puertas con código (ADR-0018, REQ-STK-8.x, 10.2).
const app = poolApp();
const owner = poolOwner();
const sistema = { tipo: "sistema" as const };
const idem = () => ({ "idempotency-key": randomUUID() });
type S = { token: string; csrf: string };
let admin: S;
let lector: S;
const entrar = async (email: string, ip: string): Promise<S> => {
  const r = await llamar(rutaSesion.POST, "POST", "/api/v1/sesion", { cuerpo: { email, clave: "clave-puertas" }, ip });
  return { token: tokenDeCookie(r.res)!, csrf: r.cuerpo.csrf };
};
const post = (ruta: typeof rutaEntradas, cuerpo: object, s = admin) => llamar(ruta.POST, "POST", "/x", { ...s, cabeceras: idem(), cuerpo });
const ficha = async (codigo: string, s = admin) => (await llamar(rutaPuerta.GET, "GET", "/x", s, { codigo })).cuerpo;
const stockNel = async () => saldo(bd(), { articuloId: (await app.query("SELECT id FROM articulo WHERE codigo = 'NEL-R-4-B'")).rows[0].id });

beforeAll(async () => {
  const u = await bd().transaction(async (tx) => {
    await crearRol(tx, "solo stock", ["stock.ver"], sistema, "consola");
    await crearUsuario(tx, { email: "lee-puertas@neltume.cl", nombre: "Lee", clave: "clave-puertas", rolNombre: "solo stock" }, sistema, "consola");
    return crearUsuario(tx, { email: "puertas@neltume.cl", nombre: "Bodega", clave: "clave-puertas" }, sistema, "consola");
  });
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", { tipo: "usuario", id: u.id });
  admin = await entrar("puertas@neltume.cl", "10.31.0.1");
  lector = await entrar("lee-puertas@neltume.cl", "10.31.0.2");
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("puertas con código (REQ-STK-8)", () => {
  it("una entrada sin códigos asigna los siguientes de la serie; con códigos, usa los de la etiqueta", async () => {
    const a = await post(rutaEntradas, { codigo: "NEL-R-4-B", cantidad: 2, ubicacion: "galpon arriba" });
    expect(a.estado).toBe(201);
    expect(a.cuerpo.puertas).toEqual(["202308000010001", "202308000010002"]);
    const b = await post(rutaEntradas, { codigo: "NEL-R-4-B", puertas: ["202308000000210"], referencia: "Orden 7" });
    expect(b.cuerpo.puertas).toEqual(["202308000000210"]);
    expect(await stockNel()).toMatchObject({ existencia: 3, disponible: 3 });
    expect(await ficha("202308000010001")).toMatchObject({ articulo: "NEL-R-4-B", ubicacion: "Galpón arriba", calidad: "primera", existencia: 1, apartada: 0 });
    expect((await post(rutaEntradas, { codigo: "NEL-R-4-B", puertas: ["202308000000210"] })).cuerpo.error.codigo).toBe("VALIDACION");
  });

  it("una salida sin códigos saca las más antiguas; con códigos, exactamente esas", async () => {
    await app.query("UPDATE puerta SET fecha_produccion = '2024-01-01' WHERE codigo = '202308000010002'");
    const r = await post(rutaSalidas, { codigo: "NEL-R-4-B", cantidad: 1, referencia: "F. 100" });
    expect(r.cuerpo.puertas).toEqual(["202308000010002"]);
    expect((await ficha("202308000010002")).salida).toBe("salida_despacho");
    const otra = await post(rutaSalidas, { puertas: ["202308000000210"], referencia: "B. 7" });
    expect(otra.cuerpo.puertas).toEqual(["202308000000210"]);
    expect(await stockNel()).toMatchObject({ existencia: 1 });
  });

  it("rechaza puertas inexistentes, fuera de stock, repetidas o de otro artículo, sin crear movimientos", async () => {
    const antes = (await app.query("SELECT count(*)::int AS n FROM movimiento")).rows[0].n;
    expect((await post(rutaSalidas, { puertas: ["NO-EXISTE"] })).estado).toBe(404);
    expect((await post(rutaSalidas, { puertas: ["202308000000210"] })).cuerpo.error.codigo).toBe("STOCK_INSUFICIENTE");
    expect((await post(rutaSalidas, { codigo: "FUY-O-2-A", puertas: ["202308000010001"] })).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await post(rutaAjustes, { puertas: ["202308000010001", "202308000010001"], cantidad: -2, motivo: "rotas" })).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await app.query("SELECT count(*)::int AS n FROM movimiento")).rows[0].n).toBe(antes);
  });

  it("una puerta despachada vuelve con un ajuste positivo de su código (devolución)", async () => {
    const r = await post(rutaAjustes, { puertas: ["202308000000210"], cantidad: 1, motivo: "Devolución del cliente" });
    expect(r.estado).toBe(201);
    expect(await ficha("202308000000210")).toMatchObject({ existencia: 1 });
    expect(await stockNel()).toMatchObject({ existencia: 2 });
  });

  it("editar ubicación, calidad y observación queda auditado con antes y después (REQ-STK-8.4)", async () => {
    const r = await llamar(rutaPuerta.PATCH, "PATCH", "/x", { ...admin, cuerpo: { ubicacion: "FABIRCA", calidad: "segunda", observacion: "Manchada" } }, { codigo: "202308000010001" });
    expect(r.cuerpo).toMatchObject({ ubicacion: "Fábrica", calidad: "segunda", observacion: "Manchada" });
    const { rows } = await app.query("SELECT antes, despues FROM audit_log WHERE accion = 'editar puerta' AND recurso_id = '202308000010001'");
    expect(rows[0]).toMatchObject({ antes: { ubicacion: "Galpón arriba", calidad: "primera" }, despues: { ubicacion: "Fábrica", calidad: "segunda" } });
  });

  it("una puerta apartada no sale sola; elegirla la libera y la saca (REQ-STK-8.5)", async () => {
    const ap = await llamar(rutaApartar.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { para: "Juan Pérez" } }, { codigo: "202308000000210" });
    expect(ap.estado).toBe(201);
    expect(await ficha("202308000000210")).toMatchObject({ apartada: 1, apartadaPara: "Apartada para Juan Pérez" });
    expect((await ficha("202308000000210", lector)).apartadaPara).toBe("Apartada"); // sin clientes.ver
    expect(await stockNel()).toMatchObject({ existencia: 2, reservado: 1, disponible: 1 });
    const libres = await post(rutaSalidas, { codigo: "NEL-R-4-B", cantidad: 1 });
    expect(libres.cuerpo.puertas).toEqual(["202308000010001"]);
    expect((await post(rutaSalidas, { codigo: "NEL-R-4-B", cantidad: 1 })).cuerpo.error.codigo).toBe("STOCK_INSUFICIENTE");
    const elegida = await post(rutaSalidas, { puertas: ["202308000000210"], referencia: "F. 200" });
    expect(elegida.cuerpo.puertas).toEqual(["202308000000210"]);
    expect(await stockNel()).toMatchObject({ existencia: 0, reservado: 0 });
  });

  it("liberar devuelve la puerta apartada al disponible", async () => {
    await post(rutaEntradas, { codigo: "FUY-O-2-A", puertas: ["FUY-1"] });
    await llamar(rutaApartar.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { para: "Obra Pucón" } }, { codigo: "FUY-1" });
    const r = await llamar(rutaLiberar.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { motivo: "El cliente desistió" } }, { codigo: "FUY-1" });
    expect(r.estado).toBe(201);
    expect(await ficha("FUY-1")).toMatchObject({ existencia: 1, apartada: 0 });
    expect((await llamar(rutaLiberar.POST, "POST", "/x", { ...admin, cabeceras: idem(), cuerpo: { motivo: "otra vez" } }, { codigo: "FUY-1" })).cuerpo.error.codigo).toBe("VALIDACION");
  });

  it("los accesorios (marcos, molduras) siguen por cantidad, sin etiquetas", async () => {
    const antes = (await app.query("SELECT count(*)::int AS n FROM puerta")).rows[0].n;
    const r = await post(rutaEntradas, { codigo: "MAR-O-2X4-B", cantidad: 3 });
    expect(r.cuerpo.puertas).toEqual([]);
    expect((await post(rutaSalidas, { codigo: "MAR-O-2X4-B", cantidad: 1 })).estado).toBe(201);
    expect((await post(rutaEntradas, { codigo: "MAR-O-2X4-B", puertas: ["MARCO-1"] })).cuerpo.error.codigo).toBe("VALIDACION");
    expect((await app.query("SELECT count(*)::int AS n FROM puerta")).rows[0].n).toBe(antes);
    expect(await saldo(bd(), { articuloId: (await app.query("SELECT id FROM articulo WHERE codigo = 'MAR-O-2X4-B'")).rows[0].id })).toMatchObject({ existencia: 2 });
  });

  it("la lista filtra por estado, ubicación y código", async () => {
    const r = await llamar(rutaPuertas.GET, "GET", "/api/v1/puertas?q=FUY", lector);
    expect(r.cuerpo.datos.map((p: { codigo: string }) => p.codigo)).toEqual(["FUY-1"]);
    const fuera = await llamar(rutaPuertas.GET, "GET", "/api/v1/puertas?estado=fuera&articulo=NEL-R-4-B", lector);
    expect(fuera.cuerpo.datos).toHaveLength(3);
  });

  it("sin permiso no se edita, aparta, libera ni mueve (403 auditado); sin sesión no se consulta", async () => {
    const e = await llamar(rutaPuerta.PATCH, "PATCH", "/x", { ...lector, cuerpo: { ubicacion: "Tienda" } }, { codigo: "FUY-1" });
    expect(e.estado).toBe(403);
    expect((await llamar(rutaApartar.POST, "POST", "/x", { ...lector, cabeceras: idem(), cuerpo: { para: "X Y" } }, { codigo: "FUY-1" })).estado).toBe(403);
    expect((await llamar(rutaLiberar.POST, "POST", "/x", { ...lector, cabeceras: idem(), cuerpo: { motivo: "x x x" } }, { codigo: "FUY-1" })).estado).toBe(403);
    expect((await post(rutaSalidas, { puertas: ["FUY-1"] }, lector)).estado).toBe(403);
    const { rows } = await app.query("SELECT resultado FROM audit_log WHERE correlacion_id = $1", [e.cuerpo.error.correlacion_id]);
    expect(rows[0].resultado).toBe("denegado");
    expect((await llamar(rutaPuertas.GET, "GET", "/api/v1/puertas", {})).estado).toBe(401);
    expect((await llamar(rutaHistorico.GET, "GET", "/api/v1/despachos-historicos", {})).estado).toBe(401);
  });
});

describe("historial de despachos (REQ-STK-10.2)", () => {
  it("busca por código o documento; el cliente solo se ve y se busca con clientes.ver", async () => {
    await owner.query(`INSERT INTO despacho_historico (fila, codigo, modelo, cliente, documento, huella) VALUES
      (2, '202308000000496', 'COZ COZ', 'Paolo Rossi', 'F. 2355', 'h1'), (3, '202308000000554', 'ANCACOMOE', 'Comercial Coihuin', 'F. 2357', 'h2')`);
    const conCliente = await llamar(rutaHistorico.GET, "GET", "/api/v1/despachos-historicos?q=Rossi", admin);
    expect(conCliente.cuerpo.datos).toEqual([expect.objectContaining({ codigo: "202308000000496", cliente: "Paolo Rossi", documento: "F. 2355" })]);
    expect((await llamar(rutaHistorico.GET, "GET", "/api/v1/despachos-historicos?q=Rossi", lector)).cuerpo.datos).toEqual([]);
    const sinCliente = await llamar(rutaHistorico.GET, "GET", "/api/v1/despachos-historicos?q=F. 2357", lector);
    expect(sinCliente.cuerpo.datos).toEqual([expect.objectContaining({ modelo: "ANCACOMOE", cliente: null })]);
  });
});

describe("fuera de catálogo (REQ-STK-8.7)", () => {
  it("no entra al catálogo de la IA, al mapeo ni a la cotización manual", async () => {
    const { rows: [m] } = await owner.query("INSERT INTO modelo (nombre, codigo, familia, fuera_catalogo) VALUES ('MAMPARA LICAN', 'MAMPARA-LICAN', 'puerta', true) RETURNING id");
    const { rows: [d] } = await owner.query("INSERT INTO madera (nombre, codigo, fuera_catalogo) VALUES ('ALAMO', 'ALA', true) RETURNING id");
    await owner.query(`INSERT INTO articulo (codigo, modelo_id, madera_id, ancho_codigo, ancho_etiqueta, alto_codigo, alto_m, fuera_catalogo)
      VALUES ('MAMPARA-LICAN-ALA-450X2000', $1, $2, '450', '0,45', '2000', 2, true)`, [m.id, d.id]);
    const resumen = await catalogoResumido(bd());
    expect(resumen.modelos).not.toContain("MAMPARA LICAN");
    expect(resumen.maderas).not.toContain("ALAMO");
    const mapeo = await cargarCatalogoMapeo(bd());
    expect([...mapeo.articulos.values()].map((a) => a.codigo)).not.toContain("MAMPARA-LICAN-ALA-450X2000");
    await expect(articuloConDescripcion(bd(), "MAMPARA-LICAN-ALA-450X2000")).rejects.toThrow();
  });
});
