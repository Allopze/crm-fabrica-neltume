// Sesiones propias en BD (ADR-0005, SECURITY T7). El token solo viaja en la cookie;
// en la BD se guarda su hash SHA-256, así una filtración de la tabla no da acceso.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { bd } from "@/db/conexion";
import { intentoLogin, rolPermiso, sesion, usuario } from "@/db/esquema/seguridad";
import { registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { hashFalso, verificarPassword } from "./password";
import type { Permiso } from "./permisos";

export const HORAS_SESION = 8;
export const MAX_FALLOS = 5;
export const VENTANA_MIN = 15;

export interface SesionActiva {
  sesionId: string;
  csrf: string;
  usuario: { id: string; email: string; nombre: string };
  permisos: ReadonlySet<Permiso>;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

interface Contexto { ip?: string; userAgent?: string; correlacionId?: string }

/** Valida credenciales y abre una sesión. Lanza CREDENCIALES o LIMITE_LOGIN (auditados). */
export async function iniciarSesion(email: string, clave: string, ctx: Contexto) {
  const correo = email.trim().toLowerCase();
  const resultado = await bd().transaction(async (tx) => {
    const desde = sql`now() - make_interval(mins => ${VENTANA_MIN})`;
    const condicionIp = ctx.ip ? or(eq(intentoLogin.email, correo), eq(intentoLogin.ip, ctx.ip)) : eq(intentoLogin.email, correo);
    const [{ fallos }] = await tx
      .select({ fallos: sql<number>`count(*)::int` })
      .from(intentoLogin)
      .where(and(eq(intentoLogin.ok, false), gt(intentoLogin.ocurridoEn, desde), condicionIp));
    const visitante = { tipo: "visitante" as const, ip: ctx.ip, userAgent: ctx.userAgent };

    if (fallos >= MAX_FALLOS) {
      await registrarAuditoria(tx, { actor: visitante, accion: "login", recurso: "sesion", despues: { email: correo, motivo: "limite" }, resultado: "denegado", origen: "web", correlacionId: ctx.correlacionId });
      return { error: "LIMITE_LOGIN" as const };
    }

    const [u] = await tx.select().from(usuario).where(and(eq(usuario.email, correo), eq(usuario.activo, true)));
    const valida = await verificarPassword(u?.hashPassword ?? (await hashFalso()), clave);
    await tx.insert(intentoLogin).values({ email: correo, ip: ctx.ip ?? null, ok: Boolean(u && valida) });

    if (!u || !valida) {
      await registrarAuditoria(tx, { actor: visitante, accion: "login", recurso: "sesion", despues: { email: correo }, resultado: "denegado", origen: "web", correlacionId: ctx.correlacionId });
      return { error: "CREDENCIALES" as const };
    }

    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(24).toString("base64url");
    const expiraEn = new Date(Date.now() + HORAS_SESION * 3_600_000);
    const [s] = await tx
      .insert(sesion)
      .values({ tokenHash: hashToken(token), csrfToken: csrf, usuarioId: u.id, expiraEn, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null })
      .returning({ id: sesion.id });
    await registrarAuditoria(tx, { actor: { tipo: "usuario", id: u.id, ip: ctx.ip, userAgent: ctx.userAgent }, accion: "login", recurso: "sesion", recursoId: s.id, resultado: "ok", origen: "web", correlacionId: ctx.correlacionId });
    return { token, csrf, expiraEn, usuario: { id: u.id, email: u.email, nombre: u.nombre } };
  });

  if ("error" in resultado) {
    const mensaje = resultado.error === "LIMITE_LOGIN"
      ? `Demasiados intentos. Espera ${VENTANA_MIN} minutos.`
      : "Correo o contraseña incorrectos.";
    throw new ErrorDominio(resultado.error, mensaje);
  }
  return resultado;
}

/** Devuelve la sesión vigente del token, o null si no existe, expiró, fue revocada o el usuario está inactivo. */
export async function validarSesion(token: string | undefined): Promise<SesionActiva | null> {
  if (!token) return null;
  const filas = await bd()
    .select({ sesionId: sesion.id, csrf: sesion.csrfToken, id: usuario.id, email: usuario.email, nombre: usuario.nombre, permiso: rolPermiso.permisoCodigo })
    .from(sesion)
    .innerJoin(usuario, eq(usuario.id, sesion.usuarioId))
    .leftJoin(rolPermiso, eq(rolPermiso.rolId, usuario.rolId))
    .where(and(eq(sesion.tokenHash, hashToken(token)), isNull(sesion.revocadaEn), gt(sesion.expiraEn, sql`now()`), eq(usuario.activo, true)));
  if (filas.length === 0) return null;
  const [f] = filas;
  return {
    sesionId: f.sesionId,
    csrf: f.csrf,
    usuario: { id: f.id, email: f.email, nombre: f.nombre },
    permisos: new Set(filas.map((x) => x.permiso).filter(Boolean) as Permiso[]),
  };
}

/** Revoca la sesión de inmediato y lo audita. */
export async function cerrarSesion(s: SesionActiva, ctx: Contexto): Promise<void> {
  await bd().transaction(async (tx) => {
    await tx.update(sesion).set({ revocadaEn: sql`now()` }).where(eq(sesion.id, s.sesionId));
    await registrarAuditoria(tx, { actor: { tipo: "usuario", id: s.usuario.id, ip: ctx.ip, userAgent: ctx.userAgent }, accion: "logout", recurso: "sesion", recursoId: s.sesionId, resultado: "ok", origen: "web", correlacionId: ctx.correlacionId });
  });
}

/** Revoca todas las sesiones de un usuario (al desactivarlo o cambiar su rol). */
export async function revocarSesionesDe(usuarioId: string): Promise<void> {
  await bd().update(sesion).set({ revocadaEn: sql`now()` }).where(and(eq(sesion.usuarioId, usuarioId), isNull(sesion.revocadaEn)));
}
