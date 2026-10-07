// Carga del inventario de la fábrica (REQ-STK-9, 10; ADR-0018) en la transacción dada. Idempotente: no repite
// puertas (por código) ni filas del historial (por huella). El informe y la auditoría no llevan precios ni clientes.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { alto, articulo, madera, modelo, rangoAncho } from "@/db/esquema/catalogo";
import { despachoHistorico, puerta } from "@/db/esquema/inventario";
import { type Actor, type Origen, registrarAuditoria } from "../auditoria";
import { ErrorDominio } from "../errores";
import { codigoDeNombre, codigoFueraCatalogo } from "../puertas/normalizar";
import { type NuevoMovimiento, registrarMovimientos } from "../stock";
import { normalizar } from "./mapear";
import { type CatalogoInventario, type FilaDespacho, type FilaInventario, mapearDespachos, mapearPuertas, type PuertaInventario, resolverArticulo } from "./inventario-mapeo";

export interface InformeInventario {
  puertas: { leidas: number; cargadas: number; yaExistian: number; catalogo: number; fueraCatalogo: number; apartadas: number; codigosNuevos: number; segunda: number };
  fueraPorMotivo: Record<string, number>;
  porUbicacion: Record<string, number>;
  creados: { modelos: string[]; maderas: string[]; articulos: number };
  historico: { leidas: number; cargadas: number; yaExistian: number; dudosas: number; porEstado: Record<string, number> };
  rechazos: { fila: number; motivo: string }[];
  dudas: { hoja: "Inventario" | "Despachos"; fila: number; detalle: string }[];
}

const contar = (r: Record<string, number>, k: string) => { r[k] = (r[k] ?? 0) + 1; };

async function catalogo(tx: Tx): Promise<CatalogoInventario> {
  // En serie: una transacción es una sola conexión.
  const mods = await tx.select({ nombre: modelo.nombre }).from(modelo).where(and(eq(modelo.familia, "puerta"), eq(modelo.fueraCatalogo, false)));
  const mads = await tx.select({ nombre: madera.nombre }).from(madera).where(eq(madera.fueraCatalogo, false));
  const rangos = await tx.select().from(rangoAncho);
  const altos = await tx.select().from(alto);
  const arts = await tx.select({ id: articulo.id, codigo: articulo.codigo, m: modelo.nombre, d: madera.nombre, a: articulo.anchoCodigo, h: articulo.altoCodigo }).from(articulo)
      .innerJoin(modelo, eq(modelo.id, articulo.modeloId)).innerJoin(madera, eq(madera.id, articulo.maderaId))
      .where(and(eq(articulo.activo, true), eq(articulo.fueraCatalogo, false)));
  return {
    modelos: new Set(mods.map((m) => m.nombre)), maderas: new Set(mads.map((m) => m.nombre)),
    rangos: rangos.map((r) => ({ codigo: r.codigo, minM: Number(r.minM), maxM: Number(r.maxM) })), altos: altos.map((a) => ({ codigo: a.codigo, altoM: Number(a.altoM) })),
    articulos: new Map(arts.map((a) => [`${a.m}|${a.d}|${a.a}|${a.h}`, { id: a.id, codigo: a.codigo }])),
  };
}

/** Modelos, maderas y artículos fuera de catálogo: los busca o los crea marcados (REQ-STK-8.7). */
function fabricaFueraCatalogo(tx: Tx, informe: InformeInventario) {
  const modelos = new Map<string, { id: string; codigo: string }>();
  const maderas = new Map<string, { id: string; codigo: string }>();
  async function unico(tabla: typeof modelo | typeof madera, base: string) {
    for (let i = 1; ; i++) {
      const codigo = i === 1 ? base : `${base}${i}`;
      if (!(await tx.select({ id: tabla.id }).from(tabla).where(eq(tabla.codigo, codigo))).length) return codigo;
    }
  }
  async function deModelo(nombre: string) {
    if (!modelos.has(nombre)) {
      let [m] = await tx.select({ id: modelo.id, codigo: modelo.codigo }).from(modelo).where(eq(modelo.nombre, nombre));
      if (!m) {
        [m] = await tx.insert(modelo).values({ nombre, codigo: await unico(modelo, codigoDeNombre(nombre)), familia: "puerta", fueraCatalogo: true }).returning({ id: modelo.id, codigo: modelo.codigo });
        informe.creados.modelos.push(nombre);
      }
      modelos.set(nombre, m);
    }
    return modelos.get(nombre)!;
  }
  async function deMadera(nombre: string) {
    if (!maderas.has(nombre)) {
      let [m] = await tx.select({ id: madera.id, codigo: madera.codigo }).from(madera).where(eq(madera.nombre, nombre));
      if (!m) {
        [m] = await tx.insert(madera).values({ nombre, codigo: await unico(madera, codigoDeNombre(nombre, 3)), fueraCatalogo: true }).returning({ id: madera.id, codigo: madera.codigo });
        informe.creados.maderas.push(nombre);
      }
      maderas.set(nombre, m);
    }
    return maderas.get(nombre)!;
  }
  return async (p: PuertaInventario): Promise<string> => {
    const mo = await deModelo(p.modelo);
    const ma = await deMadera(p.madera);
    const codigo = codigoFueraCatalogo(mo.codigo, ma.codigo, p.anchoMm, p.altoMm);
    const [existente] = await tx.select({ id: articulo.id }).from(articulo).where(eq(articulo.codigo, codigo));
    if (existente) return existente.id;
    const [a] = await tx.insert(articulo).values({
      codigo, modeloId: mo.id, maderaId: ma.id, anchoCodigo: String(p.anchoMm), anchoEtiqueta: String(p.anchoMm / 1000).replace(".", ","),
      altoCodigo: String(p.altoMm), altoM: Math.round(p.altoMm / 10) / 100, fueraCatalogo: true,
    }).returning({ id: articulo.id });
    informe.creados.articulos++;
    return a.id;
  };
}

export async function cargarInventario(
  tx: Tx, libro: { inventario: FilaInventario[]; despachos: FilaDespacho[] }, actor: Actor & { id: string }, origen: Origen,
  opciones: { agregar?: boolean; hoy: string },
): Promise<InformeInventario> {
  const ajenas = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM puerta p JOIN v_puerta v ON v.puerta_id = p.id
    WHERE v.existencia = 1 AND p.origen <> 'inventario_inicial'`);
  if (ajenas.rows[0].n > 0 && !opciones.agregar) {
    throw new ErrorDominio("VALIDACION", `Ya hay ${ajenas.rows[0].n} puertas en stock que no vienen de la planilla. Revisa el stock o usa --agregar.`);
  }
  const informe: InformeInventario = {
    puertas: { leidas: libro.inventario.length, cargadas: 0, yaExistian: 0, catalogo: 0, fueraCatalogo: 0, apartadas: 0, codigosNuevos: 0, segunda: 0 },
    fueraPorMotivo: {}, porUbicacion: {}, creados: { modelos: [], maderas: [], articulos: 0 },
    historico: { leidas: libro.despachos.length, cargadas: 0, yaExistian: 0, dudosas: 0, porEstado: {} }, rechazos: [], dudas: [],
  };

  const { puertas, rechazos } = mapearPuertas(libro.inventario, opciones.hoy);
  informe.rechazos = rechazos;
  const conCodigo = puertas.flatMap((p) => (p.codigo ? [p.codigo] : []));
  const existentes = new Set(conCodigo.length ? (await tx.select({ c: puerta.codigo }).from(puerta).where(inArray(puerta.codigo, conCodigo))).map((r) => r.c) : []);
  // Una fila sin código propio no se puede reconocer en una recarga: solo entra en la primera carga (REQ-STK-9.3).
  const recarga = (await tx.select({ id: puerta.id }).from(puerta).where(eq(puerta.origen, "inventario_inicial")).limit(1)).length > 0;
  const cat = await catalogo(tx);
  const fueraCatalogo = fabricaFueraCatalogo(tx, informe);

  const nuevas: { p: PuertaInventario; mov: NuevoMovimiento }[] = [];
  for (const p of puertas) {
    if (p.codigo && existentes.has(p.codigo)) { informe.puertas.yaExistian++; continue; }
    if (!p.codigo && recarga) { informe.rechazos.push({ fila: p.fila, motivo: "Sin código propio: en una recarga no se sabe si ya entró; regístrala a mano si falta" }); continue; }
    for (const d of p.dudas) informe.dudas.push({ hoja: "Inventario", fila: p.fila, detalle: d });
    const destino = resolverArticulo(p, cat);
    const articuloId = destino.tipo === "catalogo" ? destino.articuloId : await fueraCatalogo(p);
    if (destino.tipo === "catalogo") informe.puertas.catalogo++;
    else { informe.puertas.fueraCatalogo++; contar(informe.fueraPorMotivo, destino.motivo); }
    if (p.calidad === "segunda") informe.puertas.segunda++;
    if (!p.codigo) informe.puertas.codigosNuevos++;
    contar(informe.porUbicacion, p.ubicacion);
    nuevas.push({ p, mov: {
      articuloId, tipo: "ajuste", cantidad: 1, motivo: "Inventario inicial", refTipo: "inventario", puertas: p.codigo ? [p.codigo] : undefined,
      datosPuerta: { ubicacion: p.ubicacion, calidad: p.calidad, observacion: p.observacion, fechaProduccion: p.fechaProduccion, anchoMm: p.anchoMm, altoMm: p.altoMm, origen: "inventario_inicial" },
    } });
  }
  const insertados = nuevas.length ? await registrarMovimientos(tx, nuevas.map((n) => n.mov), actor, origen, undefined, { auditar: false }) : [];
  informe.puertas.cargadas = insertados.length;
  const apartados: NuevoMovimiento[] = nuevas.flatMap((n, i) => (n.p.apartadaPara
    ? [{ articuloId: n.mov.articuloId, tipo: "reserva" as const, cantidad: 1, puertas: [insertados[i].puertaCodigo!], motivo: `Apartada para ${n.p.apartadaPara}`, refTipo: "puerta", refId: insertados[i].puertaCodigo! }]
    : []));
  if (apartados.length) await registrarMovimientos(tx, apartados, actor, origen, undefined, { auditar: false });
  informe.puertas.apartadas = apartados.length;

  const historico = mapearDespachos(libro.despachos, opciones.hoy);
  const huellas = new Set<string>();
  for (let i = 0; i < historico.length; i += 1000) {
    const lote = historico.slice(i, i + 1000).map((h) => h.huella);
    for (const r of await tx.select({ h: despachoHistorico.huella }).from(despachoHistorico).where(inArray(despachoHistorico.huella, lote))) huellas.add(r.h);
  }
  const porCargar = historico.filter((h) => !huellas.has(h.huella));
  for (let i = 0; i < porCargar.length; i += 500) await tx.insert(despachoHistorico).values(porCargar.slice(i, i + 500));
  informe.historico.cargadas = porCargar.length;
  informe.historico.yaExistian = historico.length - porCargar.length;
  for (const h of porCargar) {
    contar(informe.historico.porEstado, normalizar(h.estado) || "(sin estado)");
    if (h.dudas.length) informe.historico.dudosas++;
  }

  await registrarAuditoria(tx, {
    actor, accion: "cargar inventario", recurso: "puerta", resultado: "ok", origen,
    despues: { puertas: informe.puertas, creados: { ...informe.creados }, historico: { cargadas: informe.historico.cargadas, dudosas: informe.historico.dudosas },
      filasRechazadas: informe.rechazos.map((r) => r.fila), filasDudosas: informe.dudas.map((d) => d.fila) },
  });
  return informe;
}
