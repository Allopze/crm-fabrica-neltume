// Servicio de enlace con la tienda (ADR-0024). Dev: `npm run enlace` (o `npm run dev`). Producción: servicio `enlace` de
// Compose (perfil `tienda`). Reenvía las pruebas de conexión que la app ya firmó, solo a ENLACE_TIENDA_URL: no conoce el
// secreto de la integración, se conecta con el rol `neltume_enlace` y no recibe conexiones. La app no sale a internet.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { parseEnv } from "node:util";
import { bd, cerrarBd } from "@/db/conexion";
import { urlEnlace } from "@/db/urls";
import { registro } from "@/lib/registro";
import { registrarResultado, tomarPrueba } from "./cola";
import { configEnlace, enviarPrueba } from "./envio";

// En desarrollo el rol propio se deriva de la URL de la app (DATABASE_URL de .env.local). Se lee solo esa línea: el resto de
// .env.local, con el secreto de la integración, nunca entra a este proceso. Después se descarta lo que traiga el entorno.
if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL_ENLACE && !process.env.DATABASE_URL) {
  try {
    const urlApp = parseEnv(readFileSync(".env.local", "utf8")).DATABASE_URL;
    if (urlApp) process.env.DATABASE_URL = urlApp;
  } catch { /* sin .env.local: urlEnlace() avisa que falta DATABASE_URL */ }
}
process.env.DATABASE_URL = process.env.DATABASE_URL_ENLACE || urlEnlace();
for (const clave of Object.keys(process.env)) {
  if (/^(DATABASE_ADMIN_URL|DATABASE_URL_\w+|INTEGRACION_TIENDA_\w+|CMD_\w+|CHIPAX_\w+)$/.test(clave)) delete process.env[clave];
}

const config = configEnlace();
const sondeo = Number(process.env.ENLACE_SONDEO_MS || 2_000);
let activo = true;

// Salud opcional (E2E y healthchecks): responde 200 mientras el servicio corre.
const puerto = Number(process.env.ENLACE_PUERTO_SALUD || 0);
const salud = puerto ? createServer((_, res) => res.writeHead(200).end("ok")).listen(puerto) : null;

async function bucle() {
  registro.info("servicio de enlace con la tienda iniciado", { destino: config.url ? new URL(config.url).host : null });
  if (!config.url) registro.warn(config.motivoSinUrl ?? "Falta ENLACE_TIENDA_URL: las pruebas quedarán «sin configurar».");
  while (activo) {
    try {
      const prueba = await tomarPrueba(bd());
      if (prueba) {
        const r = await enviarPrueba(config, prueba);
        await registrarResultado(bd(), prueba, r);
        registro.info("prueba de conexión enviada", { estado: r.estado, http: r.httpStatus, ms: r.latenciaMs });
        continue; // si hay otra esperando, sin esperar el sondeo
      }
    } catch (e) {
      registro.error("error en el servicio de enlace", { error: (e as Error).message });
    }
    await new Promise((ok) => setTimeout(ok, sondeo));
  }
  salud?.close();
  await cerrarBd();
}

for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => { activo = false; });
void bucle();
