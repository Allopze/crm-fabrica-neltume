import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BotonLink, Encabezado, Panel, Placa } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { notaPedido } from "@/db/esquema/comercial";
import { requerirSesion } from "@/domain/auth/servidor";
import { obtenerCliente } from "@/domain/clientes";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { ErrorDominio } from "@/domain/errores";
import { repartirReserva } from "@/domain/pedidos/reserva";
import { saldo } from "@/domain/stock";
import { clp } from "@/lib/formato";
import { FormularioPedido } from "./formulario-pedido";

export const metadata: Metadata = { title: "Convertir en pedido" };

export default async function NuevoPedidoPage({ searchParams }: PageProps<"/pedidos/nuevo">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("pedidos.gestionar")) return <SinPermiso permiso="pedidos.gestionar" />;
  const id = String((await searchParams).cotizacion ?? "");
  const verClientes = sesion.permisos.has("clientes.ver");
  const c = await obtenerCotizacion(bd(), id, verClientes).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  if (c.estado === "aceptada") {
    const [p] = await bd().select({ id: notaPedido.id }).from(notaPedido).where(eq(notaPedido.cotizacionId, c.id));
    if (p) redirect(`/pedidos/${p.id}`);
  }
  const bloqueo = c.estado !== "aprobada" ? "Solo una cotización aprobada se convierte en pedido." : c.vencida ? "La cotización está vencida: hay que recotizar." : null;

  // Vista previa de la reserva con el disponible de ahora; la definitiva se calcula al confirmar.
  const ids = [...new Set(c.items.flatMap((i) => (i.articuloId ? [i.articuloId] : [])))];
  const disponible = new Map(await Promise.all(ids.map(async (a) => [a, (await saldo(bd(), { articuloId: a })).disponible] as const)));
  const reparto = repartirReserva(c.items.map((i) => ({ articuloId: i.articuloId, cantidad: i.cantidad })), disponible);
  const codigos = new Map(ids.length ? (await bd().select({ id: articulo.id, c: articulo.codigo }).from(articulo).where(inArray(articulo.id, ids))).map((a) => [a.id, a.c]) : []);
  const cli = verClientes && c.clienteId ? await obtenerCliente(bd(), c.clienteId) : null;

  return (
    <>
      <Encabezado antetitulo={`Desde cotización #${c.numero}`} titulo="Convertir en nota de pedido"
        descripcion="Se reserva lo que hay en stock; lo que falta queda marcado para fabricar. Los precios son los congelados de la cotización." />
      {bloqueo ? (
        <Panel><p className="text-sm text-ambar">{bloqueo}</p><BotonLink href={`/cotizaciones/${c.id}`} className="mt-4">Volver a la cotización</BotonLink></Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel titulo="Reserva prevista" sinRelleno>
            <ul className="divide-y divide-linea">
              {c.items.map((i, k) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">{i.articuloId ? <Placa codigo={codigos.get(i.articuloId) ?? "—"} /> : <span className="text-pizarra">A pedido</span>} <span className="ml-2">{i.descripcion}</span></span>
                  <span className="tabular-nums text-tinta-suave">{i.cantidad} u · {clp(Number(i.totalLinea))}</span>
                  <span className="w-full text-xs tabular-nums">
                    <span className="text-musgo">reserva {reparto[k].reservado}</span>
                    {reparto[k].faltante > 0 && <span className="ml-3 text-pizarra">por fabricar {reparto[k].faltante}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <FormularioPedido cotizacionId={c.id} csrf={sesion.csrf} cliente={c.cliente?.nombre ?? null}
            direccion={cli?.direccionDespacho ?? cli?.direccion ?? ""} total={clp(Number(c.total))} />
        </div>
      )}
    </>
  );
}
