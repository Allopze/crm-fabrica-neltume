import { Pool } from "pg";
import { cargarEnvLocal, conBase, requerirEnv } from "../src/db/urls";

// Acceso directo a la BD efímera neltume_e2e, con el rol de la app, solo para verificar lo que la UI no muestra
// (registro de llamadas a la IA, inmutabilidad de audit_log).
cargarEnvLocal();
export const bdE2e = () => new Pool({ connectionString: conBase(requerirEnv("DATABASE_URL"), "neltume_e2e"), max: 2 });
