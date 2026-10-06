import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { nombreCliente, pedidos } from "@/mock/comercial";
import { estadosPedido } from "@/components/ui/estado-pedido";
import { clp, fecha } from "@/lib/formato";

export const metadata: Metadata = { title: "Notas de pedido" };


export default function PedidosPage() {
  return (
    <>
      <Encabezado
        antetitulo="Ventas · pedidos"
        titulo="Notas de pedido"
        descripcion="Una cotización aceptada se convierte en nota de pedido: reserva lo disponible y marca lo que falta fabricar."
      />
      <Panel sinRelleno>
        <Tabla>
          <thead><tr><Th>N.º</Th><Th>Cliente</Th><Th>Cotización</Th><Th>Creado</Th><Th>Reservado / pedido</Th><Th>Estado</Th><Th alinear="der">Total</Th></tr></thead>
          <tbody>
            {pedidos.map((p) => {
              const pedido = p.items.reduce((s, i) => s + i.cantidad, 0);
              const reservado = p.items.reduce((s, i) => s + i.reservado, 0);
              const e = estadosPedido[p.estado];
              return (
                <Tr key={p.id}>
                  <Td><Link href={`/pedidos/${p.id}`} className="font-mono font-medium text-rauli hover:underline">{p.numero}</Link></Td>
                  <Td className="font-medium">{nombreCliente(p.clienteId)}</Td>
                  <Td className="font-mono text-tinta-suave">#{p.cotizacion}</Td>
                  <Td className="text-tinta-suave">{fecha(p.creado)}</Td>
                  <Td>
                    <span className="tabular-nums">{reservado} / {pedido}</span>
                    {reservado < pedido && <span className="ml-2 text-xs text-pizarra">faltan {pedido - reservado}</span>}
                  </Td>
                  <Td><Etiqueta tono={e.tono}>{e.texto}</Etiqueta></Td>
                  <Td alinear="der" className="font-medium">{clp(p.total)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      </Panel>
    </>
  );
}
