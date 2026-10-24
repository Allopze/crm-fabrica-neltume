// PDF «Orden de trabajo» de una nota de pedido, para producción (ADR-0023 §7): sin precios, totales, pagos ni datos
// personales del cliente final, armado desde los datos guardados. Sirve para toda nota, también las de cotización.
import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import type { Tx } from "@/db/conexion";
import { MARCA } from "@/lib/marca";
import { obtenerPedido } from "../pedidos/consulta";
import { Datos, e, Membrete, Pie, TablaItems, TENUE } from "./comun";
import { contenidoOrdenTrabajo, type OrdenTrabajoPdf } from "./contenido";

function DocumentoOrden({ o }: { o: OrdenTrabajoPdf }) {
  const k = contenidoOrdenTrabajo(o);
  return (
    // Metadatos sin importes ni cliente: solo el título del documento (ADR-0023 §7).
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={o.creadoEn} modificationDate={o.creadoEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete titulo={k.titulo} fechas={k.fechas} />
        <Datos pares={k.datos} />
        <TablaItems columnas={["Código", "Descripción", "Cant.", "En stock", "Por fabricar"]} filas={k.filas} casilla />
        <View style={e.observaciones} wrap={false}>
          <Text style={{ fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: TENUE }}>Observaciones para la fábrica</Text>
          <Text style={{ marginTop: 4 }}>{k.observaciones ?? ""}</Text>
        </View>
        <Pie lineas={k.pie} />
      </Page>
    </Document>
  );
}

export const renderizarOrdenTrabajo = (o: OrdenTrabajoPdf) => renderToBuffer(<DocumentoOrden o={o} />);

export async function pdfOrdenTrabajo(tx: Tx, id: string): Promise<{ numero: number; pdf: Buffer }> {
  const p = await obtenerPedido(tx, id, { cliente: false, importes: false });
  const o: OrdenTrabajoPdf = {
    numero: p.numero, creadoEn: p.creadoEn, estado: p.estado, cotizacionNumero: p.cotizacion?.numero ?? null, notaTienda: p.refExterna, revisionTienda: p.revisionExterna,
    proyecto: p.proyecto, direccionDespacho: p.direccionDespacho, medioTransporte: p.medioTransporte, entregaComprometida: p.entregaComprometida, observaciones: p.observaciones,
    items: p.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, observacion: i.observacion, revisar: i.revisar,
      referencias: i.referencias.length, cantidad: i.cantidad, reservado: i.reservado, faltante: i.faltante })),
  };
  return { numero: p.numero, pdf: await renderizarOrdenTrabajo(o) };
}
