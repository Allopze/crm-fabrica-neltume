// PDF de la nota de pedido desde la copia congelada (ADR-0004; REQ-COT-8.1).
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import type { Tx } from "@/db/conexion";
import { MARCA } from "@/lib/marca";
import { obtenerPedido } from "../pedidos/consulta";
import { Datos, e, Membrete, Pie, TablaItems, Totales } from "./comun";
import { contenidoPedido, type PedidoPdf } from "./contenido";

function DocumentoPedido({ p }: { p: PedidoPdf }) {
  const k = contenidoPedido(p);
  return (
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={p.creadoEn} modificationDate={p.creadoEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete titulo={k.titulo} fechas={k.fechas} />
        <Datos pares={k.datos} />
        <TablaItems columnas={["Código", "Descripción", "Cant.", "Por fabricar", "Total"]} filas={k.filas} />
        <Totales lineas={k.totales} total={k.total} />
        <Pie lineas={k.pie} />
      </Page>
    </Document>
  );
}

export async function pdfPedido(tx: Tx, id: string): Promise<{ numero: number; pdf: Buffer }> {
  const p = await obtenerPedido(tx, id, true);
  const c = p.cliente as { nombre: string; rut?: string; contacto?: string | null; telefono?: string | null };
  const datos: PedidoPdf = {
    numero: p.numero, creadoEn: p.creadoEn, estado: p.estado, cotizacionNumero: p.cotizacion.numero,
    cliente: { nombre: c.nombre, rut: c.rut ?? null, contacto: c.contacto ?? null, telefono: c.telefono ?? null },
    direccionDespacho: p.direccionDespacho, medioTransporte: p.medioTransporte,
    items: p.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad, faltante: i.faltante, totalLinea: Number(i.totalLinea) })),
    subtotal: Number(p.cotizacion.subtotal), descuento: Number(p.cotizacion.descuento), iva: Number(p.cotizacion.iva), total: Number(p.cotizacion.total),
  };
  return { numero: p.numero, pdf: await renderToBuffer(<DocumentoPedido p={datos} />) };
}
