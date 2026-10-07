import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { bd, cerrarBd } from "@/db/conexion";
import { importarExcel } from "@/domain/importacion/importar";
import { cargarInventario } from "@/domain/importacion/inventario-carga";
import { leerInventario } from "@/domain/importacion/inventario-excel";
import { articuloPorCodigo, registrarMovimientos, saldo } from "@/domain/stock";
import { crearUsuario } from "@/domain/usuarios";

// Carga de la planilla de inventario de la fábrica (ADR-0018, REQ-STK-9, 10). Datos ficticios con la misma estructura.
const app = poolApp();
let actor: { tipo: "usuario"; id: string };
const HOY = "2026-10-07";

async function planilla(): Promise<ArrayBuffer> {
  const w = new ExcelJS.Workbook();
  const inv = w.addWorksheet("Inventario");
  inv.addRow(["MODELO", "MEDIDA", "CODIGO", "MADERA", "PRODUCCION", "ESTADO", "UBICACIÓN", "CLIENTE", "OBSERVACIONES", "MAYORISTA", "DETALLE"]);
  inv.addRow(["MOLCO ", "80 X 2,10", 202308000000101, "OREGON", new Date("2023-07-04"), "DISPONIBLE", "GALPON ARRIBA", null, "OK", null, 160000]);
  inv.addRow(["MOLCO SEGUNDA", "90 X 2,10", 202308000000102, "LENGA", null, "DISPONIBLE", "FABIRCA", null, "OK // MANCHADA", null, 99000]);
  inv.addRow(["MAMPARA LICAN", "45 X 2,00", 202308000000103, "OREGON", null, "DISPONIBLE", "GALPON ATRÁS", null, "OK", null, null]);
  inv.addRow(["MOLCO", "78 X 2,066", 202308000000104, "OREGON", null, "DISPONIBLE", "FABRICA", "Cliente Ficticio", "OK PAGADA POR NELTUME", null, null]);
  inv.addRow(["FUY", "70 X 2,00", null, "ALAMO", null, "SIN FILM", "FABRICA", null, "OK", null, null]);
  inv.addRow(["NELTUME", "90 X 2,10", 202308000000101, "OREGON", null, "DISPONIBLE", "FABRICA", null, "POSIBLE VENDIDA", null, null]);
  inv.addRow(["LANCO", "ilegible", 202308000000106, "OREGON", null, "DISPONIBLE", "FABRICA", null, "OK", null, null]);
  inv.addRow(["ANCACOMOE", "80 X 2,00", 202308000000107, "OREGON", "2204-01-01", "DISPONIBLE", "FABRICA", null, "OK", null, null]);
  const des = w.addWorksheet("Despachos");
  des.addRow(["MODELO", "MEDIDA", "CODIGO", "MADERA", "FECHA PRODUCCION", "ESTADO", "CLIENTE", "DOCUMENTO", null, null, null]);
  des.addRow(["COZ COZ ", "90 X 2,00", 202308000000496, "OREGON", new Date("2023-01-02"), "VENDIDA ", "Cliente Uno", "F. 2355", "OK", 75000, 83000]);
  des.addRow(["COZ COZ ", "90 X 2,00", 202308000000496, "OREGON", new Date("2023-01-02"), "VENDIDA ", "Cliente Uno", "F. 2355", "OK", 75000, 83000]);
  des.addRow(["MOLCO", "80 X 2,00", "PRODUCCION DEL DIA", "OREGON", "2204-03-01", "CONCESIÓN", "Cliente Dos", "NP 405", "PRIMERA", null, null]);
  return (await w.xlsx.writeBuffer()) as ArrayBuffer;
}

const cargar = async (agregar = false) => {
  const libro = await leerInventario(await planilla());
  return bd().transaction((tx) => cargarInventario(tx, libro, actor, "consola", { hoy: HOY, agregar }));
};
const puerta = async (codigo: string) => (await app.query(`SELECT p.*, a.codigo AS articulo, a.fuera_catalogo, v.existencia, v.apartada
  FROM puerta p JOIN articulo a ON a.id = p.articulo_id JOIN v_puerta v ON v.puerta_id = p.id WHERE p.codigo = $1`, [codigo])).rows[0];

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "carga@neltume.cl", nombre: "Carga", clave: "clave-carga-1" }, { tipo: "sistema" }, "consola"));
  actor = { tipo: "usuario", id: u.id };
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", actor);
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("carga del inventario (REQ-STK-9)", () => {
  it("si ya hay stock que no viene de la planilla, se detiene salvo --agregar", async () => {
    const a = await articuloPorCodigo(bd(), "FUY-O-2-A");
    await bd().transaction((tx) => registrarMovimientos(tx, [{ articuloId: a.id, tipo: "entrada_produccion", cantidad: 1 }], actor, "consola"));
    await expect(cargar()).rejects.toThrow(/no vienen de la planilla/);
  });

  it("crea cada puerta en su artículo de catálogo o fuera de catálogo, con ubicación, calidad, observación y apartado", async () => {
    const i = await cargar(true);
    expect(i.puertas).toMatchObject({ leidas: 8, cargadas: 7, catalogo: 4, fueraCatalogo: 3, apartadas: 1, codigosNuevos: 2, segunda: 1 });
    expect(i.fueraPorMotivo).toEqual({ "modelo que no está en la lista": 1, "ancho fuera de grilla": 1, "madera que no está en la lista": 1 });
    expect(i.rechazos).toEqual([{ fila: 8, motivo: "Medida «ilegible» ilegible" }]);
    expect(i.creados).toMatchObject({ modelos: ["MAMPARA LICAN"], maderas: ["ALAMO"], articulos: 3 });
    expect(await puerta("202308000000101")).toMatchObject({ articulo: "MOL-O-3-B", ubicacion: "Galpón arriba", calidad: "primera", ancho_mm: 800, alto_mm: 2100, existencia: 1, apartada: 0 });
    expect(await puerta("202308000000102")).toMatchObject({ articulo: "MOL-L-4-B", ubicacion: "Fábrica", calidad: "segunda", observacion: "Manchada" });
    expect(await puerta("202308000000103")).toMatchObject({ articulo: "MAMPARA-LICAN-O-450X2000", fuera_catalogo: true, ubicacion: "Galpón atrás" });
    expect(await puerta("202308000000104")).toMatchObject({ articulo: "MOL-O-780X2066", fuera_catalogo: true, apartada: 1, observacion: "Pagada por neltume" });
    expect((await puerta("202308000000107")).fecha_produccion).toBeNull();
    expect(i.dudas.map((d) => d.fila)).toEqual(expect.arrayContaining([6, 7, 9]));
    expect(await saldo(bd(), { articuloId: (await articuloPorCodigo(bd(), "MOL-O-3-B")).id })).toMatchObject({ existencia: 1, disponible: 1 });
  });

  it("guarda el historial completo con sus dudas y sin importes", async () => {
    const { rows } = await app.query("SELECT fila, codigo, estado, cliente, documento, nota, dudas, fecha_produccion::text AS fecha, fecha_texto FROM despacho_historico ORDER BY fila");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ codigo: "202308000000496", estado: "VENDIDA", cliente: "Cliente Uno", documento: "F. 2355", nota: "OK", dudas: ["código repetido"], fecha: "2023-01-02" });
    expect(rows[2]).toMatchObject({ codigo: "PRODUCCION DEL DIA", dudas: ["código no numérico", "fecha imposible"], fecha: null, fecha_texto: "2204-03-01" });
    const texto = JSON.stringify(rows);
    expect(texto).not.toContain("75000");
    expect(texto).not.toContain("83000");
  });

  it("la auditoría resume conteos y filas, sin precios ni clientes (REQ-STK-9.4)", async () => {
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE accion = 'cargar inventario'");
    expect(rows).toHaveLength(1);
    const texto = JSON.stringify(rows[0].despues);
    expect(texto).toContain('"cargadas":7');
    for (const prohibido of ["160000", "99000", "Cliente Ficticio", "Cliente Uno"]) expect(texto).not.toContain(prohibido);
    expect((await app.query("SELECT count(*)::int AS n FROM audit_log WHERE accion IN ('ajuste', 'reserva') AND despues::text LIKE '%Inventario inicial%'")).rows[0].n).toBe(0);
  });

  it("recargar no duplica puertas ni historial (REQ-STK-9.3)", async () => {
    const antes = (await app.query("SELECT count(*)::int AS n FROM puerta")).rows[0].n;
    const i = await cargar(true); // sigue la puerta FUY de la primera prueba, que no viene de la planilla
    expect(i.puertas).toMatchObject({ cargadas: 0, yaExistian: 5 });
    expect(i.rechazos.map((r) => r.fila).sort()).toEqual([6, 7, 8]);
    expect(i.historico).toMatchObject({ cargadas: 0, yaExistian: 3 });
    expect((await app.query("SELECT count(*)::int AS n FROM puerta")).rows[0].n).toBe(antes);
  });
});
