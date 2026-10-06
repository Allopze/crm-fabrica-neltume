// Worker de IA (ADR-0006): procesa la cola trabajo_ia. Único proceso con la clave del LLM.
// Dev: lo lanza `npm run dev`. Producción: servicio `worker` de Compose.
import { createServer } from "node:http";
import { cerrarBd } from "@/db/conexion";
import { cargarEnvLocal } from "@/db/urls";
import { registro } from "@/lib/registro";
import { crearInterprete } from "./index";
import { procesarSiguiente } from "./procesar";

if (process.env.NODE_ENV !== "production") cargarEnvLocal();
const ia = crearInterprete();
let activo = true;

// Salud opcional (E2E y healthchecks): responde 200 mientras el worker corre.
const puerto = Number(process.env.WORKER_PUERTO_SALUD || 0);
const salud = puerto ? createServer((_, res) => res.writeHead(200).end("ok")).listen(puerto) : null;

async function bucle() {
  registro.info("worker de IA iniciado", { proveedor: ia.nombre });
  while (activo) {
    try {
      const r = await procesarSiguiente(ia);
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
