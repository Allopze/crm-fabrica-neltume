// Contenido del PDF de cotización, separado del render para poder probarlo (REQ-COT-4.2; TESTING U `pdf.contenido`).
import { clp, fecha, fechaHora, fechaLarga, nombrePropio } from "@/lib/formato";
import { type DatosEmpresa, datosEmpresa } from "@/lib/marca";
import { formatearRut } from "../rut";

/** Bloque de partes del documento (Cliente, Obra, Despacho…): etiqueta chica, título y pares clave-valor (estilo común v1 §5). */
export interface Parte { etiqueta: string; titulo: string; pares: [string, string][] }
type Marca = "ANULADA" | "PRUEBA" | null;
/** Lo que el PDF dice de un ítem «a pedido» sin precio fijado: nunca «$0» (estilo común v1 §5). */
const POR_DEFINIR = "Por definir";

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

const isoSantiago = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(d);
/** Fecha calendario en Santiago (dd-mm-aaaa), independiente de la zona del servidor. */
export const fechaSantiago = (d: Date): string => fecha(isoSantiago(d));
/** La misma fecha en palabras, solo para el encabezado de los PDF: «25 de octubre de 2026» (ADR-0025 D7). */
export const fechaLargaSantiago = (d: Date): string => fechaLarga(isoSantiago(d));
/** Título del archivo PDF: «Cotización N.º 9 · Neltume». */
const tituloPdf = (tipo: string, numero?: string) => [tipo, numero].filter(Boolean).join(" ") + " · Neltume";

export function contenidoCotizacion(c: CotizacionPdf, empresa: DatosEmpresa = datosEmpresa()) {
  return {
    tipo: "Cotización", numero: `N.º ${c.numero}`, titulo: tituloPdf("Cotización", `N.º ${c.numero}`),
    meta: [["Fecha", fechaLargaSantiago(c.aprobadaEn)], ["Válida hasta", fecha(c.vigenciaHasta)]] as [string, string][],
    partes: c.cliente ? [{
      etiqueta: "Cliente", titulo: c.cliente.nombre,
      pares: [["RUT", c.cliente.rut ? formatearRut(c.cliente.rut) : "—"], ["Contacto", c.cliente.contacto ?? "—"], ["Comuna", c.cliente.comuna ?? "—"]],
    }] satisfies Parte[] : [],
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

/** Despacho de una nota: dirección (o «Retira en fábrica»), transporte y entrega comprometida. */
const despacho = (d: { direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null }): Parte => ({
  etiqueta: "Despacho", titulo: d.direccionDespacho ?? "Retira en fábrica",
  pares: [["Transporte", d.medioTransporte ?? "—"], ["Entrega", d.entregaComprometida ? fecha(d.entregaComprometida) : "Por comprometer"]],
});

export function contenidoPedido(p: PedidoPdf) {
  const cancelada = p.estado === "cancelada";
  return {
    tipo: "Nota de pedido", numero: `N.º ${p.numero}`, titulo: tituloPdf("Nota de pedido", `N.º ${p.numero}`),
    marca: (cancelada ? "ANULADA" : null) as Marca,
    meta: [
      ["Fecha", fechaLargaSantiago(p.creadoEn)],
      p.cotizacionNumero ? ["Cotización", `N.º ${p.cotizacionNumero}`] : ["Nota de la tienda", `N.º ${p.notaTienda}`],
      ...(cancelada ? [["Estado", "Cancelada"]] : []),
    ] as [string, string][],
    partes: [
      { etiqueta: "Cliente", titulo: p.cliente.nombre, pares: [["RUT", p.cliente.rut ? formatearRut(p.cliente.rut) : "—"], ["Contacto", p.cliente.contacto ?? "—"], ["Teléfono", p.cliente.telefono ?? "—"]] },
      despacho(p),
    ] satisfies Parte[],
    filas: p.items.map((i) => [i.codigo ?? "A pedido", i.medidaSolicitada ? `${i.descripcion}\nMedida solicitada: ${i.medidaSolicitada}` : i.descripcion,
      String(i.cantidad), i.faltante ? String(i.faltante) : "—", !i.codigo && i.totalLinea === 0 ? POR_DEFINIR : clp(i.totalLinea)]),
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
  const origen: [string, string] = o.cotizacionNumero ? ["Cotización", `N.º ${o.cotizacionNumero}`]
    : ["Nota de la tienda", `N.º ${o.notaTienda}${o.revisionTienda > 1 ? ` (rev. ${o.revisionTienda})` : ""}`];
  const cancelada = o.estado === "cancelada";
  return {
    tipo: "Orden de trabajo", numero: `N.º ${o.numero}`, titulo: tituloPdf("Orden de trabajo", `N.º ${o.numero}`),
    marca: (cancelada ? "ANULADA" : null) as Marca,
    meta: [["Fecha", fechaLargaSantiago(o.creadoEn)], origen, ...(cancelada ? [["Estado", "Cancelada"]] : [])] as [string, string][],
    partes: [{ etiqueta: "Obra", titulo: o.proyecto ?? "Sin proyecto", pares: [] }, despacho(o)] satisfies Parte[],
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

export interface PruebaConexionPdf { codigo: string; fabrica: string; creadaEn: Date }

/**
 * PDF de la prueba de conexión con la tienda (ADR-0024 §5): rotulado como prueba y con datos inventados. No lleva
 * precios, clientes ni nada de la fábrica: solo lo necesario para reconocerlo al otro lado (el código corto del evento).
 */
export function contenidoPruebaConexion(p: PruebaConexionPdf) {
  return {
    // Sin número de documento: en su lugar va el código corto del evento. Fecha y hora de Chile en vez de la fecha en palabras.
    tipo: "Prueba de conexión", numero: p.codigo, titulo: tituloPdf("Prueba de conexión"), marca: "PRUEBA" as const,
    meta: [["Fecha y hora", fechaHora(p.creadaEn)]] as [string, string][],
    rotulo: "PRUEBA DE CONEXIÓN — no es un pedido",
    partes: [{ etiqueta: "Emisor", titulo: `Fábrica ${nombrePropio(p.fabrica)}`, pares: [] }, { etiqueta: "Destino", titulo: "La tienda", pares: [["Código", p.codigo]] }] satisfies Parte[],
    filas: [
      ["PRUEBA-1", "Puerta de ejemplo: dato inventado", "1", "0", "1"],
      ["PRUEBA-2", "Marco de ejemplo: dato inventado", "2", "0", "2"],
    ],
    nota: `Este PDF viaja firmado de la fábrica a la tienda para comprobar la conexión. Si lo ves en la pantalla de la tienda con el código ${p.codigo}, el envío funcionó.`,
    pie: ["Documento de prueba: no crea notas de pedido, no reserva stock y no lleva precios.", `Código de la prueba: ${p.codigo}.`],
  };
}

/** Nombre del archivo descargado, con la marca: «Neltume - Cotización N.º 9.pdf» (y una versión ASCII para navegadores antiguos). */
export function nombreArchivoPdf(documento: "Cotización" | "Nota de pedido" | "Orden de trabajo", numero: number, sufijo = "") {
  const nombre = `Neltume - ${documento} N.º ${numero}${sufijo}.pdf`;
  const ascii = `Neltume-${documento.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, "-")}-${numero}${sufijo.normalize("NFD").replace(/[^A-Za-z0-9.-]+/g, "-")}.pdf`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}
