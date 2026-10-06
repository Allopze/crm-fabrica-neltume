// Contenido del PDF de cotización, separado del render para poder probarlo (REQ-COT-4.2; TESTING U `pdf.contenido`).
import { clp, fecha } from "@/lib/formato";
import { type DatosEmpresa, datosEmpresa } from "@/lib/marca";

/** Líneas del bloque de la empresa bajo el logo; solo las que estén configuradas (NELTUME_EMPRESA_*). */
export function lineasEmpresa(d: DatosEmpresa): string[] {
  const contacto = [d.telefono && `Tel. ${d.telefono}`, d.web].filter(Boolean).join(" · ");
  return [d.nombre, d.rut && `RUT ${d.rut}`, d.direccion, contacto].filter((x): x is string => Boolean(x));
}
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

export function contenidoCotizacion(c: CotizacionPdf, empresa: DatosEmpresa = datosEmpresa()) {
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
      `Las medidas especiales se fabrican a pedido. Consultas: ${empresa.correo}`,
    ],
  };
}

export interface PedidoPdf {
  numero: number; creadoEn: Date; estado: string; cotizacionNumero: number;
  cliente: { nombre: string; rut: string | null; contacto: string | null; telefono: string | null };
  direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null; observaciones: string | null;
  items: { codigo: string | null; descripcion: string; medidaSolicitada: string | null; cantidad: number; faltante: number; totalLinea: number }[];
  subtotal: number; descuento: number; iva: number; total: number;
}

export function contenidoPedido(p: PedidoPdf) {
  return {
    titulo: `Nota de pedido N.º ${p.numero}${p.estado === "cancelada" ? " (cancelada)" : ""}`,
    fechas: `Fecha ${fechaSantiago(p.creadoEn)} · Cotización N.º ${p.cotizacionNumero}`,
    datos: [
      ["Cliente", p.cliente.nombre], ["RUT", p.cliente.rut ?? "—"], ["Contacto", p.cliente.contacto ?? "—"], ["Teléfono", p.cliente.telefono ?? "—"],
      ["Despacho", p.direccionDespacho ?? "Retira en fábrica"], ["Transporte", p.medioTransporte ?? "—"],
      ["Entrega", p.entregaComprometida ? fecha(p.entregaComprometida) : "por comprometer"],
    ] as [string, string][],
    filas: p.items.map((i) => [i.codigo ?? "A pedido", i.medidaSolicitada ? `${i.descripcion}\nMedida solicitada: ${i.medidaSolicitada}` : i.descripcion,
      String(i.cantidad), i.faltante ? String(i.faltante) : "—", clp(i.totalLinea)]),
    observaciones: p.observaciones,
    totales: [
      ["Subtotal neto", clp(p.subtotal)],
      ...(p.descuento > 0 ? [["Descuento", `−${clp(p.descuento)}`]] : []),
      ["IVA 19 %", clp(p.iva)],
    ] as [string, string][],
    total: clp(p.total),
    pie: [`${NOTA_FLETE} Precios congelados de la cotización N.º ${p.cotizacionNumero}.`, "\"Por fabricar\": unidades sin stock al confirmar el pedido."],
  };
}
