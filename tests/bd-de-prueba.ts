// Recrea una base de test desde cero (migraciones + permisos). La usan Vitest y Playwright.
import { asegurarBase } from "../src/db/administrar";
import { migrar } from "../src/db/migrar";
import { cargarEnvLocal, conBase, requerirEnv } from "../src/db/urls";

export async function recrearBaseDePrueba(base: "neltume_test" | "neltume_e2e") {
  cargarEnvLocal();
  const owner = requerirEnv("DATABASE_URL_OWNER");
  const app = requerirEnv("DATABASE_URL");
  // El dueño tiene CREATEDB: puede borrar y crear sus propias bases.
  await asegurarBase(owner, owner, app, base, true);
  const urls = { owner: conBase(owner, base), app: conBase(app, base) };
  await migrar(urls.owner, urls.app);
  return urls;
}
