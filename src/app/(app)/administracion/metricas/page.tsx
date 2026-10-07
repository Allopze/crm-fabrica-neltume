import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { Cifra, Encabezado, Panel } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { metricasIa } from "@/domain/metricas-ia";
import { numero } from "@/lib/formato";

export const metadata: Metadata = { title: "Métricas de IA" };

const seg = (ms: number | null) => (ms === null ? "—" : `${numero(Math.round(ms / 100) / 10)} s`);
const usd = (v: number | null, dec = 2) => (v === null ? "—" : `US$ ${v.toFixed(dec).replace(".", ",")}`);
const NOMBRES: Record<string, string> = { ok: "Correctas", timeout: "Sin respuesta a tiempo", error: "Error del proveedor", invalida: "Salida inválida", tope: "Bloqueadas por el tope" };

export default async function MetricasPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("auditoria.ver")) return <SinPermiso permiso="auditoria.ver" />;
  const m = await metricasIa(bd());

  return (
    <>
      <Encabezado titulo="Métricas de IA"
        descripcion="Cuánto tarda y cuánto cuesta interpretar pedidos, y cuántas veces falla. Últimos 30 días; el gasto, del día y del mes." />
      {m.alertas.map((a) => (
        <p key={a} role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-ambar/30 bg-ambar-velo px-5 py-3 text-sm text-ambar"><TriangleAlert className="h-4 w-4" /> {a}</p>
      ))}
      <div className="mb-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
        <Cifra etiqueta="Pedido → borrador, p90" valor={seg(m.latencia.p90Ms)} nota={`mediana ${seg(m.latencia.p50Ms)} · meta ≤ 15 s · ${m.latencia.muestras === 1 ? "1 interpretación completa" : `${m.latencia.muestras} interpretaciones completas`}`}
          tono={m.latencia.p90Ms !== null && m.latencia.p90Ms > 15_000 ? "ambar" : undefined} />
        <Cifra etiqueta="Costo medio por pedido" valor={usd(m.costoMedioUsd, 4)} nota="meta ≤ US$ 0,10" tono={m.costoMedioUsd !== null && m.costoMedioUsd > 0.1 ? "ambar" : undefined} />
        <Cifra etiqueta="Gasto de hoy" valor={usd(m.gasto.diaUsd)} nota={m.topes.diarioUsd ? `tope diario ${usd(m.topes.diarioUsd)}` : "sin tope diario configurado"} />
        <Cifra etiqueta="Gasto del mes" valor={usd(m.gasto.mesUsd)} nota={m.topes.mensualUsd ? `presupuesto ${usd(m.topes.mensualUsd)}` : "sin presupuesto configurado"} />
      </div>
      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-2">
        <Panel titulo="Interpretaciones">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-tinta-suave">Pedidos enviados a la IA</dt><dd className="tabular-nums">{m.trabajos.total}</dd></div>
            <div className="flex justify-between"><dt className="text-tinta-suave">Quedaron «IA no disponible»</dt><dd className="tabular-nums">{m.trabajos.fallidos} ({Math.round(m.trabajos.tasaFalla * 100)} %)</dd></div>
            <div className="flex justify-between"><dt className="text-tinta-suave">En cola ahora</dt><dd className="tabular-nums">{m.trabajos.pendientes}</dd></div>
          </dl>
        </Panel>
        <Panel titulo="Llamadas al proveedor" sinRelleno>
          {m.llamadas.length === 0 ? <p className="px-6 py-8 text-sm text-tinta-tenue">Aún no hay llamadas en los últimos 30 días.</p> : (
            <Tabla>
              <thead><tr><Th>Resultado</Th><Th alinear="der">Llamadas</Th><Th alinear="der">Costo</Th></tr></thead>
              <tbody>{m.llamadas.map((l) => (
                <Tr key={l.resultado}><Td>{NOMBRES[l.resultado] ?? l.resultado}</Td><Td alinear="der">{l.n}</Td><Td alinear="der">{usd(l.costoUsd, 4)}</Td></Tr>
              ))}</tbody>
            </Tabla>
          )}
        </Panel>
      </div>
    </>
  );
}
