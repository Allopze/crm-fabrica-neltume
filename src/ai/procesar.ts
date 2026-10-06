// Procesa un trabajo de la cola (ADR-0006; DESIGN §3 pasos 3–10; AI.md §5).
import { and, eq, lt, sql } from "drizzle-orm";
import { bd } from "@/db/conexion";
import { cotizacion, cotizacionItem, llamadaIa, trabajoIa } from "@/db/esquema/comercial";
import { registrarAuditoria } from "@/domain/auditoria";
import { listaVigenteId, precioDeArticulo, recalcularTotales } from "@/domain/cotizaciones/calculo";
import { cargarCatalogoMapeo, catalogoResumido } from "@/domain/cotizaciones/catalogo";
import { mapearItem } from "@/domain/cotizaciones/mapear";
import { alertasGasto, gastoIa } from "@/domain/metricas-ia";
import { calcularLinea } from "@/domain/precios/calcular";
import { registro } from "@/lib/registro";
import { ErrorIA, type InterpreteIA } from "./interfaz";
import { normalizarPedido, redactar } from "./redaccion";
import { interpretarConReintentos } from "./reintentos";

export const MAX_INTENTOS_TRABAJO = 3;
const WORKER = { tipo: "worker" as const };

/** Devuelve a la cola los trabajos colgados más de 60 s; los que agotaron intentos quedan fallidos. */
async function recuperarColgados() {
  await bd().update(trabajoIa).set({ estado: "pendiente" })
    .where(and(eq(trabajoIa.estado, "en_curso"), lt(trabajoIa.tomadoEn, sql`now() - interval '60 seconds'`), lt(trabajoIa.intentos, MAX_INTENTOS_TRABAJO)));
}

async function tomarTrabajo() {
  return bd().transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: string; cotizacion_id: string }>(sql`
      SELECT id, cotizacion_id FROM trabajo_ia WHERE estado = 'pendiente' ORDER BY creado_en FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!rows[0]) return null;
    await tx.update(trabajoIa).set({ estado: "en_curso", intentos: sql`${trabajoIa.intentos} + 1`, tomadoEn: sql`now()` }).where(eq(trabajoIa.id, rows[0].id));
    return { id: rows[0].id, cotizacionId: rows[0].cotizacion_id };
  });
}

async function gastoDeHoyUsd(): Promise<number> {
  const { rows } = await bd().execute<{ total: string }>(sql`
    SELECT coalesce(sum(costo_usd), 0) AS total FROM llamada_ia
    WHERE (creado_en AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date`);
  return Number(rows[0].total);
}

async function fallar(trabajoId: string, cotizacionId: string, motivo: string) {
  await bd().transaction(async (tx) => {
    await tx.update(trabajoIa).set({ estado: "fallido", error: motivo.slice(0, 500) }).where(eq(trabajoIa.id, trabajoId));
    await tx.update(cotizacion).set({ estado: "ia_fallida", actualizadoEn: sql`now()` }).where(and(eq(cotizacion.id, cotizacionId), eq(cotizacion.estado, "interpretando")));
    await registrarAuditoria(tx, { actor: WORKER, accion: "interpretar", recurso: "cotizacion", recursoId: cotizacionId, despues: { motivo }, resultado: "error", origen: "worker" });
  });
}

/** Procesa el siguiente trabajo pendiente. "vacio" si no hay nada que hacer. */
export async function procesarSiguiente(ia: InterpreteIA, opciones: { esperasMs?: number[] } = {}): Promise<"vacio" | "listo" | "fallido"> {
  await recuperarColgados();
  const t = await tomarTrabajo();
  if (!t) return "vacio";
  const [c] = await bd().select().from(cotizacion).where(eq(cotizacion.id, t.cotizacionId));

  const tope = Number(process.env.LLM_TOPE_DIARIO_USD || 0);
  if (tope > 0 && (await gastoDeHoyUsd()) >= tope) {
    await bd().insert(llamadaIa).values({ trabajoId: t.id, proveedor: ia.nombre, entradaRedactada: "", resultado: "tope" });
    await fallar(t.id, t.cotizacionId, "Se alcanzó el tope diario de gasto en IA");
    return "fallido";
  }

  const texto = redactar(normalizarPedido(c.textoOriginal ?? "")).texto;
  try {
    const cat = await catalogoResumido(bd());
    const resultado = await interpretarConReintentos(ia, texto, cat, {
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
      const catalogo = await cargarCatalogoMapeo(tx);
      const listaId = await listaVigenteId(tx);
      for (const [orden, propuesto] of resultado.propuesta.items.entries()) {
        const m = mapearItem(propuesto, catalogo);
        const p = m.articuloId ? await precioDeArticulo(tx, m.articuloId, listaId) : null;
        const ref = m.referencia ? await precioDeArticulo(tx, m.referencia.articuloId, listaId) : null;
        await tx.insert(cotizacionItem).values({
          cotizacionId: c.id, orden: orden + 1, articuloId: m.articuloId, descripcion: m.descripcion, cantidad: m.cantidad, estadoItem: m.estado,
          duda: m.duda, textoFuente: m.textoFuente, precioNetoLista: p?.precioNetoLista, recargoPct: p?.recargoPct,
          precioUnitario: p?.precioUnitario, totalLinea: p ? calcularLinea({ precioNetoLista: p.precioNetoLista, recargoPct: p.recargoPct, cantidad: m.cantidad }).totalLinea : null,
          precioReferencia: ref?.precioUnitario, referenciaCodigo: m.referencia?.codigo,
        });
      }
      await tx.update(cotizacion).set({ estado: "borrador", interpretacionIa: resultado.propuesta, alertas: resultado.propuesta.alertas, listaId }).where(eq(cotizacion.id, c.id));
      await recalcularTotales(tx, c.id);
      await tx.update(trabajoIa).set({ estado: "listo" }).where(eq(trabajoIa.id, t.id));
      await registrarAuditoria(tx, {
        actor: WORKER, accion: "interpretar", recurso: "cotizacion", recursoId: c.id, resultado: "ok", origen: "worker",
        despues: { items: resultado.propuesta.items.length, alertas: resultado.propuesta.alertas.length, proveedor: resultado.proveedor, modelo: resultado.modelo, latenciaMs: resultado.latenciaMs, costoUsd: resultado.costoUsd },
      });
    });
    // SECURITY T4: aviso al 80 % del tope diario y del presupuesto mensual (también en /administracion/metricas).
    const g = await gastoIa(bd());
    for (const a of alertasGasto(g.diaUsd, g.mesUsd)) registro.warn(a, { diaUsd: g.diaUsd, mesUsd: g.mesUsd });
    return "listo";
  } catch (e) {
    const motivo = e instanceof ErrorIA ? `${e.tipo}: ${e.message}` : (e as Error).message;
    registro.warn("interpretación fallida", { cotizacion: c.numero, motivo });
    await fallar(t.id, t.cotizacionId, motivo);
    return "fallido";
  }
}
