// Métricas mínimas del cotizador con IA (DESIGN §5; SECURITY T4; REQ-NFR-1, 2). Ventana: últimos 30 días.
import { sql } from "drizzle-orm";
import type { Tx } from "@/db/conexion";

const UMBRAL_ALERTA = 0.8;

export function topes() {
  return { diarioUsd: Number(process.env.LLM_TOPE_DIARIO_USD || 0), mensualUsd: Number(process.env.LLM_PRESUPUESTO_MENSUAL_USD || 0) };
}

/** Alertas al 80 % del tope diario y del presupuesto mensual; vacías si no hay topes configurados. */
export function alertasGasto(diaUsd: number, mesUsd: number, t = topes()) {
  const alertas: string[] = [];
  if (t.diarioUsd > 0 && diaUsd >= UMBRAL_ALERTA * t.diarioUsd) {
    alertas.push(diaUsd >= t.diarioUsd ? "Se alcanzó el tope diario de IA: las interpretaciones nuevas quedan para cotizar a mano." : `El gasto de IA de hoy va en ${Math.round((diaUsd / t.diarioUsd) * 100)} % del tope diario.`);
  }
  if (t.mensualUsd > 0 && mesUsd >= UMBRAL_ALERTA * t.mensualUsd) alertas.push(`El gasto de IA del mes va en ${Math.round((mesUsd / t.mensualUsd) * 100)} % del presupuesto mensual.`);
  return alertas;
}

const hoy = sql`(now() AT TIME ZONE 'America/Santiago')::date`;
const dia = (col: string) => sql.raw(`(${col} AT TIME ZONE 'America/Santiago')::date`);

export async function gastoIa(tx: Tx) {
  const { rows: [g] } = await tx.execute<{ dia: string; mes: string }>(sql`
    SELECT coalesce(sum(costo_usd) FILTER (WHERE ${dia("creado_en")} = ${hoy}), 0) AS dia,
           coalesce(sum(costo_usd) FILTER (WHERE date_trunc('month', ${dia("creado_en")}) = date_trunc('month', ${hoy})), 0) AS mes
    FROM llamada_ia`);
  return { diaUsd: Number(g.dia), mesUsd: Number(g.mes) };
}

export async function metricasIa(tx: Tx) {
  // Del pedido pegado al borrador: alta de la cotización → interpretación terminada (auditada por el worker).
  const { rows: [lat] } = await tx.execute<{ p50: string | null; p90: string | null; n: string }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s) AS p50, percentile_cont(0.9) WITHIN GROUP (ORDER BY s) AS p90, count(*) AS n
    FROM (SELECT extract(epoch FROM a.ocurrido_en - c.creado_en) AS s FROM audit_log a JOIN cotizacion c ON c.id::text = a.recurso_id
          WHERE a.recurso = 'cotizacion' AND a.accion = 'interpretar' AND a.resultado = 'ok' AND a.ocurrido_en > now() - interval '30 days') t`);
  const { rows: [tr] } = await tx.execute<{ total: string; fallidos: string; pendientes: string }>(sql`
    SELECT count(*) FILTER (WHERE creado_en > now() - interval '30 days') AS total,
           count(*) FILTER (WHERE estado = 'fallido' AND creado_en > now() - interval '30 days') AS fallidos,
           count(*) FILTER (WHERE estado IN ('pendiente', 'en_curso')) AS pendientes
    FROM trabajo_ia`);
  const { rows: porResultado } = await tx.execute<{ resultado: string; n: string; costo: string }>(sql`
    SELECT resultado, count(*) AS n, coalesce(sum(costo_usd), 0) AS costo FROM llamada_ia
    WHERE creado_en > now() - interval '30 days' GROUP BY resultado ORDER BY resultado`);
  const gasto = await gastoIa(tx);
  const llamadasOk = Number(porResultado.find((r) => r.resultado === "ok")?.n ?? 0);
  const t = topes();
  return {
    latencia: { p50Ms: lat.p50 === null ? null : Number(lat.p50) * 1000, p90Ms: lat.p90 === null ? null : Number(lat.p90) * 1000, muestras: Number(lat.n) },
    trabajos: { total: Number(tr.total), fallidos: Number(tr.fallidos), pendientes: Number(tr.pendientes), tasaFalla: Number(tr.total) ? Number(tr.fallidos) / Number(tr.total) : 0 },
    llamadas: porResultado.map((r) => ({ resultado: r.resultado, n: Number(r.n), costoUsd: Number(r.costo) })),
    costoMedioUsd: llamadasOk ? porResultado.reduce((s, r) => s + Number(r.costo), 0) / llamadasOk : null,
    gasto, topes: t, alertas: alertasGasto(gasto.diaUsd, gasto.mesUsd, t),
  };
}
