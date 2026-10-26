// Contenido de los PDF, separado del render para poder probarlo (REQ-COT-4.2, 4.9–4.11; TESTING U `pdf.contenido`).
import { clp, fecha, fechaHora, fechaLarga, nombrePropio } from "@/lib/formato";
import { type DatosEmpresa, datosEmpresa } from "@/lib/marca";
import { formatearRut } from "../rut";
import { type Dibujo, dibujoDe, type Medida, medidaPedida } from "./dibujos";

/** Bloque de partes del documento (Cliente, Obra, Despacho…): etiqueta chica, título y pares clave-valor (estilo común v1 §5). */
export interface Parte { etiqueta: string; titulo: string; pares: [string, string][] }
type Marca = "ANULADA" | "PRUEBA" | null;
type FamiliaModelo = "puerta" | "accesorio" | null;
/** Lo que el PDF dice de un ítem «a pedido» sin precio fijado: nunca «$0» (estilo común v1 §5). */
const POR_DEFINIR = "Por definir";

/** Datos de la empresa para el pie, solo los configurados (NELTUME_EMPRESA_*): «Neltume.co · RUT … · dirección · Tel. … · web · correo». */
export function textoPie(d: DatosEmpresa): string {
  return [d.nombre, d.rut && `RUT ${formatearRut(d.rut)}`, d.direccion, d.telefono && `Tel. ${d.telefono}`, d.web, d.correo].filter(Boolean).join(" · ");
}
export const NOTA_FLETE = "Valores puestos en fábrica, flete aparte.";
/** Qué son las cotas del plano (nota y orden de trabajo). */
const NOTA_COTAS = "Las cotas del plano son la medida pedida de cada puerta, en milímetros (de hoja o de vano, como indica la línea).";

/** Condición de pago impresa en la cotización (REQ-COT-8.16, ADR-0020). */
export const condicionPago = (abonoPct: number) => abonoPct > 0 && abonoPct < 100
  ? `Condición de pago: ${abonoPct} % de abono al confirmar y saldo antes del despacho o retiro.`
  : "Condición de pago: total antes del despacho o retiro.";

/**
 * Una línea de la tabla común (estilo común v1 §5): la celda de producto, de arriba abajo, su dibujo (miniatura o plano con
 * cotas) y las columnas que siguen a «Cant.», que son de cada documento.
 */
export interface FilaTabla {
  n: number;
  titulo: string;
  /** «Medida solicitada: …», «Observación: …», y en la orden «Referencias del cliente» y «REVISAR: …». */
  medida: string | null;
  observacion: string | null;
  detalle: string | null;
  revisar: string | null;
  /** Nulo en una línea «a pedido»: no hay código que mostrar. */
  codigo: string | null;
  dibujo: Dibujo | null;
  cotas: Medida | null;
  cantidad: string;
  importes: string[];
}
/** Lo que se sabe de una línea para armar su celda de producto y elegir su dibujo. */
interface LineaDeProducto {
  codigo: string | null; descripcion: string; medidaSolicitada?: string | null; observacion?: string | null;
  /** Modelo y familia del artículo; nulos en una línea «a pedido» sin artículo. */
  modelo: string | null; familia: FamiliaModelo;
}

/** Celda de producto y dibujo de una línea; las cotas solo en la nota y la orden, para puertas con ancho y alto pedidos y un dibujo con hoja. */
function celda(l: LineaDeProducto, conCotas: boolean): Omit<FilaTabla, "n" | "detalle" | "revisar" | "cantidad" | "importes"> {
  const medida = medidaPedida(l.medidaSolicitada ?? null);
  const dibujo = dibujoDe({ modelo: l.modelo, familia: l.familia, descripcion: l.descripcion, medida });
  return {
    titulo: l.descripcion, codigo: l.codigo, dibujo,
    medida: l.medidaSolicitada ? `Medida solicitada: ${l.medidaSolicitada}` : null,
    observacion: l.observacion ? `Observación: ${l.observacion}` : null,
    cotas: conCotas && medida && dibujo?.hoja ? medida : null,
  };
}

export interface CotizacionPdf {
  numero: number;
  aprobadaEn: Date;
  /** Quién la aprobó, si se sabe (se imprime en el encabezado). */
  aprobadaPor?: string | null;
  vigenciaHasta: string;
  listaVersion: number | null;
  cliente: { nombre: string; rut: string | null; comuna: string | null; contacto: string | null } | null;
  items: { codigo: string | null; descripcion: string; medidaSolicitada?: string | null; cantidad: number; precioUnitario: number; totalLinea: number;
    modelo?: string | null; familia?: FamiliaModelo }[];
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
    meta: [["Fecha", fechaLargaSantiago(c.aprobadaEn)], ["Válida hasta", fecha(c.vigenciaHasta)], ...(c.aprobadaPor ? [["Aprobada por", c.aprobadaPor]] : [])] as [string, string][],
    partes: c.cliente ? [{
      etiqueta: "Cliente", titulo: c.cliente.nombre,
      pares: [["RUT", c.cliente.rut ? formatearRut(c.cliente.rut) : "—"], ["Contacto", c.cliente.contacto ?? "—"], ["Comuna", c.cliente.comuna ?? "—"]],
    }] satisfies Parte[] : [],
    filas: c.items.map((i, k): FilaTabla => ({
      ...celda({ ...i, modelo: i.modelo ?? null, familia: i.familia ?? null }, false), n: k + 1, detalle: null, revisar: null,
      cantidad: String(i.cantidad), importes: [clp(i.precioUnitario), clp(i.totalLinea)],
    })),
    totales: [
      ["Subtotal neto", clp(c.subtotal)],
      ...(c.descuento > 0 ? [[`Descuento (${c.descuentoMotivo ?? "sin motivo"})`, `−${clp(c.descuento)}`]] : []),
      ["IVA 19 %", clp(c.iva)],
    ] as [string, string][],
    total: clp(c.total),
    notas: [
      `${NOTA_FLETE} Precios de la lista v${c.listaVersion ?? "—"}, congelados al aprobar.`,
      "Las medidas especiales se fabrican a pedido.",
      ...(c.abonoPct === null ? [] : [condicionPago(c.abonoPct)]),
    ],
    pie: textoPie(empresa),
  };
}

export interface PedidoPdf {
  numero: number; creadoEn: Date; estado: string; cotizacionNumero: number | null; notaTienda: string | null;
  cliente: { nombre: string; rut: string | null; contacto: string | null; telefono: string | null };
  direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null; observaciones: string | null;
  items: { codigo: string | null; descripcion: string; medidaSolicitada: string | null; observacion?: string | null; cantidad: number; faltante: number; totalLinea: number;
    modelo?: string | null; familia?: FamiliaModelo }[];
  subtotal: number; descuento: number; iva: number; total: number;
  /** Lo pagado y el saldo (REQ-COT-8.16); nulo en notas que no exigen pago y no tienen pagos. */
  pago: { pagado: number; saldo: number } | null;
}

const entrega = (e: string | null) => (e ? fecha(e) : "Por comprometer");
/** Despacho de una nota: dirección (o «Retira en fábrica»), transporte y entrega comprometida. */
const despacho = (d: { direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null }): Parte => ({
  etiqueta: "Despacho", titulo: d.direccionDespacho ?? "Retira en fábrica",
  pares: [["Transporte", d.medioTransporte ?? "—"], ["Entrega", entrega(d.entregaComprometida)]],
});
/** Bloque «Para fábrica» de la nota y la orden: entrega, observaciones y dos firmas (etiquetas de la fábrica, estilo común v1 §6). */
const paraFabrica = (d: { entregaComprometida: string | null; observaciones: string | null }) =>
  ({ entrega: entrega(d.entregaComprometida), observaciones: d.observaciones, firmas: ["Aprobado por", "Recibido por la fábrica"] as [string, string] });

export function contenidoPedido(p: PedidoPdf, empresa: DatosEmpresa = datosEmpresa()) {
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
    filas: p.items.map((i, k): FilaTabla => ({
      ...celda({ ...i, modelo: i.modelo ?? null, familia: i.familia ?? null }, true), n: k + 1, detalle: null, revisar: null,
      cantidad: String(i.cantidad), importes: [i.faltante ? String(i.faltante) : "—", !i.codigo && i.totalLinea === 0 ? POR_DEFINIR : clp(i.totalLinea)],
    })),
    paraFabrica: paraFabrica(p),
    totales: [
      ["Subtotal neto", clp(p.subtotal)],
      ...(p.descuento > 0 ? [["Descuento", `−${clp(p.descuento)}`]] : []),
      ["IVA 19 %", clp(p.iva)],
    ] as [string, string][],
    total: clp(p.total),
    pago: p.pago ? [["Pagado", clp(p.pago.pagado)], ["Saldo", clp(p.pago.saldo)]] as [string, string][] : [],
    notas: [
      `${NOTA_FLETE} ${p.cotizacionNumero ? `Precios congelados de la cotización N.º ${p.cotizacionNumero}.` : "Precios de venta de la lista vigente al confirmar el pedido."}`,
      NOTA_COTAS,
      "\"Por fabricar\": unidades sin stock al confirmar el pedido. Las líneas «Por definir» son pedidos especiales sin precio fijado: no están en el total.",
    ],
    pie: textoPie(empresa),
  };
}

export interface OrdenTrabajoPdf {
  numero: number; creadoEn: Date; estado: string; cotizacionNumero: number | null; notaTienda: string | null; revisionTienda: number;
  proyecto: string | null; direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null; observaciones: string | null;
  items: { codigo: string | null; descripcion: string; medidaSolicitada: string | null; observacion: string | null; revisar: string | null; referencias: number;
    cantidad: number; reservado: number; faltante: number; modelo?: string | null; familia?: FamiliaModelo }[];
}

/**
 * Orden de trabajo de la nota de pedido, para producción (ADR-0023 §7): sin precios, totales ni pagos, y sin datos
 * personales del cliente final. Sale de los datos guardados, nunca del PDF de la tienda.
 */
export function contenidoOrdenTrabajo(o: OrdenTrabajoPdf, empresa: DatosEmpresa = datosEmpresa()) {
  const origen: [string, string] = o.cotizacionNumero ? ["Cotización", `N.º ${o.cotizacionNumero}`]
    : ["Nota de la tienda", `N.º ${o.notaTienda}${o.revisionTienda > 1 ? ` (rev. ${o.revisionTienda})` : ""}`];
  const cancelada = o.estado === "cancelada";
  return {
    tipo: "Orden de trabajo", numero: `N.º ${o.numero}`, titulo: tituloPdf("Orden de trabajo", `N.º ${o.numero}`),
    marca: (cancelada ? "ANULADA" : null) as Marca,
    meta: [["Fecha", fechaLargaSantiago(o.creadoEn)], origen, ...(cancelada ? [["Estado", "Cancelada"]] : [])] as [string, string][],
    partes: [{ etiqueta: "Obra", titulo: o.proyecto ?? "Sin proyecto", pares: [] }, despacho(o)] satisfies Parte[],
    filas: o.items.map((i, k): FilaTabla => ({
      ...celda({ ...i, modelo: i.modelo ?? null, familia: i.familia ?? null }, true), n: k + 1,
      detalle: i.referencias ? `Referencias del cliente: ${i.referencias} (en la app)` : null,
      revisar: i.revisar ? `REVISAR: ${i.revisar}` : null,
      cantidad: String(i.cantidad), importes: [i.codigo ? String(i.reservado) : "—", i.codigo ? (i.faltante ? String(i.faltante) : "—") : String(i.cantidad)],
    })),
    paraFabrica: paraFabrica(o),
    notas: ["Documento para producción: no lleva precios.", NOTA_COTAS, "\"En stock\": unidades ya reservadas para esta nota; \"Por fabricar\": lo que falta."],
    pie: textoPie(empresa),
  };
}

export interface PruebaConexionPdf { codigo: string; fabrica: string; creadaEn: Date }

/**
 * PDF de la prueba de conexión con la tienda (ADR-0024 §5): rotulado como prueba y con datos inventados. No lleva
 * precios, clientes ni nada de la fábrica: solo lo necesario para reconocerlo al otro lado (el código corto del evento).
 */
export function contenidoPruebaConexion(p: PruebaConexionPdf, empresa: DatosEmpresa = datosEmpresa()) {
  const fila = (n: number, codigo: string, titulo: string, cantidad: string): FilaTabla =>
    ({ n, titulo, codigo, medida: null, observacion: null, detalle: null, revisar: null, dibujo: null, cotas: null, cantidad, importes: ["0", cantidad] });
  return {
    // Sin número de documento: en su lugar va el código corto del evento. Fecha y hora de Chile en vez de la fecha en palabras.
    tipo: "Prueba de conexión", numero: p.codigo, titulo: tituloPdf("Prueba de conexión"), marca: "PRUEBA" as const,
    meta: [["Fecha y hora", fechaHora(p.creadaEn)]] as [string, string][],
    rotulo: "PRUEBA DE CONEXIÓN — no es un pedido",
    partes: [{ etiqueta: "Emisor", titulo: `Fábrica ${nombrePropio(p.fabrica)}`, pares: [] }, { etiqueta: "Destino", titulo: "La tienda", pares: [["Código", p.codigo]] }] satisfies Parte[],
    filas: [fila(1, "PRUEBA-1", "Puerta de ejemplo: dato inventado", "1"), fila(2, "PRUEBA-2", "Marco de ejemplo: dato inventado", "2")],
    nota: `Este PDF viaja firmado de la fábrica a la tienda para comprobar la conexión. Si lo ves en la pantalla de la tienda con el código ${p.codigo}, el envío funcionó.`,
    notas: ["Documento de prueba: no crea notas de pedido, no reserva stock y no lleva precios.", `Código de la prueba: ${p.codigo}.`],
    pie: textoPie(empresa),
  };
}

/** Nombre del archivo descargado, con la marca: «Neltume - Cotización N.º 9.pdf» (y una versión ASCII para navegadores antiguos). */
export function nombreArchivoPdf(documento: "Cotización" | "Nota de pedido" | "Orden de trabajo", numero: number, sufijo = "") {
  const nombre = `Neltume - ${documento} N.º ${numero}${sufijo}.pdf`;
  const ascii = `Neltume-${documento.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ /g, "-")}-${numero}${sufijo.normalize("NFD").replace(/[^A-Za-z0-9.-]+/g, "-")}.pdf`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}
