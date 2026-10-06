import { Pool } from "pg";
import { cargarEnvLocal, conBase, requerirEnv } from "@/db/urls";

cargarEnvLocal();
export const urlsTest = {
  app: conBase(requerirEnv("DATABASE_URL"), "neltume_test"),
  owner: conBase(requerirEnv("DATABASE_URL_OWNER"), "neltume_test"),
};
// Los módulos de la app leen DATABASE_URL: en integración apunta a la base de test.
process.env.DATABASE_URL = urlsTest.app;

export const poolOwner = () => new Pool({ connectionString: urlsTest.owner, max: 2 });
export const poolApp = () => new Pool({ connectionString: urlsTest.app, max: 2 });
