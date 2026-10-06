// `npm run dev`: migra la BD local y levanta Next.js (decisión del usuario: todo con un comando).
import { spawn } from "node:child_process";
import { migrar } from "../src/db/migrar";

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
const entornoNext = { ...process.env, CMD_API_KEY: "", GROQ_API_KEY: "" };
const next = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit", env: entornoNext });
const entornoWorker = { ...process.env };
for (const clave of ["CMD_API_KEY", "GROQ_API_KEY", "CMD_API_BASE_URL", "GROQ_API_BASE_URL"]) delete entornoWorker[clave];
const worker = spawn("npx", ["tsx", "--env-file-if-exists=.env.worker.local", "src/ai/worker.ts"], { stdio: "inherit", env: entornoWorker });
const procesos = [next, worker];
for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => procesos.forEach((p) => p.kill(senal)));
for (const p of procesos) p.on("exit", (codigo) => { procesos.forEach((q) => q.kill("SIGTERM")); process.exit(codigo ?? 0); });
