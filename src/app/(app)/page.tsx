import Link from "next/link";
import { ArrowRight, CircleHelp, Hourglass, Sparkles, TriangleAlert } from "lucide-react";
import { Cifra, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { bd } from "@/db/conexion";
import type { Permiso } from "@/domain/auth/permisos";
import { requerirSesion } from "@/domain/auth/servidor";
import { alertasGasto, gastoIa } from "@/domain/metricas-ia";
import { alertasStock, cifrasDelMes, pedidosConFaltante, porRevisar } from "@/domain/panel";
import { clp, fechaHora, numero } from "@/lib/formato";

const mes = new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "America/Santiago" });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default async function PanelPage() {
  const sesion = await requerirSesion();
  const puede = (p: Permiso) => sesion.permisos.has(p);
  const verCliente = puede("clientes.ver");
  const nombre = sesion.usuario.nombre.split(/\s+/)[0];
  const hoy = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(new Date());

  const cotiza = puede("cotizaciones.crear");
  const [revisar, cifras, alertas, faltantes] = await Promise.all([
    cotiza ? porRevisar(bd(), verCliente) : null,
    cotiza ? cifrasDelMes(bd()) : null,
    puede("stock.ver") ? alertasStock(bd()) : null,
    puede("pedidos.gestionar") ? pedidosConFaltante(bd(), verCliente) : null,
  ]);
  const bajos = alertas ? alertas.puertas.length + alertas.mp.length : 0;
  const gasto = puede("auditoria.ver") ? await gastoIa(bd()) : null;
  const alertasIa = gasto ? alertasGasto(gasto.diaUsd, gasto.mesUsd) : [];

  return (
    <>
      <Encabezado
        antetitulo={hoy}
        titulo={<>Hola, {nombre}.</>}
        descripcion={
          <>
            {revisar && <>Tienes <strong className="text-tinta">{plural(revisar.total, "cotización", "cotizaciones")}</strong> por revisar{alertas ? " y " : "."}</>}
            {alertas && <><strong className="text-tinta">{plural(bajos, "puerta o insumo", "puertas o insumos")}</strong> bajo el mínimo.</>}
          </>
        }
      />

      {alertasIa.map((a) => (
        <Link key={a} href="/administracion/metricas" role="alert" className="mb-6 flex items-center gap-2 rounded-lg border border-ambar/30 bg-ambar-velo px-5 py-3 text-sm text-ambar hover:underline">
          <TriangleAlert className="h-4 w-4" /> {a}
        </Link>
      ))}

      {cotiza && (
        <Link href="/cotizaciones/nueva"
          className="entrada entrada-2 group relative mb-10 block overflow-hidden rounded-lg border border-linea-fuerte bg-lamina p-7 shadow-[0_18px_40px_-30px_rgb(30_40_30/0.5)] transition-colors hover:border-tinta">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-rauli">Mesa de entrada</p>
              <p className="mt-2 font-display text-[1.7rem] leading-tight font-medium tracking-tight">Pega el pedido tal como llegó.</p>
              <p className="mt-2 max-w-xl text-sm text-tinta-suave">La IA lo interpreta en segundos; los precios los calcula el sistema y tú apruebas antes de que salga.</p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rauli text-lamina transition-transform group-hover:translate-x-1"><ArrowRight className="h-5 w-5" /></span>
          </div>
          <p className="mt-5 rounded-md border border-dashed border-linea-fuerte bg-papel px-4 py-3 font-mono text-[13px] text-tinta-tenue">«3 puertas Neltume en raulí de 90x210 y 2 Toltén de 87x215…»</p>
        </Link>
      )}

      {cifras && (
        <div className="entrada entrada-3 mb-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
          <Cifra etiqueta={`Cotizaciones · ${mes.format(new Date())}`} valor={String(cifras.creadas)} nota="creadas este mes" />
          <Cifra etiqueta="Tiempo a aprobar" tono="rauli"
            valor={cifras.medianaMin === null ? "—" : `${Math.floor(cifras.medianaMin)}:${String(Math.round((cifras.medianaMin % 1) * 60)).padStart(2, "0")}`}
            nota={cifras.medianaMin === null ? "sin aprobaciones este mes" : "minutos, mediana del mes"} />
          <Cifra etiqueta="Ítems por confirmar" valor={String(cifras.porConfirmar)} nota={`en ${plural(cifras.borradores, "borrador", "borradores")}`} tono={cifras.porConfirmar ? "ambar" : undefined} />
          <Cifra etiqueta="En pedidos abiertos" valor={clp(cifras.totalPedidos)} nota={plural(cifras.pedidosAbiertos, "nota de pedido", "notas de pedido")} />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr]">
        {revisar && (
          <Panel titulo="Para revisar" accion={<Link href="/cotizaciones?estado=borrador" className="text-sm text-rauli hover:underline">Ver todas</Link>} sinRelleno>
            {revisar.filas.length === 0 ? <p className="px-5 py-8 text-sm text-tinta-tenue">Nada pendiente. Las cotizaciones nuevas aparecen aquí.</p> : (
              <ul>
                {revisar.filas.map((c) => (
                  <li key={c.id} className="border-b border-linea/70 last:border-0">
                    <Link href={`/cotizaciones/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-papel/70">
                      <span className="font-mono text-sm text-tinta-tenue">#{c.numero}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.cliente ?? <span className="text-tinta-tenue">sin cliente</span>}</span>
                        <span className="block truncate text-sm text-tinta-tenue">{fechaHora(new Date(c.creadoEn).toISOString())} · {c.origen === "ia" ? "desde texto" : "manual"}</span>
                      </span>
                      {c.estado === "ia_fallida" ? <Etiqueta tono="error"><TriangleAlert className="h-3 w-3" /> IA no disponible</Etiqueta>
                        : c.estado === "interpretando" ? <Etiqueta tono="pizarra"><Hourglass className="h-3 w-3" /> interpretando</Etiqueta>
                        : c.pendientes > 0 ? <Etiqueta tono="ambar"><CircleHelp className="h-3 w-3" /> {c.pendientes} por confirmar</Etiqueta>
                        : <Etiqueta tono="musgo">lista para aprobar</Etiqueta>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <div className="space-y-8">
          {alertas && (
            <Panel titulo="Bajo el mínimo" accion={<Link href="/stock?bajoMinimo=1" className="text-sm text-rauli hover:underline">Stock</Link>} sinRelleno>
              {bajos === 0 ? <p className="px-5 py-6 text-sm text-tinta-tenue">Todo sobre el mínimo.</p> : (
                <ul className="divide-y divide-linea/70">
                  {alertas.puertas.map((a) => (
                    <li key={a.codigo} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href={`/stock/${a.codigo}`} className="flex items-center gap-3"><Placa codigo={a.codigo} /><span className="text-sm capitalize text-tinta-suave">{a.modelo.toLowerCase()}</span></Link>
                      <span className="text-sm tabular-nums"><strong>{a.disponible}</strong><span className="text-tinta-tenue"> / mín. {a.minimo}</span></span>
                    </li>
                  ))}
                  {alertas.mp.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href="/materias-primas" className="truncate text-sm">{m.nombre}</Link>
                      <span className="text-sm tabular-nums"><strong className="text-ambar">{numero(m.existencia)}</strong><span className="text-tinta-tenue"> / {numero(m.stockMinimo!)} {m.unidad}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {faltantes && (
            <Panel titulo="Pedidos con faltante">
              {faltantes.length === 0 ? <p className="text-sm text-tinta-tenue">Ningún pedido abierto espera fabricación.</p> : (
                <div className="space-y-4">
                  {faltantes.map((p) => (
                    <Link key={p.id} href={`/pedidos/${p.id}`} className="flex items-center justify-between gap-3 hover:text-rauli">
                      <span><span className="font-medium">Pedido {p.numero}</span><span className="block text-sm text-tinta-tenue">{p.cliente}</span></span>
                      <Etiqueta tono="pizarra"><Sparkles className="h-3 w-3" /> faltan {p.faltante} por fabricar</Etiqueta>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
