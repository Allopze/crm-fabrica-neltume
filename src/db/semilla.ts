import type { Client } from "pg";
import { PERMISOS, ROL_ADMIN } from "@/domain/auth/permisos";

/** Permisos y rol administrador con todos ellos. Idempotente: corre tras cada migración. */
export async function sembrar(cliente: Client): Promise<void> {
  await cliente.query("BEGIN");
  try {
    for (const [codigo, descripcion] of Object.entries(PERMISOS)) {
      await cliente.query(
        "INSERT INTO permiso (codigo, descripcion) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion",
        [codigo, descripcion],
      );
    }
    await cliente.query("INSERT INTO rol (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", [ROL_ADMIN]);
    await cliente.query(
      `INSERT INTO rol_permiso (rol_id, permiso_codigo)
       SELECT r.id, p.codigo FROM rol r CROSS JOIN permiso p WHERE r.nombre = $1
       ON CONFLICT DO NOTHING`,
      [ROL_ADMIN],
    );
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  }
}
