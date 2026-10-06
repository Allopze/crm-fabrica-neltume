import { existsSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { sembrar } from "./semilla";
import { ident, partesUrl } from "./urls";

const CARPETA = path.join(process.cwd(), "src/db/migraciones");

/** Tablas donde el rol de la app solo puede insertar y leer (SECURITY §2, ADR-0002). */
export const TABLAS_SOLO_INSERCION = ["audit_log", "movimiento"];

/**
 * Aplica las migraciones con el dueño del esquema, ajusta los permisos del rol de la app y siembra
 * permisos y rol administrador.
 * Idempotente: se puede correr en cada arranque.
 */
export async function migrar(urlOwner: string, urlApp: string): Promise<void> {
  const cliente = new Client({ connectionString: urlOwner });
  await cliente.connect();
  try {
    if (existsSync(path.join(CARPETA, "meta/_journal.json"))) {
      await migrate(drizzle(cliente), { migrationsFolder: CARPETA });
    }
    await aplicarPermisos(cliente, partesUrl(urlApp).usuario);
    await sembrar(cliente);
  } finally {
    await cliente.end();
  }
}

async function aplicarPermisos(cliente: Client, rolApp: string): Promise<void> {
  const app = ident(rolApp);
  await cliente.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
  await cliente.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app}`);
  await cliente.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
  for (const tabla of TABLAS_SOLO_INSERCION) {
    const { rowCount } = await cliente.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1", [tabla]);
    if (rowCount) await cliente.query(`REVOKE UPDATE, DELETE, TRUNCATE ON ${ident(tabla)} FROM ${app}`);
  }
}
