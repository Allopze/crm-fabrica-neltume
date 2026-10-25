import { sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { auditLog } from "@/db/esquema/seguridad";

export type Origen = "web" | "api" | "worker" | "importacion" | "consola" | "enlace";
export interface Actor {
  tipo: "usuario" | "visitante" | "sistema" | "worker";
  id?: string;
  ip?: string;
  userAgent?: string;
}
export interface EventoAuditoria {
  actor: Actor;
  accion: string;
  recurso: string;
  recursoId?: string;
  antes?: unknown;
  despues?: unknown;
  resultado: "ok" | "denegado" | "error";
  origen: Origen;
  correlacionId?: string;
}

// Campos que nunca se guardan en antes/después (SECURITY §3).
const SENSIBLES = new Set(["hashPassword", "hash_password", "password", "clave", "tokenHash", "token_hash", "csrfToken"]);

function limpiar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).filter(([k]) => !SENSIBLES.has(k)).map(([k, v]) => [k, limpiar(v)]));
  }
  return valor;
}

/** Escribe un evento. Llamar dentro de la misma transacción que la acción auditada. */
export async function registrarAuditoria(tx: Tx, e: EventoAuditoria): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: e.actor.id ?? null,
    actorTipo: e.actor.tipo,
    accion: e.accion,
    recurso: e.recurso,
    recursoId: e.recursoId ?? null,
    antes: e.antes === undefined ? null : limpiar(e.antes),
    despues: e.despues === undefined ? null : limpiar(e.despues),
    resultado: e.resultado,
    origen: e.origen,
    ip: e.actor.ip ?? null,
    userAgent: e.actor.userAgent ?? null,
    correlacionId: e.correlacionId ?? null,
  });
}

/** Ventana de agregación de las denegaciones sin usuario (ADR-0016). */
export const VENTANA_ANONIMA_MIN = 15;

/**
 * Denegación sin usuario (sin sesión, login fallido o bloqueado): a lo más una fila por IP, acción y motivo cada
 * 15 min, con `agregado: true` (ADR-0016, REQ-ADM-3.5). Así el tráfico anónimo no hace crecer sin límite una tabla
 * que no se puede purgar. Devuelve si escribió la fila; el llamador registra cada evento en el log JSON.
 */
export async function registrarDenegacionAnonima(tx: Tx, e: Omit<EventoAuditoria, "resultado" | "actor"> & { actor: Actor; motivo: string }): Promise<boolean> {
  const despues = limpiar({ ...(e.despues && typeof e.despues === "object" ? e.despues : {}), motivo: e.motivo, agregado: true });
  const ip = e.actor.ip ?? null;
  const r = await tx.execute(sql`
    INSERT INTO audit_log (actor_tipo, accion, recurso, recurso_id, despues, resultado, origen, ip, user_agent, correlacion_id)
    SELECT 'visitante', ${e.accion}, ${e.recurso}, ${e.recursoId ?? null}, ${JSON.stringify(despues)}::jsonb, 'denegado', ${e.origen}, ${ip}, ${e.actor.userAgent ?? null}, ${e.correlacionId ?? null}
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_log
      WHERE actor_tipo = 'visitante' AND ip IS NOT DISTINCT FROM ${ip} AND accion = ${e.accion} AND despues->>'motivo' = ${e.motivo}
        AND ocurrido_en > now() - make_interval(mins => ${VENTANA_ANONIMA_MIN})
    )`);
  return (r.rowCount ?? 0) > 0;
}
