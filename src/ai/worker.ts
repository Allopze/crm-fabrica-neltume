// Worker de IA (ADR-0006): procesa trabajo_ia y guarda la clave de proveedor en memoria solo al llamar.
// Dev: lo lanza `npm run dev`. Producción: servicio `worker` de Compose.
import { createServer } from "node:http";
import { cerrarBd } from "@/db/conexion";
import { cargarEnvLocal } from "@/db/urls";
import { registro } from "@/lib/registro";
import { refrescarCatalogosIA } from "./catalogos";
import { procesarSiguiente } from "./procesar";

if (process.env.NODE_ENV !== "production") {
  const clavesWorker = {
    commandcode: process.env.CMD_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };
  delete process.env.CMD_API_KEY;
  delete process.env.GROQ_API_KEY;
  cargarEnvLocal();
  // .env.local contiene la configuración de Next; no debe aportar claves al worker.
  if (clavesWorker.commandcode) process.env.CMD_API_KEY = clavesWorker.commandcode;
  else delete process.env.CMD_API_KEY;
  if (clavesWorker.groq) process.env.GROQ_API_KEY = clavesWorker.groq;
  else delete process.env.GROQ_API_KEY;
}
let activo = true;

// Salud opcional (E2E y healthchecks): responde 200 mientras el worker corre.
const puerto = Number(process.env.WORKER_PUERTO_SALUD || 0);
const salud = puerto ? createServer((_, res) => res.writeHead(200).end("ok")).listen(puerto) : null;

async function bucle() {
  registro.info("worker de IA iniciado");
  let proximaActualizacion = 0;
  while (activo) {
    try {
      if (process.env.IA_CATALOGO_DESHABILITADO !== "1" && Date.now() >= proximaActualizacion) {
        await refrescarCatalogosIA();
        proximaActualizacion = Date.now() + 60_000;
      }
      const r = await procesarSiguiente();
      if (r === "vacio") await new Promise((ok) => setTimeout(ok, 1_000));
    } catch (e) {
      registro.error("error en el worker de IA", { error: e });
      await new Promise((ok) => setTimeout(ok, 3_000));
    }
  }
  salud?.close();
  await cerrarBd();
}

for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => { activo = false; });
void bucle();
