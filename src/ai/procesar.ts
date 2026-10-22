// Procesa un trabajo de la cola (ADR-0006; DESIGN §3 pasos 3–10; AI.md §5).
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { bd, type Tx } from "@/db/conexion";
import { cotizacion, cotizacionItem, llamadaIa, trabajoIa } from "@/db/esquema/comercial";
import { registrarAuditoria } from "@/domain/auditoria";
import { listaVigenteId, precioDeArticulo, recalcularTotales } from "@/domain/cotizaciones/calculo";
import { cargarCatalogoMapeo, catalogoResumido } from "@/domain/cotizaciones/catalogo";
import { alertaNotaIa, mapearConDudasIa } from "@/domain/cotizaciones/mapear";
import { alertasGasto, gastoIa } from "@/domain/metricas-ia";
import { calcularLinea } from "@/domain/precios/calcular";
import { registro } from "@/lib/registro";
import { ErrorIA, type InterpreteIA } from "./interfaz";
import { crearInterpreteDesdeAjustes } from "./index";
import { leerConfiguracionPrivada } from "./ajustes";
import { normalizarPedido, redactar } from "./redaccion";
import { interpretarRevisado } from "./revision";

export const MAX_INTENTOS_TRABAJO = 3;
const WORKER = { tipo: "worker" as const };
/**
 * Segundos sin terminar tras los que un trabajo `en_curso` se da por colgado (worker caído). Debe superar el peor caso
 * de una interpretación (reintentos con espera, Retry-After de hasta 30 s y la segunda pasada): por defecto 180 s.
 */
const umbralColgadoS = () => Number(process.env.IA_TRABAJO_COLGADO_S || 180);
/** Tope diario de llamadas al LLM: limita el gasto también si el proveedor no informa costo (auditoría H-12). */
const topeDiarioLlamadas = () => Number(process.env.LLM_TOPE_DIARIO_LLAMADAS || 300);

/** Un trabajo que otro proceso retomó o que ya no está en curso: su resultado se descarta (auditoría H-09). */
class TrabajoAjeno extends Error {}

interface TrabajoTomado { id: string; cotizacionId: string; intentos: number }

/**
 * Trabajos colgados (ADR-0006): vuelven a la cola si les quedan intentos; si los agotaron, el trabajo queda fallido y
 * la cotización en «IA no disponible», con el texto conservado para cotizar a mano (REQ-COT-2.7, auditoría H-10).
 */
async function recuperarColgados() {
  const colgado = and(eq(trabajoIa.estado, "en_curso"), lt(trabajoIa.tomadoEn, sql`now() - make_interval(secs => ${umbralColgadoS()})`));
  await bd().update(trabajoIa).set({ estado: "pendiente" }).where(and(colgado, lt(trabajoIa.intentos, MAX_INTENTOS_TRABAJO)));
  const agotados = await bd().select({ id: trabajoIa.id, cotizacionId: trabajoIa.cotizacionId, intentos: trabajoIa.intentos }).from(trabajoIa)
    .where(and(colgado, gte(trabajoIa.intentos, MAX_INTENTOS_TRABAJO)));
  for (const t of agotados) await fallar(t, `El worker no terminó la interpretación tras ${t.intentos} intentos`);
}

async function tomarTrabajo(tomarConfig: boolean) {
  return bd().transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: string; cotizacion_id: string }>(sql`
      SELECT id, cotizacion_id FROM trabajo_ia WHERE estado = 'pendiente' ORDER BY creado_en FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!rows[0]) return null;
    const [t] = await tx.update(trabajoIa).set({ estado: "en_curso", intentos: sql`${trabajoIa.intentos} + 1`, tomadoEn: sql`now()` })
      .where(eq(trabajoIa.id, rows[0].id)).returning({ intentos: trabajoIa.intentos });
    const configIA = tomarConfig ? await leerConfiguracionPrivada(tx) : undefined;
    return { id: rows[0].id, cotizacionId: rows[0].cotizacion_id, intentos: t.intentos, configIA };
  });
}

/** Marca el trabajo terminado solo si sigue siendo de este intento; si otro proceso lo retomó, lanza TrabajoAjeno. */
async function cerrarTrabajo(tx: Tx, t: TrabajoTomado, cambios: Partial<typeof trabajoIa.$inferInsert>) {
  const filas = await tx.update(trabajoIa).set(cambios)
    .where(and(eq(trabajoIa.id, t.id), eq(trabajoIa.estado, "en_curso"), eq(trabajoIa.intentos, t.intentos))).returning({ id: trabajoIa.id });
  if (!filas.length) throw new TrabajoAjeno(`El trabajo ${t.id} ya no es de este intento`);
}

async function gastoDeHoyUsd(): Promise<number> {
  const { rows } = await bd().execute<{ total: string }>(sql`
    SELECT coalesce(sum(costo_usd), 0) AS total FROM llamada_ia
    WHERE (creado_en AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date`);
  return Number(rows[0].total);
}

async function llamadasDeHoy(): Promise<number> {
  const { rows } = await bd().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM llamada_ia
    WHERE resultado <> 'tope' AND (creado_en AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date`);
  return Number(rows[0].n);
}

/** Falla el trabajo (si sigue siendo de este intento) y deja la cotización en «IA no disponible». */
async function fallar(t: TrabajoTomado, motivo: string) {
  try {
    await bd().transaction(async (tx) => {
      await cerrarTrabajo(tx, t, { estado: "fallido", error: motivo.slice(0, 500) });
      await tx.update(cotizacion).set({ estado: "ia_fallida", actualizadoEn: sql`now()` }).where(and(eq(cotizacion.id, t.cotizacionId), eq(cotizacion.estado, "interpretando")));
      await registrarAuditoria(tx, { actor: WORKER, accion: "interpretar", recurso: "cotizacion", recursoId: t.cotizacionId, despues: { motivo }, resultado: "error", origen: "worker" });
    });
  } catch (e) {
    if (!(e instanceof TrabajoAjeno)) throw e;
  }
}

/** Procesa el siguiente trabajo pendiente. "vacio" si no hay nada que hacer. */
export async function procesarSiguiente(iaFija?: InterpreteIA, opciones: { esperasMs?: number[] } = {}): Promise<"vacio" | "listo" | "fallido" | "descartado"> {
  await recuperarColgados();
  const t = await tomarTrabajo(!iaFija);
  if (!t) return "vacio";
  const [c] = await bd().select().from(cotizacion).where(eq(cotizacion.id, t.cotizacionId));

  try {
    // Se resuelve tras tomar el trabajo: esta instantánea no cambia si Ajustes se edita durante la petición.
    const ia = iaFija ?? await crearInterpreteDesdeAjustes(t.configIA);
    const tope = Number(process.env.LLM_TOPE_DIARIO_USD || 0);
    if (tope > 0 && (await gastoDeHoyUsd()) >= tope) {
      await bd().insert(llamadaIa).values({ trabajoId: t.id, proveedor: ia.nombre, entradaRedactada: "", resultado: "tope" });
      await fallar(t, "Se alcanzó el tope diario de gasto en IA");
      return "fallido";
    }
    if ((await llamadasDeHoy()) >= topeDiarioLlamadas()) {
      await bd().insert(llamadaIa).values({ trabajoId: t.id, proveedor: ia.nombre, entradaRedactada: "", resultado: "tope" });
      await fallar(t, "Se alcanzó el tope diario de llamadas a la IA");
      return "fallido";
    }
    const texto = redactar(normalizarPedido(c.textoOriginal ?? "")).texto;
    const cat = await catalogoResumido(bd());
    // REQ-COT-2.14/2.15: propuesta anclada al texto y, si omitió partes del pedido, una corrección pedida a la IA.
    const { resultado, anclada, dudasIa, corregida } = await interpretarRevisado(ia, texto, cat, { modelos: cat.modelos, alias: cat.alias ?? [] }, {
      esperasMs: opciones.esperasMs,
      alIntentar: async (i) => {
        await bd().insert(llamadaIa).values({
          trabajoId: t.id, proveedor: ia.nombre, modelo: i.resultado?.modelo, entradaRedactada: texto, salida: i.resultado?.propuesta ?? { error: i.error?.message },
          tokensEntrada: i.resultado?.tokensEntrada, tokensSalida: i.resultado?.tokensSalida, costoUsd: i.resultado?.costoUsd, latenciaMs: i.latenciaMs,
          resultado: i.resultado ? "ok" : i.error?.tipo === "timeout" ? "timeout" : i.error?.tipo === "invalida" ? "invalida" : "error",
        });
      },
    });

    await bd().transaction(async (tx) => {
      // Solo escribe quien sigue siendo dueño del trabajo y si la cotización sigue interpretándose (auditoría H-09).
      await cerrarTrabajo(tx, t, { estado: "listo" });
      const vigente = await tx.update(cotizacion).set({ estado: "borrador" })
        .where(and(eq(cotizacion.id, c.id), eq(cotizacion.estado, "interpretando"))).returning({ id: cotizacion.id });
      if (!vigente.length) throw new TrabajoAjeno(`La cotización ${c.numero} ya no está interpretándose`);
      const catalogo = await cargarCatalogoMapeo(tx);
      const listaId = await listaVigenteId(tx);
      const notas: string[] = [];
      for (const [orden, propuesto] of anclada.items.entries()) {
        // ADR-0013 B: las dudas de la IA bloquean solo si el ítem no se puede verificar; si no, quedan como nota.
        const { item: m, nota } = mapearConDudasIa(propuesto, dudasIa[orden] ?? [], catalogo);
        if (nota) notas.push(alertaNotaIa(orden + 1, nota));
        const p = m.articuloId ? await precioDeArticulo(tx, m.articuloId, listaId) : null;
        const ref = m.referencia ? await precioDeArticulo(tx, m.referencia.articuloId, listaId) : null;
        await tx.insert(cotizacionItem).values({
          cotizacionId: c.id, orden: orden + 1, articuloId: m.articuloId, descripcion: m.descripcion, cantidad: m.cantidad, estadoItem: m.estado,
          duda: m.duda, textoFuente: m.textoFuente, medidaSolicitada: m.medidaSolicitada, precioNetoLista: p?.precioNetoLista, recargoPct: p?.recargoPct,
          precioUnitario: p?.precioUnitario, totalLinea: p ? calcularLinea({ precioNetoLista: p.precioNetoLista, recargoPct: p.recargoPct, cantidad: m.cantidad }).totalLinea : null,
          precioReferencia: ref?.precioUnitario, referenciaCodigo: m.referencia?.codigo,
        });
      }
      await tx.update(cotizacion).set({ interpretacionIa: resultado.propuesta, alertas: [...anclada.alertas, ...notas], listaId }).where(eq(cotizacion.id, c.id));
      await recalcularTotales(tx, c.id);
      await registrarAuditoria(tx, {
        actor: WORKER, accion: "interpretar", recurso: "cotizacion", recursoId: c.id, resultado: "ok", origen: "worker",
        despues: { items: resultado.propuesta.items.length, corregida, alertas: resultado.propuesta.alertas.length, proveedor: resultado.proveedor, modelo: resultado.modelo, latenciaMs: resultado.latenciaMs, costoUsd: resultado.costoUsd },
      });
    });
    // SECURITY T4: aviso al 80 % del tope diario y del presupuesto mensual (también en /administracion/metricas).
    const g = await gastoIa(bd());
    for (const a of alertasGasto(g.diaUsd, g.mesUsd)) registro.warn(a, { diaUsd: g.diaUsd, mesUsd: g.mesUsd });
    return "listo";
  } catch (e) {
    if (e instanceof TrabajoAjeno) {
      registro.warn("resultado de IA descartado: otro intento tomó el trabajo", { cotizacion: c.numero, trabajo: t.id });
      return "descartado";
    }
    const motivo = e instanceof ErrorIA ? `${e.tipo}: ${e.message}` : (e as Error).message;
    registro.warn("interpretación fallida", { cotizacion: c.numero, motivo });
    await fallar(t, motivo);
    return "fallido";
  }
}
