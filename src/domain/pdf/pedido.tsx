// PDF de la nota de pedido desde la copia congelada (ADR-0004; REQ-COT-8.1).
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import type { Tx } from "@/db/conexion";
import { MARCA } from "@/lib/marca";
import { obtenerPedido } from "../pedidos/consulta";
import { Caja, e, MarcaDeAgua, Membrete, Partes, Pie, TablaItems, Totales } from "./comun";
import { contenidoPedido, type PedidoPdf } from "./contenido";

function DocumentoPedido({ p }: { p: PedidoPdf }) {
  const k = contenidoPedido(p);
  return (
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={p.creadoEn} modificationDate={p.creadoEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete tipo={k.tipo} numero={k.numero} meta={k.meta} />
        <Partes partes={k.partes} />
        <TablaItems columnas={["Código", "Descripción", "Cant.", "Por fabricar", "Total"]} filas={k.filas} casilla />
        <Totales lineas={k.totales} total={k.total} despues={k.pago} />
        <Caja titulo="Observaciones para la fábrica" texto={k.observaciones} campo />
        <Pie lineas={k.pie} />
        {k.marca && <MarcaDeAgua texto={k.marca} />}
      </Page>
    </Document>
  );
}

export const renderizarPedido = (p: PedidoPdf) => renderToBuffer(<DocumentoPedido p={p} />);

export async function pdfPedido(tx: Tx, id: string): Promise<{ numero: number; pdf: Buffer }> {
  // Es la nota con precios: la ruta exige pedidos.importes.ver y clientes.ver (ADR-0023 §8).
  const p = await obtenerPedido(tx, id, { cliente: true, importes: true });
  const c = p.cliente as { nombre: string; rut?: string; contacto?: string | null; telefono?: string | null };
  const datos: PedidoPdf = {
    numero: p.numero, creadoEn: p.creadoEn, estado: p.estado, cotizacionNumero: p.cotizacion?.numero ?? null, notaTienda: p.refExterna,
    cliente: { nombre: c.nombre, rut: c.rut ?? null, contacto: c.contacto ?? null, telefono: c.telefono ?? null },
    direccionDespacho: p.direccionDespacho, medioTransporte: p.medioTransporte, entregaComprometida: p.entregaComprometida, observaciones: p.observaciones,
    items: p.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, cantidad: i.cantidad, faltante: i.faltante, totalLinea: i.totalLinea! })),
    ...p.totales!,
    pago: p.pago.estado === "sin_control" ? null : { pagado: p.pago.pagado!, saldo: p.pago.saldo! },
  };
  return { numero: p.numero, pdf: await renderizarPedido(datos) };
}
