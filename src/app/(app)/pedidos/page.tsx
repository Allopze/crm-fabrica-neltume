import type { Metadata } from "next";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { BotonLink, Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { estadoPedido } from "@/components/ui/estado-pedido";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarPedidos } from "@/domain/pedidos/consulta";
import { clp, fecha } from "@/lib/formato";

export const metadata: Metadata = { title: "Notas de pedido" };

export default async function PedidosPage({ searchParams }: PageProps<"/pedidos">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("pedidos.gestionar")) return <SinPermiso permiso="pedidos.gestionar" />;
  const antes = Number((await searchParams).antes);
  const { datos, siguiente } = await listarPedidos(bd(), { antesDe: antes > 0 ? antes : undefined }, sesion.permisos.has("clientes.ver"));

  return (
    <>
      <Encabezado
        titulo="Notas de pedido"
        descripcion="Una cotización aceptada o una nota de la tienda se convierte en nota de pedido: reserva lo disponible y marca lo que falta fabricar."
        acciones={<BotonLink href="/pedidos/nota-tienda" variante="primario"><FileUp className="h-4 w-4" /> Desde nota de la tienda</BotonLink>}
      />
      <Panel sinRelleno>
        {datos.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-tinta-tenue">Aún no hay notas de pedido. Se crean desde una cotización aprobada con «Convertir en pedido».</p>
        ) : (
          <Tabla>
            <thead><tr><Th>N.º</Th><Th>Cliente</Th><Th className="hidden lg:table-cell">Origen</Th><Th className="hidden md:table-cell">Creada</Th><Th className="hidden md:table-cell">Reservado / pedido</Th><Th>Estado</Th><Th alinear="der">Total</Th></tr></thead>
            <tbody>
              {datos.map((p) => {
                const e = estadoPedido(p.estado);
                return (
                  <Tr key={p.id}>
                    <Td><Link href={`/pedidos/${p.id}`} aria-label={`Nota de pedido N.º ${p.numero}`} className="-my-2 inline-block py-2 font-medium tabular-nums text-rauli hover:underline">{p.numero}</Link></Td>
                    <Td className="font-medium">{p.cliente}</Td>
                    <Td className="hidden text-tinta-suave lg:table-cell">{p.cotizacion ? `Cotización N.º ${p.cotizacion}` : `Nota de la tienda N.º ${p.refExterna}`}</Td>
                    <Td className="hidden text-tinta-suave md:table-cell">{fecha(new Date(p.creadoEn).toISOString())}</Td>
                    <Td className="hidden md:table-cell">
                      <span className="tabular-nums">{p.reservado} / {p.cantidad}</span>
                      {(p.estado === "pendiente" || p.estado === "en_produccion") && p.reservado < p.cantidad && <span className="ml-2 text-xs text-pizarra">{p.cantidad - p.reservado === 1 ? "falta 1" : `faltan ${p.cantidad - p.reservado}`}</span>}
                    </Td>
                    <Td><Etiqueta tono={e.tono}>{e.texto}</Etiqueta></Td>
                    <Td alinear="der" className="font-medium">{clp(Number(p.total))}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && <p className="mt-4 text-sm"><Link href={`/pedidos?antes=${siguiente}`} className="text-rauli hover:underline">Ver más antiguas</Link></p>}
    </>
  );
}
