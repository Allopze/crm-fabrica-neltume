import { migrar } from "../src/db/migrar";
import { requerirEnv } from "../src/db/urls";

await migrar(requerirEnv("DATABASE_URL_OWNER"), requerirEnv("DATABASE_URL"));
console.log("✓ migraciones y permisos aplicados");
