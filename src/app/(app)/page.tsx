import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, CircleHelp, Hammer, Hourglass, TriangleAlert, Wallet } from "lucide-react";
import { Cifra, Encabezado, Etiqueta, Panel, Placa, Vacio } from "@/components/ui/base";
import { bd } from "@/db/conexion";
import type { Permiso } from "@/domain/auth/permisos";
import { requerirSesion } from "@/domain/auth/servidor";
import { alertasGasto, gastoIa } from "@/domain/metricas-ia";
import { alertasStock, cifrasDelMes, pedidosConFaltante, porRevisar } from "@/domain/panel";
import { pedidosPorAtender } from "@/domain/pedidos/consulta";
import { clp, fechaHora, numero, titulo } from "@/lib/formato";

export const metadata: Metadata = { title: "Panel" };

const mes = new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "America/Santiago" });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Mediana en minutos como duración legible: «menos de 1 min», «12 min», «1 h 05 min». */
function duracion(min: number): string {
  if (min < 1) return "< 1 min";
  const total = Math.round(min);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} min`;
}

/** Fila de una cola de pedidos: documento y cliente a la izquierda, avisos a la derecha (se apilan en angosto). */
function FilaPedido({ id, numero: n, cliente, avisos }: { id: string; numero: number; cliente: string; avisos: ReactNode }) {
  return (
    <li>
      <Link href={`/pedidos/${id}`} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 hover:bg-papel/70">
        <span className="min-w-0 grow basis-full sm:basis-0">
          <span className="block truncate font-medium">Nota de pedido N.º {n}</span>
          <span className="block truncate text-sm text-tinta-tenue">{cliente}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1">{avisos}</span>
      </Link>
    </li>
  );
}

export default async function PanelPage() {
  const sesion = await requerirSesion();
  const puede = (p: Permiso) => sesion.permisos.has(p);
  const verCliente = puede("clientes.ver");
  const nombre = sesion.usuario.nombre.split(/\s+/)[0];
  const hoyTexto = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(new Date());
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1);

  const cotiza = puede("cotizaciones.crear");
  const [revisar, cifras, alertas, faltantes, porAtender] = await Promise.all([
    cotiza ? porRevisar(bd(), verCliente) : null,
    cotiza ? cifrasDelMes(bd()) : null,
    puede("stock.ver") ? alertasStock(bd()) : null,
    puede("pedidos.gestionar") ? pedidosConFaltante(bd(), verCliente) : null,
    puede("pedidos.gestionar") ? pedidosPorAtender(bd(), verCliente) : null,
  ]);
  const bajos = alertas ? alertas.puertas.length + alertas.mp.length : 0;
  const bajoMinimo = alertas && [
    alertas.puertas.length ? plural(alertas.puertas.length, "puerta", "puertas") : null,
    alertas.mp.length ? plural(alertas.mp.length, "insumo", "insumos") : null,
  ].filter(Boolean).join(" y ");
  const gasto = puede("auditoria.ver") ? await gastoIa(bd()) : null;
  const alertasIa = gasto ? alertasGasto(gasto.diaUsd, gasto.mesUsd) : [];

  // Un mismo pedido puede tener faltante y además estar sin abono o atrasado. Se muestra una sola vez,
  // en «Pedidos con faltante» y con todos sus avisos; «Pedidos por atender» queda con el resto.
  const conFaltante = faltantes ?? [];
  const avisoPorPedido = new Map((porAtender ?? []).map((p) => [p.id, p]));
  const idsConFaltante = new Set(conFaltante.map((p) => p.id));
  const restoPorAtender = (porAtender ?? []).filter((p) => !idsConFaltante.has(p.id));
  const mesActual = mes.format(new Date());
  const hayResumen = Boolean(revisar) || conFaltante.length > 0 || restoPorAtender.length > 0 || Boolean(alertas);

  return (
    <>
      <Encabezado
        titulo={<>Hola, {nombre}.</>}
        meta={hoy}
        descripcion={hayResumen ? (
          <>
            {revisar && (revisar.total > 0
              ? <>Tienes <strong className="text-tinta">{plural(revisar.total, "cotización", "cotizaciones")}</strong> por revisar.</>
              : <>No hay cotizaciones por revisar.</>)}
            {conFaltante.length > 0 && <> {plural(conFaltante.length, "nota espera", "notas esperan")} fabricación.</>}
            {restoPorAtender.length > 0 && <> {plural(restoPorAtender.length, "nota espera", "notas esperan")} abono o despacho.</>}
            {alertas && (bajos > 0
              ? <> <strong className="text-tinta">{bajoMinimo}</strong> bajo el mínimo.</>
              : <> Todo el stock sobre el mínimo.</>)}
          </>
        ) : undefined}
      />

      {alertasIa.map((a) => (
        <Link key={a} href="/administracion/metricas" className="mb-6 flex items-center gap-2 rounded-lg border border-ambar/30 bg-ambar-velo px-5 py-3 text-sm text-ambar hover:underline">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {a}
        </Link>
      ))}

      <div className="space-y-8">
        {revisar && (
          <Panel titulo="Para revisar" accion={<Link href="/cotizaciones?estado=borrador" className="-my-2 py-2 text-sm text-rauli hover:underline">Ver borradores</Link>} sinRelleno>
            {revisar.filas.length === 0 ? (
              <Vacio titulo="Nada pendiente por revisar"
                accion={<Link href="/cotizaciones/nueva" className="text-sm font-medium text-rauli hover:underline">Pegar un pedido</Link>}>
                Las cotizaciones nuevas, interpretadas o a mano, se quedan aquí hasta que las apruebes.
              </Vacio>
            ) : (
              <>
                <ul className="divide-y divide-linea/70">
                  {revisar.filas.map((c) => (
                    <li key={c.id}>
                      <Link href={`/cotizaciones/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-papel/70">
                        <span className="flex min-w-0 grow basis-full items-baseline gap-3 sm:basis-0">
                          <span className="w-14 shrink-0 text-sm tabular-nums text-tinta-tenue">N.º {c.numero}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{c.cliente ?? <span className="font-normal text-tinta-tenue">Sin cliente</span>}</span>
                            <span className="block truncate text-sm text-tinta-tenue">{fechaHora(new Date(c.creadoEn).toISOString())} · {c.origen === "ia" ? "desde texto" : "a mano"}</span>
                          </span>
                        </span>
                        {c.estado === "ia_fallida" ? <Etiqueta tono="error"><TriangleAlert className="h-3 w-3" /> IA no disponible</Etiqueta>
                          : c.estado === "interpretando" ? <Etiqueta tono="pizarra"><Hourglass className="h-3 w-3" /> Interpretando</Etiqueta>
                          : c.pendientes > 0 ? <Etiqueta tono="ambar"><CircleHelp className="h-3 w-3" /> {c.pendientes} por confirmar</Etiqueta>
                          : <Etiqueta tono="musgo">Lista para aprobar</Etiqueta>}
                      </Link>
                    </li>
                  ))}
                </ul>
                {revisar.total > revisar.filas.length && (
                  <Link href="/cotizaciones?estado=borrador" className="block border-t border-linea/70 px-5 py-3 text-sm text-rauli hover:underline">
                    Ver las {revisar.total} por revisar
                  </Link>
                )}
              </>
            )}
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-2">
          {faltantes && (
            <Panel titulo="Pedidos con faltante" sinRelleno>
              {conFaltante.length === 0 ? (
                <p className="px-5 py-6 text-sm text-tinta-tenue">Ningún pedido abierto espera fabricación.</p>
              ) : (
                <ul className="divide-y divide-linea/70">
                  {conFaltante.map((p) => {
                    const aviso = avisoPorPedido.get(p.id);
                    return (
                      <FilaPedido key={p.id} id={p.id} numero={p.numero} cliente={p.cliente}
                        avisos={<>
                          <Etiqueta tono="pizarra"><Hammer className="h-3 w-3" /> {p.faltante === 1 ? "Falta 1" : `Faltan ${p.faltante}`} por fabricar</Etiqueta>
                          {aviso?.sinAbono && <Etiqueta tono="ambar"><Wallet className="h-3 w-3" /> Sin abono</Etiqueta>}
                          {aviso && aviso.atrasoDias > 0 && <Etiqueta tono="error"><CalendarClock className="h-3 w-3" /> Atrasada {plural(aviso.atrasoDias, "día", "días")}</Etiqueta>}
                        </>} />
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}

          {porAtender && (
            <Panel titulo="Pedidos por atender" sinRelleno>
              {restoPorAtender.length === 0 ? (
                <p className="px-5 py-6 text-sm text-tinta-tenue">
                  {porAtender.length > 0
                    ? "Las notas sin abono o atrasadas ya están arriba, junto a su faltante."
                    : "Todas las notas abiertas tienen su abono y están al día."}
                </p>
              ) : (
                <ul className="divide-y divide-linea/70">
                  {restoPorAtender.map((p) => (
                    <FilaPedido key={p.id} id={p.id} numero={p.numero} cliente={p.cliente}
                      avisos={<>
                        {p.sinAbono && <Etiqueta tono="ambar"><Wallet className="h-3 w-3" /> Sin abono</Etiqueta>}
                        {p.atrasoDias > 0 && <Etiqueta tono="error"><CalendarClock className="h-3 w-3" /> Atrasada {plural(p.atrasoDias, "día", "días")}</Etiqueta>}
                      </>} />
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-8 [&>*]:min-w-0 lg:grid-cols-[1fr_1.15fr]">
          {alertas && (
            <Panel titulo="Bajo el mínimo" sinRelleno
              accion={alertas.puertas.length || !alertas.mp.length
                ? <Link href="/stock?bajoMinimo=1" className="-my-2 py-2 text-sm text-rauli hover:underline">Ver puertas</Link>
                : <Link href="/materias-primas?bajoMinimo=1" className="-my-2 py-2 text-sm text-rauli hover:underline">Ver insumos</Link>}>
              {bajos === 0 ? <p className="px-5 py-6 text-sm text-tinta-tenue">Todo sobre el mínimo.</p> : (
                <ul className="divide-y divide-linea/70">
                  {alertas.puertas.map((a) => (
                    <li key={a.codigo} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href={`/stock/${a.codigo}`} className="flex min-w-0 items-center gap-3">
                        <Placa codigo={a.codigo} />
                        <span className="truncate text-sm text-tinta-suave">{titulo(a.modelo)}</span>
                      </Link>
                      <span className="shrink-0 text-sm tabular-nums"><strong className="text-ambar">{a.disponible}</strong><span className="text-tinta-tenue"> / mín. {a.minimo}</span></span>
                    </li>
                  ))}
                  {alertas.mp.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <Link href="/materias-primas?bajoMinimo=1" className="-my-2 min-w-0 truncate py-2 text-sm hover:text-rauli">{m.nombre}</Link>
                      <span className="shrink-0 text-sm tabular-nums"><strong className="text-ambar">{numero(m.existencia)}</strong><span className="text-tinta-tenue"> / {numero(m.minimo)} {m.unidad}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {cifras && (
            <Panel titulo="El taller en cifras" sinRelleno>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <Link href="/cotizaciones" className="block min-w-0 rounded-md px-4 py-4 transition-colors hover:bg-papel/70">
                  <Cifra etiqueta={`Cotizaciones · ${mesActual}`} valor={String(cifras.creadas)} nota="creadas este mes" />
                </Link>
                <div className="min-w-0 px-4 py-4">
                  <Cifra etiqueta="Tiempo a aprobar" valor={cifras.medianaMin === null ? "—" : duracion(cifras.medianaMin)}
                    nota={cifras.medianaMin === null ? "sin aprobaciones este mes" : "mediana del mes, desde la creación"} />
                </div>
                <Link href="/cotizaciones?estado=borrador" className="block min-w-0 rounded-md px-4 py-4 transition-colors hover:bg-papel/70">
                  <Cifra etiqueta="Ítems por confirmar" valor={String(cifras.porConfirmar)} nota={`en ${plural(cifras.borradores, "borrador", "borradores")}`} tono={cifras.porConfirmar ? "ambar" : undefined} />
                </Link>
                <Link href="/pedidos" className="block min-w-0 rounded-md px-4 py-4 transition-colors hover:bg-papel/70">
                  <Cifra etiqueta="En pedidos abiertos" valor={clp(cifras.totalPedidos)} nota={plural(cifras.pedidosAbiertos, "nota de pedido", "notas de pedido")} />
                </Link>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
