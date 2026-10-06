import { defineConfig } from "@playwright/test";
import { cargarEnvLocal, conBase, requerirEnv } from "./src/db/urls";

cargarEnvLocal();

const PUERTO = 3200;

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
  webServer: {
    command: `npx next dev -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: conBase(requerirEnv("DATABASE_URL"), "neltume_e2e"),
      LLM_PROVEEDOR: "doble",
    },
  },
});
