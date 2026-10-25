// `npm run dev`: migra la BD local y levanta Next.js (decisión del usuario: todo con un comando).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { migrar } from "../src/db/migrar";
import { urlCompras, urlEnlace, urlWorker } from "../src/db/urls";

const owner = process.env.DATABASE_URL_OWNER;
const app = process.env.DATABASE_URL;
if (!owner || !app) {
  console.error("Faltan DATABASE_URL_OWNER y DATABASE_URL. Copia .env.example a .env.local y ejecuta `npm run db:setup`.");
  process.exit(1);
}

try {
  await migrar(owner, app);
  console.log("✓ BD al día");
} catch (e) {
  console.error("✗ No se pudo migrar la BD local. ¿Está corriendo PostgreSQL? ¿Ejecutaste `npm run db:setup`?");
  console.error((e as Error).message);
  process.exit(1);
}

// App y worker de IA (cola de interpretaciones) en paralelo; si uno termina, se detiene el otro.
const entornoNext = { ...process.env, CMD_API_KEY: "" };
const next = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit", env: entornoNext });
// El worker usa su propio rol de BD, con permisos mínimos (ADR-0017).
const entornoWorker: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: urlWorker(app) };
for (const clave of ["CMD_API_KEY", "CMD_API_BASE_URL", "INTEGRACION_TIENDA_SECRETO", "INTEGRACION_TIENDA_SECRETO_ANTERIOR"]) delete entornoWorker[clave];
const worker = spawn("npx", ["tsx", "--env-file-if-exists=.env.worker.local", "src/ai/worker.ts"], { stdio: "inherit", env: entornoWorker });
const procesos = [next, worker];
// Compras desde Chipax (ADR-0021): solo con credenciales completas en .env.compras.local (sin ellas el servicio
// termina y detendría la app); usa su propio rol de BD. Las credenciales no pasan por este proceso.
const chipax = existsSync(".env.compras.local") ? parseEnv(readFileSync(".env.compras.local", "utf8")) : {};
if (chipax.CHIPAX_APP_ID && chipax.CHIPAX_SECRET_KEY) {
  const entornoCompras: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL_COMPRAS: urlCompras(app) };
  for (const clave of ["CMD_API_KEY", "CHIPAX_APP_ID", "CHIPAX_SECRET_KEY", "INTEGRACION_TIENDA_SECRETO", "INTEGRACION_TIENDA_SECRETO_ANTERIOR"]) delete entornoCompras[clave];
  procesos.push(spawn("npx", ["tsx", "--env-file-if-exists=.env.compras.local", "src/compras/servicio.ts"], { stdio: "inherit", env: entornoCompras }));
} else {
  console.log("· Compras desde Chipax: sin credenciales en .env.compras.local, el servicio no se inicia (RUNBOOK §7).");
}
// Enlace con la tienda (ADR-0024): reenvía las pruebas de conexión que la app firmó, con su propio rol de BD y sin el secreto
// de la integración. Arranca siempre: sin ENLACE_TIENDA_URL (en .env.enlace.local) las pruebas quedan «sin configurar».
const entornoEnlace: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL_ENLACE: urlEnlace(app) };
// Un .env.local copiado de .env.example trae `ENLACE_TIENDA_URL=` vacío, y `--env-file` no pisa lo ya definido, ni siquiera vacío:
// se borran las ENLACE_* heredadas para que mande .env.enlace.local.
for (const clave of ["CMD_API_KEY", "INTEGRACION_TIENDA_SECRETO", "INTEGRACION_TIENDA_SECRETO_ANTERIOR", "ENLACE_TIENDA_URL", "ENLACE_TIENDA_TIMEOUT_MS"]) delete entornoEnlace[clave];
procesos.push(spawn("npx", ["tsx", "--env-file-if-exists=.env.enlace.local", "src/enlace/servicio.ts"], { stdio: "inherit", env: entornoEnlace }));
for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => procesos.forEach((p) => p.kill(senal)));
for (const p of procesos) p.on("exit", (codigo) => { procesos.forEach((q) => q.kill("SIGTERM")); process.exit(codigo ?? 0); });
