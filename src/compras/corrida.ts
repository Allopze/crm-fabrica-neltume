// Corrida de la sincronización de compras (ADR-0021, REQ-MP-7.1–7.7). Corre con el rol `neltume_compras`: lee
// proveedores, mapeos y materias primas, e inserta compras, líneas y recepciones. Cada factura va en su propia
// transacción: si una falla, las demás siguen y la fallida se reintenta en la próxima corrida.
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Bd } from "@/db/conexion";
import { parametro } from "@/db/esquema/catalogo";
import { compra, compraLinea, mapeoItemCompra, proveedorCompra, sincronizacionChipax, TIPOS_COMPRA } from "@/db/esquema/compras";
import { materiaPrima } from "@/db/esquema/produccion";
import { registrarAuditoria } from "@/domain/auditoria";
import { recibirLinea } from "@/domain/compras/lineas";
import { claveItem, decidirLinea, type MapeoLinea } from "@/domain/compras/mapeo";
import { hoySantiago } from "@/domain/precios/dias-habiles";
import { normalizarRut } from "@/domain/rut";
import { registro } from "@/lib/registro";
import { type ClienteChipax, type CompraChipax, ErrorChipax } from "./chipax";
import { decodificarXml, ErrorDte, leerDte } from "./dte";

const ORIGEN = "importacion" as const;

export interface Conteos {
  leidas: number; nuevas: number; lineasRecibidas: number; porAsociar: number; porRevisar: number; ignoradas: number;
  xmlPendientes: number; avisos: number; errores: number;
}
const vacio = (): Conteos => ({ leidas: 0, nuevas: 0, lineasRecibidas: 0, porAsociar: 0, porRevisar: 0, ignoradas: 0, xmlPendientes: 0, avisos: 0, errores: 0 });

const restarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);

async function numeroParametro(db: Bd, clave: string, defecto: number) {
  const [p] = await db.select({ valor: parametro.valor }).from(parametro).where(eq(parametro.clave, clave));
  const n = Number(p?.valor ?? defecto);
  return Number.isFinite(n) && n > 0 ? n : defecto;
}

/**
 * Toma la próxima corrida: una petición de «Sincronizar ahora» o, si pasó el intervalo desde la última, una
 * programada. Las que quedaron sin terminar hace más de 30 min se cierran como interrumpidas.
 */
export async function tomarCorrida(db: Bd): Promise<string | null> {
  const intervalo = Math.round(await numeroParametro(db, "chipax_intervalo_min", 30));
  return db.transaction(async (tx) => {
    await tx.update(sincronizacionChipax).set({ fin: sql`now()`, resultado: "error", error: "Corrida interrumpida (el servicio se detuvo)." })
      .where(sql`${sincronizacionChipax.fin} IS NULL AND ${sincronizacionChipax.inicio} < now() - interval '30 minutes'`);
    const [pedida] = await tx.select({ id: sincronizacionChipax.id }).from(sincronizacionChipax).where(sql`${sincronizacionChipax.inicio} IS NULL`)
      .orderBy(asc(sincronizacionChipax.solicitadaEn)).limit(1).for("update", { skipLocked: true });
    if (pedida) {
      await tx.update(sincronizacionChipax).set({ inicio: sql`now()` }).where(eq(sincronizacionChipax.id, pedida.id));
      return pedida.id;
    }
    const [ultima] = await tx.select({ vencida: sql<boolean>`${sincronizacionChipax.inicio} < now() - make_interval(mins => ${intervalo})` })
      .from(sincronizacionChipax).where(sql`${sincronizacionChipax.inicio} IS NOT NULL`).orderBy(desc(sincronizacionChipax.inicio)).limit(1);
    if (ultima && !ultima.vencida) return null;
    const [nueva] = await tx.insert(sincronizacionChipax).values({ inicio: sql`now()` }).returning({ id: sincronizacionChipax.id });
    return nueva.id;
  });
}

type Proveedor = { rut: string; habilitadoDesde: string; habilitadoPor: string };

/** Ejecuta la corrida `id` y deja su resultado y conteos (sin datos de las facturas). */
export async function ejecutarCorrida(db: Bd, cliente: ClienteChipax, id: string, hoy = hoySantiago()): Promise<Conteos> {
  const conteos = vacio();
  let error: string | null = null;
  try {
    const proveedores = new Map((await db.select({ rut: proveedorCompra.rut, habilitadoDesde: proveedorCompra.habilitadoDesde, habilitadoPor: proveedorCompra.habilitadoPor })
      .from(proveedorCompra).where(eq(proveedorCompra.activo, true))).map((p) => [p.rut, p as Proveedor]));
    if (proveedores.size) {
      const ventana = await numeroParametro(db, "chipax_ventana_dias", 45);
      const masAntigua = [...proveedores.values()].map((p) => p.habilitadoDesde).sort()[0];
      const desde = [restarDias(hoy, ventana), masAntigua].sort().at(-1)!;
      for await (const c of cliente.compras(desde, hoy)) {
        conteos.leidas++;
        try {
          await procesarCompra(db, cliente, c, proveedores, conteos);
        } catch (e) {
          conteos.errores++;
          registro.warn("compra de Chipax no procesada", { tipo: c.tipo, folio: c.folio, error: e instanceof ErrorChipax || e instanceof ErrorDte ? e.message : (e as Error).name });
        }
      }
    }
  } catch (e) {
    error = e instanceof ErrorChipax ? e.message : "Error inesperado en la sincronización.";
    registro.error("sincronización de Chipax fallida", { error: e instanceof ErrorChipax ? e.message : (e as Error).message });
  }
  const resultado = error ? (conteos.leidas ? "parcial" : "error") : conteos.errores ? "parcial" : "ok";
  await db.transaction(async (tx) => {
    await tx.update(sincronizacionChipax).set({ fin: sql`now()`, resultado, conteos, error }).where(eq(sincronizacionChipax.id, id));
    await registrarAuditoria(tx, { actor: { tipo: "sistema" }, accion: "sincronizar chipax", recurso: "sincronizacion_chipax", recursoId: id,
      resultado: error ? "error" : "ok", origen: ORIGEN, despues: { ...conteos, resultado, ...(error ? { error } : {}) } });
  });
  return conteos;
}

/** Una factura: filtra, guarda la cabecera, lee el XML y decide cada línea (recibida, por asociar, por revisar, ignorada). */
async function procesarCompra(db: Bd, cliente: ClienteChipax, c: CompraChipax, proveedores: Map<string, Proveedor>, conteos: Conteos) {
  const rut = normalizarRut(c.rutEmisor);
  const prov = rut ? proveedores.get(rut) : undefined;
  const { tipo, folio, anulada } = c;
  const fecha = c.fechaEmision;
  if (!rut || !prov || !(TIPOS_COMPRA as readonly number[]).includes(tipo) || !Number.isFinite(folio) || !fecha || fecha < prov.habilitadoDesde) return;
  const rechazada = c.estado === "rechazado";
  const cabecera = { rutEmisor: rut, tipo, folio, razonSocial: c.razonSocial || rut };

  const [existente] = await db.select().from(compra).where(and(eq(compra.rutEmisor, rut), eq(compra.tipo, tipo), eq(compra.folio, folio)));
  if (existente) {
    const cambios: Partial<typeof compra.$inferInsert> = {};
    if (c.estado !== existente.estadoChipax) cambios.estadoChipax = c.estado;
    if (anulada !== existente.anulada) cambios.anulada = anulada;
    if ((anulada || rechazada) && !existente.aviso) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(compraLinea).where(and(eq(compraLinea.compraId, existente.id), eq(compraLinea.estado, "recibida")));
      if (n > 0) {
        cambios.aviso = `${rechazada ? "Rechazada" : "Anulada"} en Chipax después de recibirla: revisa y corrige con un ajuste con motivo.`;
        conteos.avisos++;
      } else if (existente.xmlPendiente) {
        cambios.aviso = `${rechazada ? "Rechazada" : "Anulada"} en Chipax antes de leer su detalle: no se recibió nada.`;
        cambios.xmlPendiente = false;
      }
    }
    if (Object.keys(cambios).length) await db.update(compra).set(cambios).where(eq(compra.id, existente.id));
    if (!existente.xmlPendiente || cambios.xmlPendiente === false) return;
  } else if (anulada || rechazada) {
    return; // Nunca se leyó: no hay nada que recibir ni que corregir.
  }

  const xml = await cliente.xml(c.urlXmlPublica);
  const compraId = existente?.id ?? (await db.insert(compra).values({ chipaxId: c.id, ...cabecera, fechaEmision: fecha, estadoChipax: c.estado, anulada })
    .onConflictDoNothing().returning({ id: compra.id }))[0]?.id;
  if (!compraId) return;
  if (!existente) conteos.nuevas++;
  if (xml.estado !== "ok") {
    conteos.xmlPendientes++; // aún no sincronizado (404) o URL vencida (410): se reintenta en la próxima corrida
    return;
  }

  let documento;
  try {
    documento = leerDte(decodificarXml(xml.bytes)).find((d) => d.tipo === tipo && d.folio === folio && normalizarRut(d.rutEmisor) === rut);
  } catch (e) {
    if (!(e instanceof ErrorDte)) throw e;
  }
  if (!documento) {
    await db.update(compra).set({ xmlPendiente: false, aviso: "El XML de Chipax no se pudo leer o no corresponde a la factura: revisa y recibe a mano.", sincronizadaEn: sql`now()` })
      .where(eq(compra.id, compraId));
    conteos.avisos++;
    return;
  }

  const actor = { tipo: "sistema" as const, id: prov.habilitadoPor };
  await db.transaction(async (tx) => {
    const mapeos = new Map((await tx.select({ clave: mapeoItemCompra.clave, materiaPrimaId: mapeoItemCompra.materiaPrimaId, factor: mapeoItemCompra.factor,
      unidadFacturada: mapeoItemCompra.unidadFacturada, ignorar: mapeoItemCompra.ignorar, materiaActiva: materiaPrima.activo })
      .from(mapeoItemCompra).leftJoin(materiaPrima, eq(materiaPrima.id, mapeoItemCompra.materiaPrimaId)).where(eq(mapeoItemCompra.proveedorRut, rut)))
      .map((m) => [m.clave, { ...m, materiaActiva: m.ignorar ? true : Boolean(m.materiaActiva) } as MapeoLinea]));
    const resumen = { recibidas: 0, porAsociar: 0, porRevisar: 0, ignoradas: 0 };
    for (const l of documento.lineas) {
      const clave = claveItem(l);
      const d = decidirLinea(tipo, { cantidad: l.cantidad, unidad: l.unidad }, mapeos.get(clave));
      const base = { compraId, nroLinea: l.nro, codigoItem: l.codigo, nombreItem: l.nombre.slice(0, 300) || "(sin nombre)", clave, cantidad: l.cantidad, unidad: l.unidad, precioUnitario: l.precioUnitario };
      if (d.estado === "recibida") {
        const movimientoId = await recibirLinea(tx, cabecera, l.nro, d, actor, ORIGEN);
        await tx.insert(compraLinea).values({ ...base, estado: "recibida", materiaPrimaId: d.materiaPrimaId, cantidadRecibida: d.cantidad, movimientoId });
        resumen.recibidas++;
      } else {
        await tx.insert(compraLinea).values({ ...base, estado: d.estado, motivoRevision: d.estado === "por_revisar" ? d.motivo : null });
        if (d.estado === "por_asociar") resumen.porAsociar++;
        else if (d.estado === "por_revisar") resumen.porRevisar++;
        else resumen.ignoradas++;
      }
    }
    await tx.update(compra).set({ xmlPendiente: false, sincronizadaEn: sql`now()` }).where(eq(compra.id, compraId));
    await registrarAuditoria(tx, { actor, accion: "leer factura chipax", recurso: "compra", recursoId: compraId, resultado: "ok", origen: ORIGEN,
      despues: { proveedor: rut, tipo, folio, ...resumen } });
    conteos.lineasRecibidas += resumen.recibidas;
    conteos.porAsociar += resumen.porAsociar;
    conteos.porRevisar += resumen.porRevisar;
    conteos.ignoradas += resumen.ignoradas;
  });
}
