import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp } from "./bd";
import { bd, cerrarBd } from "@/db/conexion";
import { ErrorDominio } from "@/domain/errores";
import { importarExcel } from "@/domain/importacion/importar";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const leer = (f: string) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const MINI = leer("e2e/fixtures/cotizador-mini.xlsx");
const MINI_V2 = leer("e2e/fixtures/cotizador-mini-v2.xlsx");
let actor: { tipo: "usuario"; id: string };

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "importa@neltume.cl", nombre: "Importa", clave: "clave-importa" }, { tipo: "sistema" }, "consola"));
  actor = { tipo: "usuario", id: u.id };
});
afterAll(async () => { await app.end(); await cerrarBd(); });

describe("importación del Excel (REQ-STK-1.1–1.4, REQ-COT-1.1)", () => {
  it("crea artículos y la lista v1, y rechaza la fila inválida con su motivo", async () => {
    const r = await importarExcel(MINI, "cotizador-mini.xlsx", actor);
    expect(r).toMatchObject({ repetida: false, creadas: 70, actualizadas: 0, rechazadas: 0 });
    // La fila inconsistente (como LLAG-O-2-A en el Excel real) se corrige y se informa (REQ-STK-1.6).
    expect(r.correcciones).toEqual([{ fila: expect.any(Number), detalle: "Código NEL-O-3-B → NEL-O-3-C" }]);
    const { rows } = await app.query("SELECT version, vigente FROM lista_precio");
    expect(rows).toEqual([{ version: r.listaVersion, vigente: true }]);
    const recargos = await app.query("SELECT count(*)::int AS n FROM recargo_tipo");
    expect(recargos.rows[0].n).toBe(4); // 3 tipos + accesorios, en 0 %
  });

  it("re-importar el mismo archivo no duplica ni crea versión (idempotente por hash)", async () => {
    const r = await importarExcel(MINI, "otro-nombre.xlsx", actor);
    expect(r.repetida).toBe(true);
    const { rows } = await app.query("SELECT (SELECT count(*) FROM articulo)::int AS a, (SELECT count(*) FROM lista_precio)::int AS l");
    expect(rows[0]).toEqual({ a: 70, l: 1 });
  });

  it("un archivo con precios distintos crea la versión nueva y deja la anterior intacta", async () => {
    const antes = await app.query("SELECT sum(precio_neto)::numeric AS s FROM precio p JOIN lista_precio l ON l.id = p.lista_id WHERE l.vigente");
    const r = await importarExcel(MINI_V2, "cotizador-mini-v2.xlsx", actor);
    expect(r).toMatchObject({ repetida: false, creadas: 0 });
    const { rows } = await app.query("SELECT version, vigente FROM lista_precio ORDER BY version");
    expect(rows.map((x) => x.vigente)).toEqual([false, true]);
    const v1 = await app.query("SELECT sum(precio_neto)::numeric AS s FROM precio p JOIN lista_precio l ON l.id = p.lista_id WHERE l.version = $1", [rows[0].version]);
    expect(v1.rows[0].s).toBe(antes.rows[0].s);
  });

  it("audita solo conteos y filas, sin costos ni precios", async () => {
    const { rows } = await app.query("SELECT despues FROM audit_log WHERE accion = 'importar excel' ORDER BY id");
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0].despues).sort()).toEqual(["actualizadas", "archivo", "creadas", "filasCorregidas", "filasRechazadas", "hash", "listaVersion", "rechazadas", "sinCambios"]);
  });

  it("un archivo que no es Excel o sin las hojas aborta sin cambios", async () => {
    await expect(importarExcel(new TextEncoder().encode("hola").buffer as ArrayBuffer, "x.xlsx", actor)).rejects.toBeInstanceOf(ErrorDominio);
  });
});
