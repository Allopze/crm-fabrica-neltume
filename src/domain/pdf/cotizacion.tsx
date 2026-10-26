// PDF de cotización con @react-pdf/renderer desde los datos congelados (ADR-0004). Fuentes de la marca incrustadas: sin red.
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cliente } from "@/db/esquema/comercial";
import { MARCA } from "@/lib/marca";
import { obtenerCotizacion } from "../cotizaciones/consulta";
import { ErrorDominio } from "../errores";
import { abonoPct } from "../pedidos/pagos";
import { e, Membrete, Partes, Pie, TablaItems, Totales } from "./comun";
import { type CotizacionPdf, contenidoCotizacion } from "./contenido";

function DocumentoCotizacion({ c }: { c: CotizacionPdf }) {
  const k = contenidoCotizacion(c);
  return (
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={c.aprobadaEn} modificationDate={c.aprobadaEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete tipo={k.tipo} numero={k.numero} meta={k.meta} />
        {k.partes.length > 0 && <Partes partes={k.partes} />}
        <TablaItems columnas={["Código", "Descripción", "Cant.", "Precio unit.", "Total"]}
          filas={k.lineas.map((l) => [l.codigo, l.descripcion, l.cantidad, l.unitario, l.total])} />
        <Totales lineas={k.totales} total={k.total} />
        <Pie lineas={k.pie} />
      </Page>
    </Document>
  );
}

export const renderizarCotizacion = (c: CotizacionPdf) => renderToBuffer(<DocumentoCotizacion c={c} />);

/** Lee la cotización congelada y la convierte en PDF. 409 NO_APROBADA si no está aprobada (REQ-COT-4.3). */
export async function pdfCotizacion(tx: Tx, id: string): Promise<{ numero: number; pdf: Buffer }> {
  const c = await obtenerCotizacion(tx, id, true);
  if (c.estado !== "aprobada" && c.estado !== "aceptada") throw new ErrorDominio("NO_APROBADA", "Solo una cotización aprobada tiene PDF.");
  const [cli] = c.clienteId ? await tx.select({ tipo: cliente.tipo }).from(cliente).where(eq(cliente.id, c.clienteId)) : [];
  const tienda = cli?.tipo === "tienda";
  const datos: CotizacionPdf = {
    numero: c.numero, aprobadaEn: c.aprobadaEn!, vigenciaHasta: c.vigenciaHasta!, listaVersion: c.lista.usada,
    cliente: c.cliente && { nombre: c.cliente.nombre, rut: c.cliente.rut ?? null, comuna: c.cliente.comuna ?? null, contacto: c.cliente.contacto ?? null },
    items: c.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, cantidad: i.cantidad, precioUnitario: Number(i.precioUnitario), totalLinea: Number(i.totalLinea) })),
    subtotal: Number(c.subtotal), descuento: Number(c.descuento), descuentoMotivo: c.descuentoMotivo, iva: Number(c.iva), total: Number(c.total),
    abonoPct: tienda ? null : await abonoPct(tx),
  };
  return { numero: c.numero, pdf: await renderizarCotizacion(datos) };
}
