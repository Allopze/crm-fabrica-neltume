import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as catalogo from "./esquema/catalogo";
import * as comercial from "./esquema/comercial";
import * as inventario from "./esquema/inventario";
import * as produccion from "./esquema/produccion";
import * as seguridad from "./esquema/seguridad";
import { requerirEnv } from "./urls";

export const esquema = { ...seguridad, ...catalogo, ...inventario, ...produccion, ...comercial };
export type Bd = NodePgDatabase<typeof esquema>;
/** Transacción o conexión: las funciones de dominio aceptan cualquiera de las dos. */
export type Tx = Parameters<Parameters<Bd["transaction"]>[0]>[0] | Bd;

// Un pool por proceso, con el rol de la app (DATABASE_URL). En dev, sobrevive al recargado en caliente.
const global_ = globalThis as unknown as { __neltumePool?: Pool; __neltumeBd?: Bd };

export function bd(): Bd {
  if (!global_.__neltumeBd) {
    global_.__neltumePool = new Pool({ connectionString: requerirEnv("DATABASE_URL"), max: 10 });
    global_.__neltumeBd = drizzle(global_.__neltumePool, { schema: esquema, casing: "snake_case" });
  }
  return global_.__neltumeBd;
}

export async function cerrarBd(): Promise<void> {
  await global_.__neltumePool?.end();
  global_.__neltumePool = undefined;
  global_.__neltumeBd = undefined;
}
