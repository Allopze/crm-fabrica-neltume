import { Pool } from "pg";
import { requerirEnv } from "@/db/urls";

// La base de este archivo la creó base-por-archivo.ts (setupFiles) y quedó en el entorno.
export const urlsTest = { app: requerirEnv("DATABASE_URL"), owner: requerirEnv("DATABASE_URL_OWNER") };

export const poolOwner = () => new Pool({ connectionString: urlsTest.owner, max: 2 });
export const poolApp = () => new Pool({ connectionString: urlsTest.app, max: 2 });
