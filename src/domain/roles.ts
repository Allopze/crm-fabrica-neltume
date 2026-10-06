import { eq } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { rol, rolPermiso } from "@/db/esquema/seguridad";
import { CODIGOS_PERMISO, type Permiso } from "./auth/permisos";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";
import { verificarQuedaAdmin } from "./usuarios";

// Un rol es solo un conjunto de permisos: un perfil nuevo se crea como datos (SECURITY §1).

function validarPermisos(permisos: string[]): Permiso[] {
  const invalidos = permisos.filter((p) => !CODIGOS_PERMISO.includes(p as Permiso));
  if (invalidos.length) throw new ErrorDominio("VALIDACION", "Permisos inexistentes", { invalidos });
  return [...new Set(permisos)] as Permiso[];
}

export async function listarRoles(tx: Tx) {
  const filas = await tx
    .select({ id: rol.id, nombre: rol.nombre, permiso: rolPermiso.permisoCodigo })
    .from(rol)
    .leftJoin(rolPermiso, eq(rolPermiso.rolId, rol.id))
    .orderBy(rol.nombre);
  const mapa = new Map<string, { id: string; nombre: string; permisos: string[] }>();
  for (const f of filas) {
    const r = mapa.get(f.id) ?? { id: f.id, nombre: f.nombre, permisos: [] };
    if (f.permiso) r.permisos.push(f.permiso);
    mapa.set(f.id, r);
  }
  return [...mapa.values()];
}

export async function crearRol(tx: Tx, nombre: string, permisos: string[], actor: Actor, origen: Origen) {
  const limpio = nombre.trim().toLowerCase();
  if (!/^[a-záéíóúñ0-9 -]{3,40}$/.test(limpio)) throw new ErrorDominio("VALIDACION", "Nombre de rol inválido (3 a 40 letras, números o guiones)");
  const validos = validarPermisos(permisos);
  const [existe] = await tx.select({ id: rol.id }).from(rol).where(eq(rol.nombre, limpio));
  if (existe) throw new ErrorDominio("VALIDACION", "Ya existe un rol con ese nombre");
  const [nuevo] = await tx.insert(rol).values({ nombre: limpio }).returning({ id: rol.id, nombre: rol.nombre });
  if (validos.length) await tx.insert(rolPermiso).values(validos.map((p) => ({ rolId: nuevo.id, permisoCodigo: p })));
  await registrarAuditoria(tx, { actor, accion: "crear", recurso: "rol", recursoId: nuevo.id, despues: { ...nuevo, permisos: validos }, resultado: "ok", origen });
  return { ...nuevo, permisos: validos };
}

/** Reemplaza los permisos de un rol. No puede dejar el sistema sin administrador (REQ-ADM-2.4). */
export async function definirPermisosRol(tx: Tx, rolId: string, permisos: string[], actor: Actor, origen: Origen) {
  const validos = validarPermisos(permisos);
  const [r] = await tx.select({ id: rol.id }).from(rol).where(eq(rol.id, rolId));
  if (!r) throw new ErrorDominio("NO_ENCONTRADO", "Rol no encontrado");
  const antes = (await tx.select({ p: rolPermiso.permisoCodigo }).from(rolPermiso).where(eq(rolPermiso.rolId, rolId))).map((x) => x.p);
  await tx.delete(rolPermiso).where(eq(rolPermiso.rolId, rolId));
  if (validos.length) await tx.insert(rolPermiso).values(validos.map((p) => ({ rolId, permisoCodigo: p })));
  await verificarQuedaAdmin(tx);
  await registrarAuditoria(tx, { actor, accion: "definir permisos", recurso: "rol", recursoId: rolId, antes: { permisos: antes }, despues: { permisos: validos }, resultado: "ok", origen });
  return { id: rolId, permisos: validos };
}
