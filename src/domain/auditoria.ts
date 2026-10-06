import type { Tx } from "@/db/conexion";
import { auditLog } from "@/db/esquema/seguridad";

export type Origen = "web" | "api" | "worker" | "importacion" | "consola";
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
