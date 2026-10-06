import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogoVolumen, generarLibro } from "../fixtures/excel-ficticio";
import { bd, cerrarBd } from "@/db/conexion";
import { cargarCatalogoMapeo } from "@/domain/cotizaciones/catalogo";
import { importarExcel } from "@/domain/importacion/importar";
import { preciosDeLista } from "@/domain/precios/listas";
import { listarStock } from "@/domain/stock";
import { crearUsuario } from "@/domain/usuarios";

// REQ-NFR-8 (TESTING §5): lista completa (~8.800 filas) se importa en ≤ 60 s y se consulta en ≤ 1 s.
let actor: { tipo: "usuario"; id: string };
let libro: { buffer: ArrayBuffer; filas: number };

beforeAll(async () => {
  actor = { tipo: "usuario", id: (await bd().transaction((tx) => crearUsuario(tx, { email: "volumen@neltume.cl", nombre: "Volumen", clave: "clave-volumen" }, { tipo: "sistema" }, "consola"))).id };
  const { modelos, variantes } = catalogoVolumen();
  libro = await generarLibro({ modelos, variantes });
}, 60_000);
afterAll(async () => { await cerrarBd(); });

const cronometro = async <T>(fn: () => Promise<T>) => { const t = performance.now(); const r = await fn(); return { r, ms: performance.now() - t }; };

describe("volumen de la lista de precios (REQ-NFR-8)", () => {
  it("importa ~8.900 filas en ≤ 60 s", async () => {
    expect(libro.filas).toBeGreaterThanOrEqual(8_800);
    const { r, ms } = await cronometro(() => importarExcel(libro.buffer, "volumen.xlsx", actor));
    expect(r).toMatchObject({ listaVersion: 1, creadas: libro.filas, rechazadas: 0 });
    expect(ms).toBeLessThan(60_000);
  }, 90_000);

  it("busca en la lista, lista stock y carga el catálogo de mapeo en ≤ 1 s cada uno", async () => {
    const consultas: (() => Promise<unknown>)[] = [
      () => preciosDeLista(1, { q: "V17-R-4" }, true),
      () => preciosDeLista(1, { madera: "L", limite: 200 }, false),
      () => listarStock(bd(), { q: "V2", limite: 200 }),
      () => cargarCatalogoMapeo(bd()),
    ];
    for (const consulta of consultas) {
      await consulta(); // calienta la conexión
      const { r, ms } = await cronometro(consulta);
      expect(r).toBeTruthy();
      expect(ms).toBeLessThan(1_000);
    }
  }, 30_000);
});
