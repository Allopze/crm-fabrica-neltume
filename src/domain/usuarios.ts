import { eq } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { rol, usuario } from "@/db/esquema/seguridad";
import { ROL_ADMIN } from "./auth/permisos";
import { hashPassword } from "./auth/password";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";

export interface NuevoUsuario {
  email: string;
  nombre: string;
  clave: string;
  rolNombre?: string;
}

/** Crea un usuario y lo audita. El correo se guarda en minúsculas y debe ser único. */
export async function crearUsuario(tx: Tx, datos: NuevoUsuario, actor: Actor, origen: Origen) {
  const email = datos.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorDominio("VALIDACION", "Correo inválido");
  if (!datos.nombre.trim()) throw new ErrorDominio("VALIDACION", "El nombre es obligatorio");

  const [r] = await tx.select({ id: rol.id }).from(rol).where(eq(rol.nombre, datos.rolNombre ?? ROL_ADMIN));
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
