// Cada archivo de integración usa su propia copia de neltume_test (plantilla migrada en el setup global),
// así ningún test depende del orden ni del estado que dejó otro archivo (TESTING §4).
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll } from "vitest";
import { cargarEnvLocal, conBase, ident, partesUrl, requerirEnv } from "@/db/urls";

cargarEnvLocal();
const owner = requerirEnv("DATABASE_URL_OWNER");
const app = requerirEnv("DATABASE_URL");
const base = `neltume_t_${randomBytes(5).toString("hex")}`;

const admin = new Client({ connectionString: conBase(owner, "postgres") });
await admin.connect();
await admin.query(`CREATE DATABASE ${ident(base)} TEMPLATE neltume_test OWNER ${ident(partesUrl(owner).usuario)}`);
await admin.query(`GRANT CONNECT ON DATABASE ${ident(base)} TO ${ident(partesUrl(app).usuario)}`);
await admin.end();

process.env.DATABASE_URL = conBase(app, base);
process.env.DATABASE_URL_OWNER = conBase(owner, base);

afterAll(async () => {
  const c = new Client({ connectionString: conBase(owner, "postgres") });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${ident(base)} WITH (FORCE)`);
  await c.end();
});
