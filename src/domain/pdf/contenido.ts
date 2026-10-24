// Contenido del PDF de cotización, separado del render para poder probarlo (REQ-COT-4.2; TESTING U `pdf.contenido`).
import { clp, fecha } from "@/lib/formato";
import { type DatosEmpresa, datosEmpresa } from "@/lib/marca";
import { formatearRut } from "../rut";

/** Líneas del bloque de la empresa bajo el logo; solo las que estén configuradas (NELTUME_EMPRESA_*). */
export function lineasEmpresa(d: DatosEmpresa): string[] {
  const contacto = [d.telefono && `Tel. ${d.telefono}`, d.web].filter(Boolean).join(" · ");
  return [d.nombre, d.rut && `RUT ${formatearRut(d.rut)}`, d.direccion, contacto].filter((x): x is string => Boolean(x));
}
export const NOTA_FLETE = "Valores puestos en fábrica, flete aparte.";

/** Condición de pago impresa en la cotización (REQ-COT-8.16, ADR-0020). */
export const condicionPago = (abonoPct: number) => abonoPct > 0 && abonoPct < 100
  ? `Condición de pago: ${abonoPct} % de abono al confirmar y saldo antes del despacho o retiro.`
  : "Condición de pago: total antes del despacho o retiro.";

export interface CotizacionPdf {
  numero: number;
  aprobadaEn: Date;
  vigenciaHasta: string;
  listaVersion: number | null;
  cliente: { nombre: string; rut: string | null; comuna: string | null; contacto: string | null } | null;
  items: { codigo: string | null; descripcion: string; medidaSolicitada?: string | null; cantidad: number; precioUnitario: number; totalLinea: number }[];
  subtotal: number; descuento: number; descuentoMotivo: string | null; iva: number; total: number;
  /** Nulo para la tienda, a la que no se le exige abono ni saldo (REQ-COT-8.17): no se imprime la condición. */
  abonoPct: number | null;
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
      ["Cliente", c.cliente.nombre], ["RUT", c.cliente.rut ? formatearRut(c.cliente.rut) : "—"], ["Contacto", c.cliente.contacto ?? "—"], ["Comuna", c.cliente.comuna ?? "—"],
    ] as [string, string][],
    lineas: c.items.map((i) => ({
      codigo: i.codigo ?? "A pedido", descripcion: i.medidaSolicitada ? `${i.descripcion}\nMedida solicitada: ${i.medidaSolicitada}` : i.descripcion, cantidad: String(i.cantidad),
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
      ...(c.abonoPct === null ? [] : [condicionPago(c.abonoPct)]),
    ],
  };
}

export interface PedidoPdf {
  numero: number; creadoEn: Date; estado: string; cotizacionNumero: number | null; notaTienda: string | null;
  cliente: { nombre: string; rut: string | null; contacto: string | null; telefono: string | null };
  direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null; observaciones: string | null;
  items: { codigo: string | null; descripcion: string; medidaSolicitada: string | null; cantidad: number; faltante: number; totalLinea: number }[];
  subtotal: number; descuento: number; iva: number; total: number;
  /** Lo pagado y el saldo (REQ-COT-8.16); nulo en notas que no exigen pago y no tienen pagos. */
  pago: { pagado: number; saldo: number } | null;
}

export function contenidoPedido(p: PedidoPdf) {
  return {
    titulo: `Nota de pedido N.º ${p.numero}${p.estado === "cancelada" ? " (cancelada)" : ""}`,
    fechas: `Fecha ${fechaSantiago(p.creadoEn)} · ${p.cotizacionNumero ? `Cotización N.º ${p.cotizacionNumero}` : `Nota de la tienda N.º ${p.notaTienda}`}`,
    datos: [
      ["Cliente", p.cliente.nombre], ["RUT", p.cliente.rut ? formatearRut(p.cliente.rut) : "—"], ["Contacto", p.cliente.contacto ?? "—"], ["Teléfono", p.cliente.telefono ?? "—"],
      ["Despacho", p.direccionDespacho ?? "Retira en fábrica"], ["Transporte", p.medioTransporte ?? "—"],
      ["Entrega", p.entregaComprometida ? fecha(p.entregaComprometida) : "Por comprometer"],
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
    pago: p.pago ? [["Pagado", clp(p.pago.pagado)], ["Saldo", clp(p.pago.saldo)]] as [string, string][] : [],
    pie: [`${NOTA_FLETE} ${p.cotizacionNumero ? `Precios congelados de la cotización N.º ${p.cotizacionNumero}.` : "Precios de venta de la lista vigente al confirmar el pedido."}`, "\"Por fabricar\": unidades sin stock al confirmar el pedido."],
  };
}

export interface OrdenTrabajoPdf {
  numero: number; creadoEn: Date; estado: string; cotizacionNumero: number | null; notaTienda: string | null; revisionTienda: number;
  proyecto: string | null; direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null; observaciones: string | null;
  items: { codigo: string | null; descripcion: string; medidaSolicitada: string | null; observacion: string | null; revisar: string | null; referencias: number;
    cantidad: number; reservado: number; faltante: number }[];
}

/**
 * Orden de trabajo de la nota de pedido, para producción (ADR-0023 §7): sin precios, totales ni pagos, y sin datos
 * personales del cliente final. Sale de los datos guardados, nunca del PDF de la tienda.
 */
export function contenidoOrdenTrabajo(o: OrdenTrabajoPdf) {
  const origen = o.cotizacionNumero ? `Cotización N.º ${o.cotizacionNumero}`
    : `Nota de la tienda N.º ${o.notaTienda}${o.revisionTienda > 1 ? ` (rev. ${o.revisionTienda})` : ""}`;
  return {
    titulo: `Orden de trabajo · Nota N.º ${o.numero}${o.estado === "cancelada" ? " (cancelada)" : ""}`,
    fechas: `Fecha ${fechaSantiago(o.creadoEn)} · ${origen}`,
    datos: [
      ["Proyecto", o.proyecto ?? "—"], ["Despacho", o.direccionDespacho ?? "Retira en fábrica"], ["Transporte", o.medioTransporte ?? "—"],
      ["Entrega", o.entregaComprometida ? fecha(o.entregaComprometida) : "Por comprometer"],
    ] as [string, string][],
    filas: o.items.map((i) => [
      i.codigo ?? "A pedido",
      [i.descripcion, i.medidaSolicitada && `Medida solicitada: ${i.medidaSolicitada}`, i.observacion, i.referencias ? `Referencias del cliente: ${i.referencias} (en la app)` : null,
        i.revisar && `REVISAR: ${i.revisar}`].filter(Boolean).join("\n"),
      String(i.cantidad), i.codigo ? String(i.reservado) : "—", i.codigo ? (i.faltante ? String(i.faltante) : "—") : String(i.cantidad),
    ]),
    observaciones: o.observaciones,
    pie: ["Documento para producción: no lleva precios.", "\"En stock\": unidades ya reservadas para esta nota; \"Por fabricar\": lo que falta."],
  };
}

/** Nombre del archivo descargado, con la marca: «Neltume - Cotización N.º 9.pdf» (y una versión ASCII para navegadores antiguos). */
export function nombreArchivoPdf(documento: "Cotización" | "Nota de pedido" | "Orden de trabajo", numero: number, sufijo = "") {
  const nombre = `Neltume - ${documento} N.º ${numero}${sufijo}.pdf`;
  const ascii = `Neltume-${documento.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, "-")}-${numero}${sufijo.normalize("NFD").replace(/[^A-Za-z0-9.-]+/g, "-")}.pdf`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}
