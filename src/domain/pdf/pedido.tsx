// PDF de la nota de pedido desde la copia congelada (ADR-0004; REQ-COT-8.1).
import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import type { Tx } from "@/db/conexion";
import { MARCA } from "@/lib/marca";
import { obtenerPedido } from "../pedidos/consulta";
import { Datos, e, Membrete, Pie, TablaItems, TENUE, Totales } from "./comun";
import { contenidoPedido, type PedidoPdf } from "./contenido";

function DocumentoPedido({ p }: { p: PedidoPdf }) {
  const k = contenidoPedido(p);
  return (
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={p.creadoEn} modificationDate={p.creadoEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete titulo={k.titulo} fechas={k.fechas} />
        <Datos pares={k.datos} />
        <TablaItems columnas={["Código", "Descripción", "Cant.", "Por fabricar", "Total"]} filas={k.filas} casilla />
        <Totales lineas={k.totales} total={k.total} />
        <View style={e.observaciones} wrap={false}>
          <Text style={{ fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: TENUE }}>Observaciones para la fábrica</Text>
          <Text style={{ marginTop: 4 }}>{k.observaciones ?? ""}</Text>
        </View>
        <Pie lineas={k.pie} />
      </Page>
    </Document>
  );
}

export const renderizarPedido = (p: PedidoPdf) => renderToBuffer(<DocumentoPedido p={p} />);

export async function pdfPedido(tx: Tx, id: string): Promise<{ numero: number; pdf: Buffer }> {
  const p = await obtenerPedido(tx, id, true);
  const c = p.cliente as { nombre: string; rut?: string; contacto?: string | null; telefono?: string | null };
  const datos: PedidoPdf = {
    numero: p.numero, creadoEn: p.creadoEn, estado: p.estado, cotizacionNumero: p.cotizacion?.numero ?? null, notaTienda: p.refExterna,
    cliente: { nombre: c.nombre, rut: c.rut ?? null, contacto: c.contacto ?? null, telefono: c.telefono ?? null },
    direccionDespacho: p.direccionDespacho, medioTransporte: p.medioTransporte, entregaComprometida: p.entregaComprometida, observaciones: p.observaciones,
    items: p.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, cantidad: i.cantidad, faltante: i.faltante, totalLinea: Number(i.totalLinea) })),
    ...p.totales,
  };
  return { numero: p.numero, pdf: await renderizarPedido(datos) };
}
