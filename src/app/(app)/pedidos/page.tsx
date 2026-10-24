import type { Metadata } from "next";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { BotonLink, Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { estadoPago, estadoPedido, estadosPago, estadosPedido } from "@/components/ui/estado-pedido";
import { FilaEnlazada } from "@/components/ui/fila-enlazada";
import { Paginacion } from "@/components/ui/paginacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { contarPedidos, listarPedidos, vistaDe } from "@/domain/pedidos/consulta";
import type { EstadoPago } from "@/domain/pedidos/pagos";
import { clp, cn, fecha } from "@/lib/formato";

export const metadata: Metadata = { title: "Notas de pedido" };

const chip = (activo: boolean) => cn("rounded-full px-3.5 py-1.5 text-sm pointer-coarse:py-2.5",
  activo ? "bg-tinta text-lamina" : "border border-linea text-tinta-suave hover:border-tinta hover:text-tinta");

export default async function PedidosPage({ searchParams }: PageProps<"/pedidos">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("pedidos.gestionar")) return <SinPermiso permiso="pedidos.gestionar" />;
  const sp = await searchParams;
  // Filtros por estado y por estado de pago (REQ-COT-8.12, 8.15); valores fuera de la lista se ignoran.
  const estado = typeof sp.estado === "string" && sp.estado in estadosPedido ? sp.estado : "";
  const pago = typeof sp.pago === "string" && sp.pago in estadosPago ? (sp.pago as EstadoPago) : "";
  const antes = Number(sp.antes);
  const [{ datos, total, siguiente }, conteo] = await Promise.all([
    listarPedidos(bd(), { estado: estado || undefined, estadoPago: pago || undefined, antesDe: antes > 0 ? antes : undefined }, vistaDe(sesion.permisos)),
    contarPedidos(bd()),
  ]);
  const enlace = (extra: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries({ estado, pago, ...extra }).filter(([, v]) => v) as [string, string][]).toString();
    return q ? `/pedidos?${q}` : "/pedidos";
  };

  return (
    <>
      <Encabezado
        titulo="Notas de pedido"
        descripcion="Una cotización aceptada o una nota de la tienda se convierte en nota de pedido: reserva lo disponible y marca lo que falta fabricar. Se produce con el abono y se despacha pagada."
        acciones={<BotonLink href="/pedidos/nota-tienda" variante="primario"><FileUp className="h-4 w-4" /> Desde nota de la tienda</BotonLink>}
      />

      <nav className="mb-2 flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
        <Link href={enlace({ estado: "" })} aria-current={!estado ? "page" : undefined} className={chip(!estado)}>Todas <span className="tabular-nums opacity-70">{conteo.total}</span></Link>
        {Object.entries(estadosPedido).map(([v, x]) => (
          <Link key={v} href={enlace({ estado: v })} aria-current={estado === v ? "page" : undefined} className={chip(estado === v)}>
            {x.texto} <span className="tabular-nums opacity-70">{conteo.porEstado[v] ?? 0}</span>
          </Link>
        ))}
      </nav>
      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Filtrar por pago">
        <Link href={enlace({ pago: "" })} aria-current={!pago ? "page" : undefined} className={chip(!pago)}>Cualquier pago</Link>
        {Object.entries(estadosPago).map(([v, x]) => (
          <Link key={v} href={enlace({ pago: v })} aria-current={pago === v ? "page" : undefined} className={chip(pago === v)}>
            {x.texto} <span className="tabular-nums opacity-70">{conteo.porPago[v] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={estado || pago ? "Sin resultados" : "Aún no hay notas de pedido"}
            accion={!estado && !pago ? <BotonLink href="/pedidos/nota-tienda" variante="primario">Desde nota de la tienda</BotonLink> : undefined}>
            {estado || pago ? "Prueba con otros filtros." : "Se crean desde una cotización aprobada con «Convertir en pedido»."}
          </Vacio>
        ) : (
          <Tabla etiqueta="Notas de pedido">
            <thead><tr><Th>N.º</Th><Th>Cliente</Th><Th className="hidden lg:table-cell">Origen</Th><Th className="hidden md:table-cell">Creada</Th><Th className="hidden md:table-cell">Reservado / pedido</Th><Th>Estado</Th><Th>Pago</Th>{sesion.permisos.has("pedidos.importes.ver") && <Th alinear="der">Total</Th>}</tr></thead>
            <tbody>
              {datos.map((p) => {
                const e = estadoPedido(p.estado);
                const ep = estadoPago(p.estadoPago);
                return (
                  <FilaEnlazada key={p.id} href={`/pedidos/${p.id}`}>
                    <Td><Link href={`/pedidos/${p.id}`} aria-label={`Nota de pedido N.º ${p.numero}`} className="-my-2 inline-block py-2 font-medium tabular-nums text-rauli hover:underline">{p.numero}</Link></Td>
                    <Td className="font-medium">{p.cliente}</Td>
                    <Td className="hidden text-tinta-suave lg:table-cell">{p.cotizacion ? `Cotización N.º ${p.cotizacion}` : `Nota de la tienda N.º ${p.refExterna}${p.revisionExterna > 1 ? ` (rev. ${p.revisionExterna})` : ""}`}{p.origen === "tienda_api" && <span className="block text-xs text-tinta-tenue">Recibida automáticamente</span>}</Td>
                    <Td className="hidden whitespace-nowrap text-tinta-suave md:table-cell">{fecha(new Date(p.creadoEn).toISOString())}</Td>
                    <Td className="hidden md:table-cell">
                      <span className="tabular-nums">{p.reservado} / {p.cantidad}</span>
                      {(p.estado === "pendiente" || p.estado === "en_produccion") && p.reservado < p.cantidad && <span className="ml-2 text-xs text-pizarra">{p.cantidad - p.reservado === 1 ? "falta 1" : `faltan ${p.cantidad - p.reservado}`}</span>}
                    </Td>
                    <Td>
                      <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
                      {p.atrasoDias > 0 && <span className="mt-1 block text-xs text-error">Atrasada {p.atrasoDias === 1 ? "1 día" : `${p.atrasoDias} días`}</span>}
                    </Td>
                    {/* Una nota cancelada sin pagos no tiene nada que cobrar ni anotar. */}
                    <Td>{p.estado === "cancelada" && (p.pagado ?? 0) === 0 ? <span className="text-tinta-tenue">—</span> : <Etiqueta tono={ep.tono} className="whitespace-nowrap">{ep.texto}</Etiqueta>}</Td>
                    {p.total !== null && p.pagado !== null && <Td alinear="der" className="font-medium">{clp(p.total)}{p.pagado > 0 && p.pagado < p.total && <span className="block text-xs font-normal text-tinta-tenue">pagado {clp(p.pagado)}</span>}</Td>}
                  </FilaEnlazada>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Panel>
      <Paginacion total={total} singular="nota de pedido" plural="notas de pedido" etiquetaSiguiente="Más antiguas"
        inicio={antes > 0 ? enlace({}) : undefined} siguiente={siguiente ? enlace({ antes: String(siguiente) }) : null} />
    </>
  );
}
