// Servicio de compras desde Chipax (ADR-0021). Dev: `npm run compras` (o `npm run dev` si existe .env.compras.local).
// Producción: servicio `compras` de Compose (perfil `chipax`). Solo él recibe CHIPAX_APP_ID y CHIPAX_SECRET_KEY y se
// conecta con el rol `neltume_compras`, que solo puede registrar recepciones de materias primas.
import { createServer } from "node:http";
import { bd, cerrarBd } from "@/db/conexion";
import { cargarEnvLocal, urlCompras } from "@/db/urls";
import { registro } from "@/lib/registro";
import { clienteChipax } from "./chipax";
import { ejecutarCorrida, tomarCorrida } from "./corrida";

const credenciales = { appId: process.env.CHIPAX_APP_ID ?? "", secretKey: process.env.CHIPAX_SECRET_KEY ?? "" };
delete process.env.CHIPAX_APP_ID;
delete process.env.CHIPAX_SECRET_KEY;
// .env.local tiene la configuración de la app (BD); el servicio usa su propio rol, nunca el de la app.
if (process.env.NODE_ENV !== "production") cargarEnvLocal();
process.env.DATABASE_URL = process.env.DATABASE_URL_COMPRAS || urlCompras();

if (!credenciales.appId || !credenciales.secretKey) {
  registro.error("faltan CHIPAX_APP_ID y CHIPAX_SECRET_KEY: el servicio de compras no inicia (ver RUNBOOK)");
  process.exit(1);
}

const cliente = clienteChipax({
  ...credenciales,
  base: process.env.CHIPAX_API_URL || undefined,
  hostsXml: process.env.CHIPAX_XML_HOSTS ? process.env.CHIPAX_XML_HOSTS.split(",").map((h) => h.trim()).filter(Boolean) : undefined,
  esperaMs: process.env.CHIPAX_ESPERA_MS ? Number(process.env.CHIPAX_ESPERA_MS) : undefined,
});
const sondeo = Number(process.env.COMPRAS_SONDEO_MS || 15_000);
let activo = true;

// Salud opcional (E2E y healthchecks): responde 200 mientras el servicio corre.
const puerto = Number(process.env.COMPRAS_PUERTO_SALUD || 0);
const salud = puerto ? createServer((_, res) => res.writeHead(200).end("ok")).listen(puerto) : null;

async function bucle() {
  registro.info("servicio de compras desde Chipax iniciado");
  while (activo) {
    try {
      const id = await tomarCorrida(bd());
      if (id) {
        const c = await ejecutarCorrida(bd(), cliente, id);
        registro.info("sincronización de Chipax terminada", { ...c });
      }
    } catch (e) {
      registro.error("error en el servicio de compras", { error: (e as Error).message });
    }
    await new Promise((ok) => setTimeout(ok, sondeo));
  }
  salud?.close();
  await cerrarBd();
}

for (const senal of ["SIGINT", "SIGTERM"] as const) process.on(senal, () => { activo = false; });
void bucle();
