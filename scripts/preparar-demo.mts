// `npm run demo:preparar [ruta.xlsx]`: deja el entorno de DEMOSTRACIÓN listo para el guion (RUNBOOK §6, SPEC §2).
// Importa el Excel real (por defecto datos/Cotizador Puertas Neltume.Co-rev-4E.xlsx), crea 3 clientes ficticios, materias primas y BOM de
// ejemplo (origen=demo), recepciones y un stock inicial de puertas. Idempotente. No usar en producción real.
// No imprime precios, costos ni márgenes del Excel.
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { bd, cerrarBd } from "../src/db/conexion";
import { modelo } from "../src/db/esquema/catalogo";
import { cliente } from "../src/db/esquema/comercial";
import { movimiento } from "../src/db/esquema/inventario";
import { materiaPrima } from "../src/db/esquema/produccion";
import { usuario } from "../src/db/esquema/seguridad";
import { definirBom, listarBoms } from "../src/domain/bom";
import { crearCliente } from "../src/domain/clientes";
import { importarExcel } from "../src/domain/importacion/importar";
import { registrarRecepcion } from "../src/domain/materias-primas";
import { listaVigente } from "../src/domain/precios/listas";
import { articuloPorCodigo, registrarMovimientos } from "../src/domain/stock";

const CLIENTES = [
  { nombre: "Constructora Los Alerces SpA", rut: "76.123.456-0", tipo: "directo" as const, comuna: "Panguipulli", contacto: "Paula Ríos", direccionDespacho: "Camino a Neltume km 3, Panguipulli" },
  { nombre: "Ferretería Puyehue Ltda.", rut: "77.654.321-7", tipo: "tienda" as const, comuna: "Osorno", contacto: "Jorge Leal", direccionDespacho: "Av. República 1450, Osorno" },
  { nombre: "Camila Torres", rut: "15.234.567-4", tipo: "directo" as const, comuna: "Valdivia", contacto: "Camila Torres", direccionDespacho: null },
];
const MPS: [string, string, number, number][] = [ // nombre, unidad, mínimo, recepción inicial
  ['Tabla raulí 1"', "pulg", 300, 400], ['Tabla lenga 1"', "pulg", 250, 180], ['Tabla pino oregón 1"', "pulg", 300, 500],
  ["Tablero MDF 15 mm", "un", 20, 30], ["Cola vinílica D3", "lt", 20, 25], ["Lija grano 120", "un", 100, 60],
];
const BOMS: [string, [string, number][]][] = [
  ["NEL", [['Tabla raulí 1"', 6], ["Cola vinílica D3", 0.4], ["Lija grano 120", 3]]],
  ["MOL", [['Tabla lenga 1"', 5], ["Tablero MDF 15 mm", 0.5], ["Cola vinílica D3", 0.3]]],
  ["ANC", [['Tabla pino oregón 1"', 5.5], ["Cola vinílica D3", 0.35]]],
];
// Con 2 NEL-R-4-B, el pedido de 3 del guion muestra "disponible 2, faltan 1" (REQ-STK-7.3).
const STOCK: [string, number][] = [["NEL-R-4-B", 2], ["LIC-L-4-B", 4], ["ANC-O-3-A", 6], ["MOL-L-4-B", 1]];

const paso = (t: string) => console.log(`\n▸ ${t}`);

try {
  const [admin] = await bd().select().from(usuario).limit(1);
  if (!admin) throw new Error("Crea primero un usuario con `npm run crear-admin`.");
  const actor = { tipo: "usuario" as const, id: admin.id };

  paso("Lista de precios");
  if (await listaVigente()) console.log("· ya hay una lista vigente: no se re-importa");
  else {
    const ruta = process.argv[2] ?? "datos/Cotizador Puertas Neltume.Co-rev-4E.xlsx";
    const b = readFileSync(ruta);
    const inf = await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ruta.split("/").at(-1)!, actor);
    console.log(`✓ ${ruta}: lista v${inf.listaVersion ?? "—"}, ${inf.creadas} artículos nuevos, ${inf.rechazadas} filas rechazadas (detalle en /precios/importar)`);
  }

  paso("Clientes ficticios");
  for (const c of CLIENTES) {
    const [existe] = await bd().select({ id: cliente.id }).from(cliente).where(eq(cliente.nombre, c.nombre));
    if (existe) { console.log(`· ${c.nombre}: ya existe`); continue; }
    await bd().transaction((tx) => crearCliente(tx, c, actor, "consola"));
    console.log(`✓ ${c.nombre}`);
  }

  paso("Materias primas y BOM de demostración");
  for (const [nombre, unidadCodigo, stockMinimo] of MPS) await bd().insert(materiaPrima).values({ nombre, unidadCodigo, stockMinimo }).onConflictDoNothing();
  const mp = new Map((await bd().select().from(materiaPrima)).map((m) => [m.nombre, m.id]));
  for (const [nombre, , , cantidad] of MPS) {
    const id = mp.get(nombre)!;
    const [{ n }] = await bd().select({ n: sql<number>`count(*)::int` }).from(movimiento).where(eq(movimiento.materiaPrimaId, id));
    if (n > 0) continue;
    await bd().transaction((tx) => registrarRecepcion(tx, { materiaPrimaId: id, cantidad, referencia: "Recepción inicial demo" }, actor, "consola"));
  }
  const conBom = new Set((await listarBoms(bd())).map((b) => b.modeloCodigo));
  for (const [cod, lineas] of BOMS) {
    const [m] = await bd().select().from(modelo).where(eq(modelo.codigo, cod));
    if (!m) { console.log(`· ${cod}: modelo no importado, se omite`); continue; }
    if (conBom.has(cod)) { console.log(`· ${cod}: ya tiene BOM`); continue; }
    await bd().transaction((tx) => definirBom(tx, { modeloCodigo: cod, origen: "demo", lineas: lineas.map(([nombre, cantidad]) => ({ materiaPrimaId: mp.get(nombre)!, cantidad })) }, actor, "consola"));
    console.log(`✓ BOM demo para ${cod}`);
  }

  paso("Stock inicial de puertas");
  for (const [codigo, cantidad] of STOCK) {
    const a = await articuloPorCodigo(bd(), codigo).catch(() => null);
    if (!a) { console.log(`· ${codigo}: no está en el catálogo, se omite`); continue; }
    const [{ n }] = await bd().select({ n: sql<number>`count(*)::int` }).from(movimiento).where(eq(movimiento.articuloId, a.id));
    if (n > 0) { console.log(`· ${codigo}: ya tiene movimientos`); continue; }
    await bd().transaction((tx) => registrarMovimientos(tx, [{ articuloId: a.id, tipo: "entrada_produccion", cantidad, refTipo: "manual", refId: "Stock inicial demo" }], actor, "consola"));
    console.log(`✓ ${codigo}: ${cantidad}`);
  }
  console.log("\nListo. Recargos por tipo: 0 % hasta que se configuren en /precios (paso 2 del guion).");
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await cerrarBd();
}
