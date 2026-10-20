// Sugerencias del borrador calculadas al leer, sin IA y sin guardarlas (REQ-COT-2.18–2.20): cliente detectado por RUT,
// correo o teléfono del texto original, cotizaciones posiblemente repetidas y plazo pedido. Nada se aplica solo.
import { and, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cliente, cotizacion, cotizacionItem } from "@/db/esquema/comercial";
import { encontrarDatosPersonales } from "@/lib/datos-personales";
import { hoySantiago } from "../precios/dias-habiles";
import { normalizarRut, rutValido } from "../rut";
import { leerPlazo } from "./plazo";

export const DIAS_REPETIDA = 14;

export type PorDato = "rut" | "correo" | "telefono";

/** Últimas 9 cifras: «+56 9 8765 4321», «(9) 8765-4321» y «987654321» son el mismo número. */
export const cifrasTelefono = (t: string) => t.replace(/\D/g, "").slice(-9);

/** RUT válidos (normalizados), correos y teléfonos del texto, sin repetir. */
export function identificadores(texto: string) {
  const ruts = new Set<string>(), correos = new Set<string>(), telefonos = new Set<string>();
  for (const { tipo, valor } of encontrarDatosPersonales(texto)) {
    if (tipo === "rut" && rutValido(valor)) ruts.add(normalizarRut(valor)!);
    if (tipo === "correo" && valor.includes("@")) correos.add(valor.toLowerCase());
    if (tipo === "telefono" && cifrasTelefono(valor).length === 9) telefonos.add(cifrasTelefono(valor));
  }
  return { ruts: [...ruts], correos: [...correos], telefonos: [...telefonos] };
}

export type ClienteDetectado =
  | { por: PorDato; clientes: { id: string; nombre: string }[]; rutNuevo?: undefined }
  | { por: "rut"; clientes: []; rutNuevo: string };

/** El dato más fiable gana: RUT, luego correo, luego teléfono. Varios clientes = el usuario elige. */
export async function detectarCliente(tx: Tx, texto: string): Promise<ClienteDetectado | null> {
  const { ruts, correos, telefonos } = identificadores(texto);
  const consultas: [PorDato, unknown][] = [
    ["rut", ruts.length ? inArray(cliente.rut, ruts) : null],
    ["correo", correos.length ? inArray(sql`lower(${cliente.email})`, correos) : null],
    ["telefono", telefonos.length ? inArray(sql`right(regexp_replace(${cliente.telefono}, '\\D', '', 'g'), 9)`, telefonos) : null],
  ];
  for (const [por, condicion] of consultas) {
    if (!condicion) continue;
    const clientes = await tx.select({ id: cliente.id, nombre: cliente.nombre }).from(cliente).where(condicion as never).orderBy(cliente.nombre).limit(5);
    if (clientes.length) return { por, clientes };
  }
  return ruts.length === 1 ? { por: "rut", clientes: [], rutNuevo: ruts[0] } : null;
}

export interface Repetida { id: string; numero: number; estado: string; creadoEn: Date; motivo: "mismo_texto" | "mismo_cliente" }

/**
 * Borradores y aprobadas de los últimos 14 días con el mismo texto, o del mismo cliente con algún artículo en común.
 * Solo números y estados: el nombre del cliente no aparece aquí.
 */
export async function buscarRepetidas(tx: Tx, c: { id: string; clienteId: string | null; textoOriginal: string | null; creadoEn: Date }): Promise<Repetida[]> {
  const texto = c.textoOriginal ? c.textoOriginal.replace(/\s+/g, " ").trim().toLowerCase() : null;
  const articulos = c.clienteId
    ? (await tx.selectDistinct({ a: cotizacionItem.articuloId }).from(cotizacionItem).where(eq(cotizacionItem.cotizacionId, c.id))).flatMap((x) => (x.a ? [x.a] : []))
    : [];
  const mismoTexto = texto ? sql`lower(regexp_replace(trim(${cotizacion.textoOriginal}), '\\s+', ' ', 'g')) = ${texto}` : null;
  const mismoCliente = c.clienteId && articulos.length
    ? and(eq(cotizacion.clienteId, c.clienteId), sql`exists (select 1 from cotizacion_item i where i.cotizacion_id = ${cotizacion.id} and i.articulo_id in (${sql.join(articulos.map((a) => sql`${a}`), sql`, `)}))`)
    : null;
  if (!mismoTexto && !mismoCliente) return [];
  const filas = await tx.select({ id: cotizacion.id, numero: cotizacion.numero, estado: cotizacion.estado, creadoEn: cotizacion.creadoEn, igual: mismoTexto ?? sql<boolean>`false` })
    .from(cotizacion)
    .where(and(
      ne(cotizacion.id, c.id),
      inArray(cotizacion.estado, ["interpretando", "borrador", "ia_fallida", "aprobada"]),
      gt(cotizacion.creadoEn, sql`${c.creadoEn.toISOString()}::timestamptz - make_interval(days => ${DIAS_REPETIDA})`),
      or(...[mismoTexto, mismoCliente].filter((x) => x !== null)),
    ))
    .orderBy(desc(cotizacion.creadoEn)).limit(3);
  return filas.map(({ igual, ...f }) => ({ ...f, motivo: igual ? "mismo_texto" : "mismo_cliente" }));
}

/** Las tres sugerencias juntas; la de cliente solo con `clientes.ver` y mientras no haya uno asignado. */
export async function pistasBorrador(tx: Tx, c: { id: string; clienteId: string | null; textoOriginal: string | null; creadoEn: Date }, verCliente: boolean) {
  const texto = c.textoOriginal ?? "";
  return {
    cliente: verCliente && !c.clienteId && texto ? await detectarCliente(tx, texto) : null,
    repetidas: await buscarRepetidas(tx, c),
    plazo: texto ? leerPlazo(texto, hoySantiago(c.creadoEn)) : null,
  };
}
