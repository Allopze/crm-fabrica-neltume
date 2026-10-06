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

const next = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit" });
for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => next.kill(senal));
next.on("exit", (codigo) => process.exit(codigo ?? 0));
