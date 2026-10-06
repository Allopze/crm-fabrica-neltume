// Administración de alias de modelos (REQ-COT-2.11): catalogo.editar, auditado.
import { asc, eq } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { aliasModelo, modelo } from "@/db/esquema/catalogo";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { compacto } from "./modelos";

export async function listarAlias(tx: Tx) {
  return tx.select().from(aliasModelo).orderBy(asc(aliasModelo.modelo), asc(aliasModelo.alias));
}

export async function agregarAlias(tx: Tx, d: { alias: string; modelo: string; tipo: "seguro" | "posible" }, actor: Actor, origen: Origen) {
  const clave = compacto(d.alias);
  if (clave.length < 3) throw new ErrorDominio("VALIDACION", "El alias debe tener al menos 3 letras.");
  const modelos = await tx.select({ nombre: modelo.nombre, codigo: modelo.codigo }).from(modelo);
  const destino = modelos.find((m) => compacto(m.nombre) === compacto(d.modelo));
  if (!destino) throw new ErrorDominio("VALIDACION", `El modelo «${d.modelo}» no está en el catálogo.`);
  if (modelos.some((m) => compacto(m.nombre) === clave || m.codigo === clave)) throw new ErrorDominio("VALIDACION", `«${d.alias}» ya es el nombre o código de un modelo real.`);
  const [antes] = await tx.select().from(aliasModelo).where(eq(aliasModelo.alias, clave));
  const [nuevo] = await tx.insert(aliasModelo).values({ alias: clave, modelo: destino.nombre, tipo: d.tipo })
    .onConflictDoUpdate({ target: aliasModelo.alias, set: { modelo: destino.nombre, tipo: d.tipo } }).returning();
  await registrarAuditoria(tx, { actor, accion: antes ? "cambiar alias" : "agregar alias", recurso: "alias_modelo", recursoId: clave, antes, despues: nuevo, resultado: "ok", origen });
  return nuevo;
}

export async function quitarAlias(tx: Tx, alias: string, actor: Actor, origen: Origen) {
  const [antes] = await tx.delete(aliasModelo).where(eq(aliasModelo.alias, compacto(alias))).returning();
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Ese alias no existe.");
  await registrarAuditoria(tx, { actor, accion: "quitar alias", recurso: "alias_modelo", recursoId: antes.alias, antes, resultado: "ok", origen });
}
