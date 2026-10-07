import Link from "next/link";
import { ArrowRight, CircleHelp, Hammer, Hourglass, TriangleAlert } from "lucide-react";
import { Cifra, Encabezado, Etiqueta, Panel, Placa } from "@/components/ui/base";
import { bd } from "@/db/conexion";
import type { Permiso } from "@/domain/auth/permisos";
import { requerirSesion } from "@/domain/auth/servidor";
import { alertasGasto, gastoIa } from "@/domain/metricas-ia";
import { alertasStock, cifrasDelMes, pedidosConFaltante, porRevisar } from "@/domain/panel";
import { clp, fechaHora, numero } from "@/lib/formato";

const mes = new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "America/Santiago" });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Mediana en minutos como duración legible: «menos de 1 min», «12 min», «1 h 05 min». */
function duracion(min: number): string {
  if (min < 1) return "< 1 min";
  const total = Math.round(min);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} min`;
}

export default async function PanelPage() {
  const sesion = await requerirSesion();
  const puede = (p: Permiso) => sesion.permisos.has(p);
  const verCliente = puede("clientes.ver");
  const nombre = sesion.usuario.nombre.split(/\s+/)[0];
  const hoyTexto = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(new Date());
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1);

  const cotiza = puede("cotizaciones.crear");
  const [revisar, cifras, alertas, faltantes] = await Promise.all([
    cotiza ? porRevisar(bd(), verCliente) : null,
    cotiza ? cifrasDelMes(bd()) : null,
    puede("stock.ver") ? alertasStock(bd()) : null,
    puede("pedidos.gestionar") ? pedidosConFaltante(bd(), verCliente) : null,
  ]);
  const bajos = alertas ? alertas.puertas.length + alertas.mp.length : 0;
  const bajoMinimo = alertas && [
    alertas.puertas.length ? plural(alertas.puertas.length, "puerta", "puertas") : null,
    alertas.mp.length ? plural(alertas.mp.length, "insumo", "insumos") : null,
  ].filter(Boolean).join(" y ");
  const gasto = puede("auditoria.ver") ? await gastoIa(bd()) : null;
  const alertasIa = gasto ? alertasGasto(gasto.diaUsd, gasto.mesUsd) : [];

  return (
    <>
      <Encabezado
        titulo={<>Hola, {nombre}.</>}
        meta={hoy}
        descripcion={
          <>
            {revisar && <>Tienes <strong className="text-tinta">{plural(revisar.total, "cotización", "cotizaciones")}</strong> por revisar{alertas ? " y " : "."}</>}
            {alertas && (bajos ? <><strong className="text-tinta">{bajoMinimo}</strong> bajo el mínimo.</> : <>nada bajo el mínimo.</>)}
          </>
        }
      />

      {alertasIa.map((a) => (
        <Link key={a} href="/administracion/metricas" className="mb-6 flex items-center gap-2 rounded-lg border border-ambar/30 bg-ambar-velo px-5 py-3 text-sm text-ambar hover:underline">
          <TriangleAlert className="h-4 w-4" /> {a}
        </Link>
      ))}

      {cotiza && (
        <Link href="/cotizaciones/nueva"
          className="group relative mb-10 block overflow-hidden rounded-lg border border-linea-fuerte bg-lamina p-5 sm:p-7 shadow-[0_18px_40px_-30px_rgb(30_40_30/0.5)] transition-colors hover:border-tinta">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="font-display text-[1.4rem] leading-tight sm:text-[1.7rem] font-medium tracking-tight">Pega el pedido tal como llegó.</p>
              <p className="mt-2 max-w-xl text-sm text-tinta-suave">La IA lo interpreta en segundos; los precios los calcula el sistema y tú apruebas antes de que salga.</p>
              <p className="mt-4 text-sm text-tinta-tenue">Por ejemplo: <span className="italic">«3 puertas Neltume en raulí de 90x210 y 2 Toltén de 87x215»</span></p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rauli text-lamina transition-transform group-hover:translate-x-1"><ArrowRight className="h-5 w-5" /></span>
          </div>
        </Link>
      )}

      {cifras && (
        <div className="mb-12 grid grid-cols-2 gap-x-5 gap-y-8 sm:gap-8 lg:grid-cols-4">
          <Cifra etiqueta={`Cotizaciones · ${mes.format(new Date())}`} valor={String(cifras.creadas)} nota="creadas este mes" />
          <Cifra etiqueta="Tiempo a aprobar" valor={cifras.medianaMin === null ? "—" : duracion(cifras.medianaMin)}
            nota={cifras.medianaMin === null ? "sin aprobaciones este mes" : "mediana del mes, desde la creación"} />
          <Cifra etiqueta="Ítems por confirmar" valor={String(cifras.porConfirmar)} nota={`en ${plural(cifras.borradores, "borrador", "borradores")}`} tono={cifras.porConfirmar ? "ambar" : undefined} />
          <Cifra etiqueta="En pedidos abiertos" valor={clp(cifras.totalPedidos)} nota={plural(cifras.pedidosAbiertos, "nota de pedido", "notas de pedido")} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1.45fr_1fr]">
        {revisar && (
          <Panel titulo="Para revisar" accion={<Link href="/cotizaciones?estado=borrador" className="-my-2 py-2 text-sm text-rauli hover:underline">Ver borradores</Link>} sinRelleno>
            {revisar.filas.length === 0 ? <p className="px-5 py-8 text-sm text-tinta-tenue">Nada pendiente. Las cotizaciones nuevas aparecen aquí.</p> : (
              <ul>
                {revisar.filas.map((c) => (
                  <li key={c.id} className="border-b border-linea/70 last:border-0">
                    <Link href={`/cotizaciones/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-papel/70">
                      <span className="w-14 shrink-0 text-sm tabular-nums text-tinta-tenue">N.º {c.numero}</span>
                      <span className="min-w-[10rem] flex-1">
                        <span className="block font-medium">{c.cliente ?? <span className="text-tinta-tenue">sin cliente</span>}</span>
                        <span className="block text-sm text-tinta-tenue">{fechaHora(new Date(c.creadoEn).toISOString())} · {c.origen === "ia" ? "desde texto" : "manual"}</span>
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
            <Panel titulo="Bajo el mínimo" sinRelleno
              accion={alertas.puertas.length || !alertas.mp.length
                ? <Link href="/stock?bajoMinimo=1" className="-my-2 py-2 text-sm text-rauli hover:underline">Ver puertas</Link>
                : <Link href="/materias-primas?bajoMinimo=1" className="-my-2 py-2 text-sm text-rauli hover:underline">Ver insumos</Link>}>
              {bajos === 0 ? <p className="px-5 py-6 text-sm text-tinta-tenue">Todo sobre el mínimo.</p> : (
                <ul className="divide-y divide-linea/70">
                  {alertas.puertas.map((a) => (
                    <li key={a.codigo} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href={`/stock/${a.codigo}`} className="flex items-center gap-3"><Placa codigo={a.codigo} /><span className="text-sm capitalize text-tinta-suave">{a.modelo.toLowerCase()}</span></Link>
                      <span className="text-sm tabular-nums"><strong className="text-ambar">{a.disponible}</strong><span className="text-tinta-tenue"> / mín. {a.minimo}</span></span>
                    </li>
                  ))}
                  {alertas.mp.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href="/materias-primas?bajoMinimo=1" className="-my-2 truncate py-2 text-sm hover:text-rauli">{m.nombre}</Link>
                      <span className="text-sm tabular-nums"><strong className="text-ambar">{numero(m.existencia)}</strong><span className="text-tinta-tenue"> / {numero(m.minimo)} {m.unidad}</span></span>
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
                      <span><span className="font-medium">Nota de pedido N.º {p.numero}</span><span className="block text-sm text-tinta-tenue">{p.cliente}</span></span>
                      <Etiqueta tono="pizarra"><Hammer className="h-3 w-3" /> {p.faltante === 1 ? "falta 1" : `faltan ${p.faltante}`} por fabricar</Etiqueta>
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
