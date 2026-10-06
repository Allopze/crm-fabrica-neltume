import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Etiqueta, Panel } from "@/components/ui/base";
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
        antetitulo="Ventas · pedidos"
        titulo="Notas de pedido"
        descripcion="Una cotización aceptada se convierte en nota de pedido: reserva lo disponible y marca lo que falta fabricar."
      />
      <Panel sinRelleno>
        {datos.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-tinta-tenue">Aún no hay notas de pedido. Se crean desde una cotización aprobada con «Convertir en pedido».</p>
        ) : (
          <Tabla>
            <thead><tr><Th>N.º</Th><Th>Cliente</Th><Th>Cotización</Th><Th>Creado</Th><Th>Reservado / pedido</Th><Th>Estado</Th><Th alinear="der">Total</Th></tr></thead>
            <tbody>
              {datos.map((p) => {
                const e = estadoPedido(p.estado);
                return (
                  <Tr key={p.id}>
                    <Td><Link href={`/pedidos/${p.id}`} className="font-mono font-medium text-rauli hover:underline">{p.numero}</Link></Td>
                    <Td className="font-medium">{p.cliente}</Td>
                    <Td className="font-mono text-tinta-suave">#{p.cotizacion}</Td>
                    <Td className="text-tinta-suave">{fecha(new Date(p.creadoEn).toISOString())}</Td>
                    <Td>
                      <span className="tabular-nums">{p.reservado} / {p.cantidad}</span>
                      {p.estado !== "cancelada" && p.reservado < p.cantidad && <span className="ml-2 text-xs text-pizarra">faltan {p.cantidad - p.reservado}</span>}
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
