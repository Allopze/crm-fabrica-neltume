import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { rol, rolPermiso, sesion, usuario } from "@/db/esquema/seguridad";
import { ROL_ADMIN, USUARIO_INTEGRACION } from "./auth/permisos";
import { hashPassword } from "./auth/password";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";

export interface NuevoUsuario {
  email: string;
  nombre: string;
  clave: string;
  rolNombre?: string;
  rolId?: string;
}

/** Crea un usuario y lo audita. El correo se guarda en minúsculas y debe ser único. */
export async function crearUsuario(tx: Tx, datos: NuevoUsuario, actor: Actor, origen: Origen) {
  const email = datos.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorDominio("VALIDACION", "Correo inválido");
  if (!datos.nombre.trim()) throw new ErrorDominio("VALIDACION", "El nombre es obligatorio");

  const filtroRol = datos.rolId ? eq(rol.id, datos.rolId) : eq(rol.nombre, datos.rolNombre ?? ROL_ADMIN);
  const [r] = await tx.select({ id: rol.id }).from(rol).where(filtroRol);
  if (!r) throw new ErrorDominio("VALIDACION", "Rol inexistente");
  const [existe] = await tx.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, email));
  if (existe) throw new ErrorDominio("VALIDACION", "Ya existe un usuario con ese correo");

  const [nuevo] = await tx
    .insert(usuario)
    .values({ email, nombre: datos.nombre.trim(), hashPassword: await hashPassword(datos.clave), rolId: r.id })
    .returning({ id: usuario.id, email: usuario.email, nombre: usuario.nombre, rolId: usuario.rolId });

  await registrarAuditoria(tx, { actor, accion: "crear", recurso: "usuario", recursoId: nuevo.id, despues: nuevo, resultado: "ok", origen });
  return nuevo;
}

export async function listarUsuarios(tx: Tx) {
  return tx
    .select({
      id: usuario.id, email: usuario.email, nombre: usuario.nombre, activo: usuario.activo,
      rolId: rol.id, rol: rol.nombre,
      ultimoIngreso: sql<string | null>`(SELECT max(${sesion.creadaEn}) FROM ${sesion} WHERE ${sesion.usuarioId} = ${usuario.id})`,
    })
    .from(usuario)
    .innerJoin(rol, eq(rol.id, usuario.rolId))
    .orderBy(desc(usuario.activo), usuario.nombre);
}

/** Lanza ULTIMO_ADMIN si no queda ningún usuario activo con permiso de gestionar usuarios (REQ-ADM-2.4). */
export async function verificarQuedaAdmin(tx: Tx): Promise<void> {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(usuario)
    .innerJoin(rolPermiso, and(eq(rolPermiso.rolId, usuario.rolId), eq(rolPermiso.permisoCodigo, "usuarios.gestionar")))
    .where(eq(usuario.activo, true));
  if (n === 0) throw new ErrorDominio("ULTIMO_ADMIN", "Debe quedar al menos un usuario activo que pueda gestionar usuarios.");
}

/** Activa/desactiva o cambia el rol. Revoca las sesiones del usuario afectado. */
export async function actualizarUsuario(tx: Tx, id: string, cambios: { activo?: boolean; rolId?: string }, actor: Actor, origen: Origen) {
  const [antes] = await tx.select({ id: usuario.id, activo: usuario.activo, rolId: usuario.rolId, email: usuario.email }).from(usuario).where(eq(usuario.id, id));
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Usuario no encontrado");
  if (antes.email === USUARIO_INTEGRACION.email) throw new ErrorDominio("VALIDACION", "La integración con la tienda es un usuario técnico: no se activa ni cambia de rol.");
  if (cambios.rolId) {
    const [r] = await tx.select({ id: rol.id }).from(rol).where(eq(rol.id, cambios.rolId));
    if (!r) throw new ErrorDominio("VALIDACION", "Rol inexistente");
  }
  const [despues] = await tx
    .update(usuario)
    .set({ ...cambios, actualizadoEn: sql`now()` })
    .where(eq(usuario.id, id))
    .returning({ id: usuario.id, activo: usuario.activo, rolId: usuario.rolId });
  await verificarQuedaAdmin(tx);
  await tx.update(sesion).set({ revocadaEn: sql`now()` }).where(and(eq(sesion.usuarioId, id), sql`${sesion.revocadaEn} IS NULL`));
  await registrarAuditoria(tx, { actor, accion: "actualizar", recurso: "usuario", recursoId: id, antes: { id: antes.id, activo: antes.activo, rolId: antes.rolId }, despues, resultado: "ok", origen });
  return despues;
}
