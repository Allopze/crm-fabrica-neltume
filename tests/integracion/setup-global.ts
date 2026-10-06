import { Client } from "pg";
import { cargarEnvLocal, conBase, ident, requerirEnv } from "@/db/urls";
import { recrearBaseDePrueba } from "../bd-de-prueba";

// TESTING §4: la plantilla de integración se recrea desde las migraciones al inicio de la capa,
// y se borran copias por archivo que hayan quedado de corridas abortadas.
export default async function setup() {
  cargarEnvLocal();
  const c = new Client({ connectionString: conBase(requerirEnv("DATABASE_URL_OWNER"), "postgres") });
  await c.connect();
  const { rows } = await c.query("SELECT datname FROM pg_database WHERE datname LIKE 'neltume\\_t\\_%'");
  for (const r of rows) await c.query(`DROP DATABASE IF EXISTS ${ident(r.datname)} WITH (FORCE)`);
  await c.end();
  await recrearBaseDePrueba("neltume_test");
}
