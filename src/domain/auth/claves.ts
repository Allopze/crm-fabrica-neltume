// Cambio y restablecimiento de contraseña (REQ-ADM-1.4, 2.5; auditoría H-14). Nunca se audita un hash ni una clave.
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { bd, type Tx } from "@/db/conexion";
import { intentoLogin, sesion, usuario } from "@/db/esquema/seguridad";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { hashPassword, verificarPassword } from "./password";
import { USUARIO_INTEGRACION } from "./permisos";
import { MAX_FALLOS, type SesionActiva, VENTANA_MIN } from "./sesiones";

interface Contexto { ip?: string; userAgent?: string; correlacionId?: string }

/**
 * La persona cambia su propia contraseña con la actual. Una clave actual incorrecta cuenta como fallo de login (mismo
 * límite de 5 cada 15 min por correo), así una sesión robada no sirve para adivinarla. Revoca sus otras sesiones.
 */
export async function cambiarClavePropia(s: SesionActiva, actual: string, nueva: string, ctx: Contexto): Promise<void> {
  if (actual === nueva) throw new ErrorDominio("VALIDACION", "La nueva contraseña debe ser distinta de la actual.");
  const nuevoHash = await hashPassword(nueva);
  const actor = { tipo: "usuario" as const, id: s.usuario.id, ip: ctx.ip, userAgent: ctx.userAgent };
  const auditar = (tx: Tx, resultado: "ok" | "denegado", despues?: object) =>
    registrarAuditoria(tx, { actor, accion: "cambiar contraseña", recurso: "usuario", recursoId: s.usuario.id, despues, resultado, origen: "web", correlacionId: ctx.correlacionId });

  const error = await bd().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`login:${s.usuario.email}`}))`);
    const [{ fallos }] = await tx.select({ fallos: sql<number>`count(*)::int` }).from(intentoLogin)
      .where(and(eq(intentoLogin.email, s.usuario.email), eq(intentoLogin.ok, false), gt(intentoLogin.ocurridoEn, sql`now() - make_interval(mins => ${VENTANA_MIN})`)));
    if (fallos >= MAX_FALLOS) {
      await auditar(tx, "denegado", { motivo: "LIMITE_LOGIN" });
      return "LIMITE_LOGIN" as const;
    }
    const [u] = await tx.select({ hash: usuario.hashPassword }).from(usuario).where(eq(usuario.id, s.usuario.id));
    if (!u || !(await verificarPassword(u.hash, actual))) {
      await tx.insert(intentoLogin).values({ email: s.usuario.email, ip: ctx.ip ?? null, ok: false });
      await auditar(tx, "denegado", { motivo: "CLAVE_ACTUAL" });
      return "CLAVE_ACTUAL" as const;
    }
    await tx.update(usuario).set({ hashPassword: nuevoHash, actualizadoEn: sql`now()` }).where(eq(usuario.id, s.usuario.id));
    const revocadas = await tx.update(sesion).set({ revocadaEn: sql`now()` })
      .where(and(eq(sesion.usuarioId, s.usuario.id), ne(sesion.id, s.sesionId), sql`${sesion.revocadaEn} IS NULL`)).returning({ id: sesion.id });
    await auditar(tx, "ok", { otrasSesionesCerradas: revocadas.length });
    return null;
  });
  if (error === "LIMITE_LOGIN") throw new ErrorDominio("LIMITE_LOGIN", `Demasiados intentos. Espera ${VENTANA_MIN} minutos.`);
  if (error === "CLAVE_ACTUAL") throw new ErrorDominio("VALIDACION", "La contraseña actual no es correcta.");
}

/** Un administrador fija una contraseña nueva para otro usuario y cierra todas sus sesiones (REQ-ADM-2.5). */
export async function restablecerClave(tx: Tx, usuarioId: string, nueva: string, actor: Actor & { id: string }, origen: Origen): Promise<void> {
  const nuevoHash = await hashPassword(nueva);
  const [u] = await tx.update(usuario).set({ hashPassword: nuevoHash, actualizadoEn: sql`now()` })
    .where(and(eq(usuario.id, usuarioId), ne(usuario.email, USUARIO_INTEGRACION.email))).returning({ id: usuario.id });
  if (!u) throw new ErrorDominio("NO_ENCONTRADO", "Usuario no encontrado");
  const revocadas = await tx.update(sesion).set({ revocadaEn: sql`now()` })
    .where(and(eq(sesion.usuarioId, usuarioId), sql`${sesion.revocadaEn} IS NULL`)).returning({ id: sesion.id });
  await registrarAuditoria(tx, { actor, accion: "restablecer contraseña", recurso: "usuario", recursoId: usuarioId, despues: { sesionesCerradas: revocadas.length }, resultado: "ok", origen });
}
