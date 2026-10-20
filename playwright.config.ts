import { defineConfig } from "@playwright/test";
import { cargarEnvLocal, conBase, requerirEnv, urlCompras, urlWorker } from "./src/db/urls";
import { CREDENCIALES_PRUEBA } from "./tests/fixtures/chipax/simulado";

cargarEnvLocal();

const PUERTO = Number(process.env.PLAYWRIGHT_PUERTO || 3200);
const DATABASE_E2E = conBase(requerirEnv("DATABASE_URL"), "neltume_e2e");
// El worker corre con su propio rol de BD, como en producción (ADR-0017).
const DATABASE_E2E_WORKER = conBase(urlWorker(), "neltume_e2e");
// El servicio de compras corre con su propio rol de BD, como en producción (ADR-0021).
const DATABASE_E2E_COMPRAS = conBase(urlCompras(), "neltume_e2e");
process.env.DATABASE_URL = DATABASE_E2E;

// E2E secuenciales con estado compartido (TESTING.md §3): 1 worker, orden por nombre de archivo,
// sin reintentos ni filtros. Usa el Chrome instalado para no descargar navegadores.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  globalSetup: "./e2e/setup-global.ts",
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    channel: "chrome",
    locale: "es-CL",
    timezoneId: "America/Santiago",
  },
  webServer: [
    {
      command: `npx next dev -p ${PUERTO}`,
      url: `http://localhost:${PUERTO}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NEXT_DIST_DIR: ".next-e2e", DATABASE_URL: DATABASE_E2E, CMD_API_KEY: "", GROQ_API_KEY: "" },
    },
    {
      // El worker usa un servidor HTTP local compatible con Groq; ninguna suite llama al proveedor real.
      command: "npx tsx src/ai/worker.ts",
      url: `http://localhost:${PUERTO + 1}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATABASE_URL: DATABASE_E2E_WORKER, LLM_PROVEEDOR: "doble", CMD_API_KEY: "", GROQ_API_KEY: "groq-e2e-key-simulada-no-real", GROQ_API_BASE_URL: `http://127.0.0.1:${PUERTO + 2}/openai/v1`, WORKER_PUERTO_SALUD: String(PUERTO + 1), LLM_MAX_REINTENTOS: "1", IA_CATALOGO_DESHABILITADO: "1" },
    },
    {
      command: `npx tsx e2e/groq-mock.mts`,
      url: `http://localhost:${PUERTO + 2}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { E2E_MOCK_PUERTO: String(PUERTO + 2) },
    },
    {
      // Chipax simulado (E2E 19): ninguna suite llama a Chipax real.
      command: "npx tsx e2e/chipax-mock.mts",
      url: `http://localhost:${PUERTO + 3}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { E2E_CHIPAX_PUERTO: String(PUERTO + 3) },
    },
    {
      command: "npx tsx src/compras/servicio.ts",
      url: `http://localhost:${PUERTO + 4}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL_COMPRAS: DATABASE_E2E_COMPRAS, CHIPAX_APP_ID: CREDENCIALES_PRUEBA.appId, CHIPAX_SECRET_KEY: CREDENCIALES_PRUEBA.secretKey,
        CHIPAX_API_URL: `http://127.0.0.1:${PUERTO + 3}/v2`, CHIPAX_XML_HOSTS: "127.0.0.1", CHIPAX_ESPERA_MS: "50", COMPRAS_SONDEO_MS: "500",
        COMPRAS_PUERTO_SALUD: String(PUERTO + 4),
      },
    },
  ],
});
