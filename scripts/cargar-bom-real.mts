// `npx tsx --env-file-if-exists=.env.local scripts/cargar-bom-real.mts` (en producción:
// `docker compose run --rm migrar npx tsx scripts/cargar-bom-real.mts`): carga las materias primas reales, asocia cada
// madera a sus pulgadas y crea el BOM real de cada modelo (T2.7, ADR-0012). Idempotente. No imprime montos.
import { asc } from "drizzle-orm";
import { bd, cerrarBd } from "../src/db/conexion";
import { usuario } from "../src/db/esquema/seguridad";
import { cargarBomReal } from "../src/domain/bom-real";

try {
  const [admin] = await bd().select().from(usuario).orderBy(asc(usuario.creadoEn)).limit(1);
  if (!admin) throw new Error("Crea primero un usuario con `npm run crear-admin`.");
  const r = await bd().transaction((tx) => cargarBomReal(tx, { tipo: "usuario", id: admin.id }, "consola"));
  console.log(`✓ ${r.insumosCreados} materias primas nuevas, ${r.maderasAsociadas} maderas asociadas, ${r.bomsCreados} BOM reales creados, ${r.bomsConservados} BOM reales ya existentes (sin tocar).`);
  console.log("Falta: stock inicial (recepciones), stock mínimo y el uso por puerta de Titebond, tarugos, retape y adhesivo.");
} finally {
  await cerrarBd();
}
