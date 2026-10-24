// Mensajes de la tienda para las pruebas de la API (ADR-0023; contrato en docs/contratos/pedidos-tienda-v1.md).
// Datos inventados y PDF sintéticos con react-pdf: nunca datos reales de la tienda ni de sus clientes.
import { createHash, randomUUID } from "node:crypto";
import { createElement as h } from "react";
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { firmar } from "@/domain/integracion-tienda/firma";
import { SECRETO_PRUEBA } from "./constantes";

export { RUT_TIENDA_PRUEBA, SECRETO_PRUEBA } from "./constantes";

export async function pdf(lineas: string[]): Promise<Buffer> {
  return renderToBuffer(h(Document, null, h(Page, { size: "A4", style: { padding: 40, fontSize: 10 } }, ...lineas.map((l, i) => h(Text, { key: i }, l)))));
}

const documento = (contenido: Buffer, filename: string) => ({
  filename, mimeType: "application/pdf" as const, contentBase64: contenido.toString("base64"), sha256: createHash("sha256").update(contenido).digest("hex"),
});

export interface OpcionesMensaje {
  sourceOrderId?: string; revision?: number; numero?: string; destino?: string;
  items?: object[]; comercial?: object[]; produccion?: string[]; comercialPdf?: string[];
}

const linea = (n: number, codigo: string, cantidad: number, extra: object = {}) => ({
  lineNumber: n, sourceItemIndex: n - 1, productCode: codigo, catalogReference: `${codigo} · 0,70–0,75 × 2,00 m`, isCustom: false, family: "PUERTA",
  model: "FUY", wood: "PINO OREGON", productType: "PUERTA PANEL", description: `Puerta ${codigo}`, descriptionEdited: false, quantity: cantidad,
  dimensions: { widthMm: 720, heightMm: 2000, lengthMm: null, section: null, measureType: "hoja", requested: "720 × 2000 mm (Hoja)" },
  observations: null, references: [], ...extra,
});
export { linea as lineaTienda };

/** order.ready válido para Panguipulli: 3 FUY-O-2-A en hoja y 2 marcos, con sus dos PDF. */
export async function mensajeListo(o: OpcionesMensaje = {}) {
  const numero = o.numero ?? "577";
  const items = o.items ?? [
    linea(1, "FUY-O-2-A", 3, { observations: "Bisagras a la derecha" }),
    { ...linea(2, "MAR-O-2X4-B", 2), family: "MARCO", model: "MARCO", productType: null, description: "Marco Pino Oregon 2x4 pulg. kit",
      dimensions: { widthMm: null, heightMm: null, lengthMm: 2100, section: "2X4", measureType: "no_especificado", requested: "2x4 pulg. × 2,10 m" } },
  ];
  const comercial = o.comercial ?? (items as { lineNumber: number; quantity: number }[]).map((i) => ({ lineNumber: i.lineNumber, unitPrice: 100000, lineTotal: 100000 * i.quantity }));
  const neto = (comercial as { lineTotal: number | null }[]).reduce((t, l) => t + (l.lineTotal ?? 0), 0);
  return {
    schemaVersion: "1.0", eventType: "order.ready", eventId: randomUUID(), source: "neltume-store",
    sourceOrderId: o.sourceOrderId ?? randomUUID(), sourceOrderRevision: o.revision ?? 1, destinationFactoryCode: o.destino ?? "PANGUIPULLI",
    issuedAt: new Date().toISOString(),
    order: {
      orderNumber: numero, orderDate: new Date().toISOString(), quoteNumber: 329, approvedBy: "Vendedora 1", issuedBy: "Vendedora 1",
      customer: { name: "Cliente Final de Prueba", taxId: "12.345.678-5", businessActivity: "Construcción", phone: "+56 9 1111 2222", address: "Calle Falsa 123", commune: "Valdivia", project: "Casa Lago" },
      delivery: { address: "Camino a Neltume km 3", carrier: "Starken", destination: null, committedDelivery: "Semana del 16 de noviembre" },
      items, notes: "Entregar en dos etapas.", relatedOrders: [{ factoryCode: "SANTIAGO", orderNumber: "59", itemCount: 1 }],
      commercial: { currency: "CLP", basis: "factory_price_net", lines: comercial, subtotal: neto, discount: 0, net: neto, vatRate: 0.19, vat: Math.round(neto * 0.19), total: Math.round(neto * 1.19) },
    },
    documents: {
      commercial: documento(await pdf(o.comercialPdf ?? [`Nota de pedido N° ${numero}`, "Fábrica Panguipulli", "Cliente Final de Prueba", "Precio fábrica $100.000"]), `nota-pedido-panguipulli-${numero}-comercial.pdf`),
      production: documento(await pdf(o.produccion ?? [`Nota de pedido N° ${numero}`, "Orden de trabajo", "FUY-O-2-A × 3"]), `nota-pedido-panguipulli-${numero}-produccion.pdf`),
    },
  };
}

export function mensajeAnulacion(sourceOrderId: string, revision: number, numero = "577") {
  return {
    schemaVersion: "1.0", eventType: "order.cancelled", eventId: randomUUID(), source: "neltume-store", sourceOrderId, sourceOrderRevision: revision,
    destinationFactoryCode: "PANGUIPULLI", issuedAt: new Date().toISOString(),
    cancellation: { orderNumber: numero, quoteNumber: 329, cancelledAt: new Date().toISOString(), cancelledBy: "Vendedora 1", reason: "El cliente desistió" },
  };
}

export const claveDe = (m: { sourceOrderId: string; destinationFactoryCode: string; sourceOrderRevision: number }) =>
  `neltume-store:${m.sourceOrderId}:${m.destinationFactoryCode}:${m.sourceOrderRevision}`;

/** Cabeceras firmadas como las manda la tienda (`ahora` permite probar la ventana de ±300 s). */
export function cabecerasFirmadas(cuerpo: Uint8Array, clave: string, opciones: { secreto?: string; ahora?: number; tipo?: string } = {}) {
  return { ...firmar(opciones.secreto ?? SECRETO_PRUEBA, cuerpo, opciones.ahora), "x-idempotency-key": clave, "content-type": opciones.tipo ?? "application/json" };
}
