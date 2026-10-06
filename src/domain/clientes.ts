// Clientes (REQ-COT-9). Datos personales: mínimo necesario, solo con clientes.ver, nunca a la IA (SECURITY §4).
import { asc, eq, gt, ilike, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cliente } from "@/db/esquema/comercial";
import { type Actor, type Origen, registrarAuditoria } from "./auditoria";
import { ErrorDominio } from "./errores";
import { normalizarRut, rutValido } from "./rut";

export interface DatosCliente {
  nombre: string; rut: string; tipo?: "tienda" | "directo"; giro?: string | null; direccion?: string | null;
  direccionDespacho?: string | null; comuna?: string | null; contacto?: string | null; email?: string | null; telefono?: string | null;
}

function validar(d: Partial<DatosCliente>) {
  if (d.nombre !== undefined && d.nombre.trim().length < 2) throw new ErrorDominio("VALIDACION", "El nombre es obligatorio");
  if (d.rut !== undefined && !rutValido(d.rut)) throw new ErrorDominio("VALIDACION", "RUT inválido (revisa el dígito verificador)");
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new ErrorDominio("VALIDACION", "Correo inválido");
}

/** Recorta textos (vacío → null) y normaliza el RUT. */
function limpiar<T extends Partial<DatosCliente>>(d: T): T {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) r[k] = typeof v === "string" ? (k === "rut" ? normalizarRut(v) : v.trim() || null) : v;
  return r as T;
}

export async function crearCliente(tx: Tx, d: DatosCliente, actor: Actor, origen: Origen) {
  validar(d);
  const datos = limpiar(d);
  const [existe] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.rut, datos.rut));
  if (existe) throw new ErrorDominio("VALIDACION", "Ya existe un cliente con ese RUT");
  const [c] = await tx.insert(cliente).values(datos).returning();
  await registrarAuditoria(tx, { actor, accion: "crear", recurso: "cliente", recursoId: c.id, despues: c, resultado: "ok", origen });
  return c;
}

export async function actualizarCliente(tx: Tx, id: string, d: Partial<DatosCliente>, actor: Actor, origen: Origen) {
  validar(d);
  const [antes] = await tx.select().from(cliente).where(eq(cliente.id, id));
  if (!antes) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado");
  const datos = limpiar(d);
  if (datos.rut && datos.rut !== antes.rut) {
    const [otro] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.rut, datos.rut));
    if (otro) throw new ErrorDominio("VALIDACION", "Ya existe un cliente con ese RUT");
  }
  const [despues] = await tx.update(cliente).set({ ...datos, actualizadoEn: sql`now()` }).where(eq(cliente.id, id)).returning();
  // Solo los campos que cambiaron (SECURITY §3).
  const cambios = Object.keys(datos).filter((k) => String(antes[k as keyof typeof antes] ?? "") !== String(despues[k as keyof typeof despues] ?? ""));
  await registrarAuditoria(tx, {
    actor, accion: "actualizar", recurso: "cliente", recursoId: id, resultado: "ok", origen,
    antes: Object.fromEntries(cambios.map((k) => [k, antes[k as keyof typeof antes]])),
    despues: Object.fromEntries(cambios.map((k) => [k, despues[k as keyof typeof despues]])),
  });
  return despues;
}

export async function buscarClientes(tx: Tx, f: { q?: string; cursor?: string; limite?: number }) {
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 200);
  const condiciones = [];
  if (f.q) condiciones.push(or(ilike(cliente.nombre, `%${f.q}%`), ilike(cliente.rut, `%${f.q.replace(/\./g, "")}%`), ilike(cliente.comuna, `%${f.q}%`)));
  if (f.cursor) condiciones.push(gt(cliente.nombre, f.cursor));
  const filas = await tx.select().from(cliente).where(condiciones.length ? sql.join(condiciones, sql` AND `) : undefined).orderBy(asc(cliente.nombre)).limit(limite + 1);
  const datos = filas.slice(0, limite);
  return { datos, siguiente: filas.length > limite ? datos.at(-1)!.nombre : null };
}

export async function obtenerCliente(tx: Tx, id: string) {
  const [c] = await tx.select().from(cliente).where(eq(cliente.id, id));
  if (!c) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado");
  return c;
}
