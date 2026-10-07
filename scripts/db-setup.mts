// Crea roles y bases de datos. Dev: también las bases de test (neltume_test, neltume_e2e).
import { asegurarBase, asegurarRoles } from "../src/db/administrar";
import { partesUrl, requerirEnv, urlWorker } from "../src/db/urls";

const admin = requerirEnv("DATABASE_ADMIN_URL");
const owner = requerirEnv("DATABASE_URL_OWNER");
const app = requerirEnv("DATABASE_URL");

await asegurarRoles(admin, owner, app);
const bases = [partesUrl(owner).base];
if (process.env.NODE_ENV !== "production") bases.push("neltume_test", "neltume_e2e");
for (const base of bases) {
  await asegurarBase(admin, owner, app, base);
  console.log(`✓ base ${base} lista`);
}
console.log(`✓ roles ${partesUrl(owner).usuario}, ${partesUrl(app).usuario} y ${partesUrl(urlWorker(app)).usuario} (worker de IA) listos`);
