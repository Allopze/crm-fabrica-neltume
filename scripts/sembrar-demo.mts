// `npx tsx scripts/sembrar-demo.mts`: datos de DEMOSTRACIÓN (SPEC §2, NC-3): materias primas de ejemplo y BOM
// marcados origen=demo para 3 modelos. Requiere el Excel importado. Idempotente. No usar en producción real.
import { eq } from "drizzle-orm";
import { bd, cerrarBd } from "../src/db/conexion";
import { modelo } from "../src/db/esquema/catalogo";
import { materiaPrima } from "../src/db/esquema/produccion";
import { usuario } from "../src/db/esquema/seguridad";
import { definirBom, listarBoms } from "../src/domain/bom";

const MPS: [string, string, number][] = [
  ['Tabla raulí 1"', "pulg", 300], ['Tabla lenga 1"', "pulg", 250], ['Tabla pino oregón 1"', "pulg", 300],
  ["Tablero MDF 15 mm", "un", 20], ["Cola vinílica D3", "lt", 20], ["Lija grano 120", "un", 100],
];
const BOMS: [string, [string, number][]][] = [
  ["NEL", [['Tabla raulí 1"', 6], ["Cola vinílica D3", 0.4], ["Lija grano 120", 3]]],
  ["MOL", [['Tabla lenga 1"', 5], ["Tablero MDF 15 mm", 0.5], ["Cola vinílica D3", 0.3]]],
  ["ANC", [['Tabla pino oregón 1"', 5.5], ["Cola vinílica D3", 0.35]]],
];

try {
  const [admin] = await bd().select().from(usuario).limit(1);
  if (!admin) throw new Error("Crea primero un usuario con `npm run crear-admin`.");
  const actor = { tipo: "usuario" as const, id: admin.id };
  for (const [nombre, unidadCodigo, stockMinimo] of MPS) {
    await bd().insert(materiaPrima).values({ nombre, unidadCodigo, stockMinimo }).onConflictDoNothing();
  }
  const id = new Map((await bd().select().from(materiaPrima)).map((m) => [m.nombre, m.id]));
  const conBom = new Set((await listarBoms(bd())).map((b) => b.modeloCodigo));
  for (const [cod, lineas] of BOMS) {
    const [m] = await bd().select().from(modelo).where(eq(modelo.codigo, cod));
    if (!m) { console.log(`· ${cod}: modelo no importado, se omite`); continue; }
    if (conBom.has(cod)) { console.log(`· ${cod}: ya tiene BOM`); continue; }
    await bd().transaction((tx) => definirBom(tx, { modeloCodigo: cod, origen: "demo", lineas: lineas.map(([mp, cantidad]) => ({ materiaPrimaId: id.get(mp)!, cantidad })) }, actor, "consola"));
    console.log(`✓ BOM demo para ${cod}`);
  }
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await cerrarBd();
}
