// Contenido del PDF de cotización, separado del render para poder probarlo (REQ-COT-4.2; TESTING U `pdf.contenido`).
import { clp, fecha } from "@/lib/formato";

export const EMPRESA = { nombre: "Neltume", bajada: "Fábrica de puertas", contacto: "Neltume.co@gmail.com" };
export const NOTA_FLETE = "Valores puestos en fábrica, flete aparte.";

export interface CotizacionPdf {
  numero: number;
  aprobadaEn: Date;
  vigenciaHasta: string;
  listaVersion: number | null;
  cliente: { nombre: string; rut: string | null; comuna: string | null; contacto: string | null } | null;
  items: { codigo: string | null; descripcion: string; cantidad: number; precioUnitario: number; totalLinea: number }[];
  subtotal: number; descuento: number; descuentoMotivo: string | null; iva: number; total: number;
}

/** Fecha calendario en Santiago (dd-mm-aaaa), independiente de la zona del servidor. */
export function fechaSantiago(d: Date): string {
  return fecha(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(d));
}

export function contenidoCotizacion(c: CotizacionPdf) {
  return {
    titulo: `Cotización N.º ${c.numero}`,
    fechas: `Fecha ${fechaSantiago(c.aprobadaEn)} · Válida hasta ${fecha(c.vigenciaHasta)}`,
    cliente: c.cliente && [
      ["Cliente", c.cliente.nombre], ["RUT", c.cliente.rut ?? "—"], ["Contacto", c.cliente.contacto ?? "—"], ["Comuna", c.cliente.comuna ?? "—"],
    ] as [string, string][],
    lineas: c.items.map((i) => ({
      codigo: i.codigo ?? "A pedido", descripcion: i.descripcion, cantidad: String(i.cantidad),
      unitario: clp(i.precioUnitario), total: clp(i.totalLinea),
    })),
    totales: [
      ["Subtotal neto", clp(c.subtotal)],
      ...(c.descuento > 0 ? [[`Descuento (${c.descuentoMotivo ?? "sin motivo"})`, `−${clp(c.descuento)}`]] : []),
      ["IVA 19 %", clp(c.iva)],
    ] as [string, string][],
    total: clp(c.total),
    pie: [
      `${NOTA_FLETE} Precios de la lista v${c.listaVersion ?? "—"}, congelados al aprobar.`,
      `Las medidas especiales se fabrican a pedido. Consultas: ${EMPRESA.contacto}`,
    ],
  };
}
