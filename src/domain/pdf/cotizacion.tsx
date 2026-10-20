// PDF de cotización con @react-pdf/renderer desde los datos congelados (ADR-0004). Fuentes estándar: sin red.
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { inArray } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { articulo } from "@/db/esquema/catalogo";
import { MARCA } from "@/lib/marca";
import { obtenerCotizacion } from "../cotizaciones/consulta";
import { ErrorDominio } from "../errores";
import { abonoPct } from "../pedidos/pagos";
import { Datos, e, Membrete, Pie, TablaItems, Totales } from "./comun";
import { type CotizacionPdf, contenidoCotizacion } from "./contenido";

function DocumentoCotizacion({ c }: { c: CotizacionPdf }) {
  const k = contenidoCotizacion(c);
  return (
    <Document title={k.titulo} author={MARCA.nombre} creator={MARCA.nombre} producer={MARCA.nombre} creationDate={c.aprobadaEn} modificationDate={c.aprobadaEn}>
      <Page size="A4" style={e.pagina}>
        <Membrete titulo={k.titulo} fechas={k.fechas} />
        {k.cliente && <Datos pares={k.cliente} />}
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
  const ids = c.items.flatMap((i) => (i.articuloId ? [i.articuloId] : []));
  const codigos = new Map(ids.length ? (await tx.select({ id: articulo.id, codigo: articulo.codigo }).from(articulo).where(inArray(articulo.id, ids))).map((a) => [a.id, a.codigo]) : []);
  const datos: CotizacionPdf = {
    numero: c.numero, aprobadaEn: c.aprobadaEn!, vigenciaHasta: c.vigenciaHasta!, listaVersion: c.lista.usada,
    cliente: c.cliente && { nombre: c.cliente.nombre, rut: c.cliente.rut ?? null, comuna: c.cliente.comuna ?? null, contacto: c.cliente.contacto ?? null },
    items: c.items.map((i) => ({ codigo: i.articuloId ? codigos.get(i.articuloId) ?? null : null, descripcion: i.descripcion, medidaSolicitada: i.medidaSolicitada, cantidad: i.cantidad, precioUnitario: Number(i.precioUnitario), totalLinea: Number(i.totalLinea) })),
    subtotal: Number(c.subtotal), descuento: Number(c.descuento), descuentoMotivo: c.descuentoMotivo, iva: Number(c.iva), total: Number(c.total),
    abonoPct: await abonoPct(tx),
  };
  return { numero: c.numero, pdf: await renderizarCotizacion(datos) };
}
