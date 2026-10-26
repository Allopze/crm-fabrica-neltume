// PDF «Orden de trabajo» de una nota de pedido, para producción (ADR-0023 §7): sin precios, totales, pagos ni datos
// personales del cliente final, armado desde los datos guardados. Sirve para toda nota, también las de cotización.
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import type { Tx } from "@/db/conexion";
import { MARCA } from "@/lib/marca";
import { obtenerPedido } from "../pedidos/consulta";
import { e, MarcaDeAgua, Membrete, Notas, ParaFabrica, Partes, Pie, TablaItems } from "./comun";
import { contenidoOrdenTrabajo, type OrdenTrabajoPdf } from "./contenido";
import { modelosDeArticulos } from "./modelos";

function DocumentoOrden({ o }: { o: OrdenTrabajoPdf }) {
  const k = contenidoOrdenTrabajo(o);
  return (
    // Metadatos sin importes ni cliente: solo el título del documento (ADR-0023 §7).
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={o.creadoEn} modificationDate={o.creadoEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete tipo={k.tipo} numero={k.numero} meta={k.meta} />
        <Partes partes={k.partes} />
        <TablaItems columnas={["En stock", "Por fabricar"]} filas={k.filas} dibujos="plano" casilla />
        <Notas notas={k.notas} />
        <ParaFabrica {...k.paraFabrica} />
        <Pie lineas={[k.pie]} />
        {k.marca && <MarcaDeAgua texto={k.marca} />}
      </Page>
    </Document>
  );
}

export const renderizarOrdenTrabajo = (o: OrdenTrabajoPdf) => renderToBuffer(<DocumentoOrden o={o} />);

export async function pdfOrdenTrabajo(tx: Tx, id: string): Promise<{ numero: number; pdf: Buffer }> {
  const p = await obtenerPedido(tx, id, { cliente: false, importes: false });
  const modelos = await modelosDeArticulos(tx, p.items.map((i) => i.articuloId));
  const o: OrdenTrabajoPdf = {
    numero: p.numero, creadoEn: p.creadoEn, estado: p.estado, cotizacionNumero: p.cotizacion?.numero ?? null, notaTienda: p.refExterna, revisionTienda: p.revisionExterna,
    proyecto: p.proyecto, direccionDespacho: p.direccionDespacho, medioTransporte: p.medioTransporte, entregaComprometida: p.entregaComprometida, observaciones: p.observaciones,
    items: p.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, observacion: i.observacion, revisar: i.revisar,
      referencias: i.referencias.length, cantidad: i.cantidad, reservado: i.reservado, faltante: i.faltante,
      modelo: modelos.get(i.articuloId ?? "")?.modelo ?? null, familia: modelos.get(i.articuloId ?? "")?.familia ?? null })),
  };
  return { numero: p.numero, pdf: await renderizarOrdenTrabajo(o) };
}
