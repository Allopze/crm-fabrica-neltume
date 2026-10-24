// Contrato v1 con el cotizador de la tienda (ADR-0023). Fuente de verdad: tienda_puertas/Cotizador,
// src/servidor/integracion-contrato.ts; docs/contratos/pedidos-tienda-v1.md anota lo propio de la fábrica.
// Estos esquemas lo replican campo a campo y son estrictos: un campo no esperado es un 400.
import { z } from "zod";

export const VERSION_CONTRATO = "1.0";
export const ORIGEN_TIENDA = "neltume-store";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const texto = (max: number) => z.string().max(max);
const textoNulo = (max: number) => z.string().max(max).nullable();
const pesos = z.number().int().min(0).max(10_000_000_000);

export const MIME_REFERENCIA = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

const referencia = z.strictObject({
  attachmentId: sha256,
  filename: texto(200),
  mimeType: z.enum(MIME_REFERENCIA),
  sizeBytes: z.number().int().positive(),
});

const item = z.strictObject({
  lineNumber: z.number().int().positive(),
  sourceItemIndex: z.number().int().nonnegative().nullable(),
  productCode: texto(80),
  catalogReference: textoNulo(200),
  isCustom: z.boolean(),
  family: z.enum(["PUERTA", "MARCO", "PIEZAS_T", "MOLDURA"]),
  model: texto(300),
  wood: textoNulo(300),
  productType: textoNulo(300),
  description: texto(600),
  descriptionEdited: z.boolean(),
  quantity: z.number().int().positive(),
  dimensions: z.strictObject({
    widthMm: z.number().int().positive().nullable(),
    heightMm: z.number().int().positive().nullable(),
    lengthMm: z.number().int().positive().nullable(),
    section: textoNulo(80),
    measureType: z.enum(["hoja", "vano", "no_especificado"]).nullable(),
    requested: textoNulo(200),
  }),
  observations: textoNulo(2000),
  references: z.array(referencia).max(10),
});

const comercial = z.strictObject({
  currency: z.literal("CLP"),
  basis: z.literal("factory_price_net"),
  lines: z.array(z.strictObject({ lineNumber: z.number().int().positive(), unitPrice: pesos.nullable(), lineTotal: pesos.nullable() })).max(100),
  subtotal: pesos,
  discount: pesos,
  net: pesos,
  vatRate: z.number().min(0).max(1),
  vat: pesos,
  total: pesos,
});

const pedido = z.strictObject({
  orderNumber: texto(20),
  orderDate: z.iso.datetime(),
  quoteNumber: z.number().int().positive(),
  approvedBy: textoNulo(200),
  issuedBy: textoNulo(200),
  customer: z.strictObject({
    name: textoNulo(300), taxId: textoNulo(300), businessActivity: textoNulo(300), phone: textoNulo(300),
    address: textoNulo(300), commune: textoNulo(300), project: textoNulo(300),
  }),
  delivery: z.strictObject({ address: textoNulo(300), carrier: textoNulo(120), destination: textoNulo(300), committedDelivery: textoNulo(120) }),
  items: z.array(item).min(1).max(100),
  notes: texto(4000),
  relatedOrders: z.array(z.strictObject({ factoryCode: texto(40), orderNumber: texto(20), itemCount: z.number().int().nonnegative() })).max(10),
  commercial: comercial,
});

const cancelacion = z.strictObject({
  orderNumber: texto(20),
  quoteNumber: z.number().int().positive().nullable(),
  cancelledAt: z.iso.datetime(),
  cancelledBy: textoNulo(200),
  reason: textoNulo(300),
});

const documento = z.strictObject({ filename: texto(200), mimeType: z.literal("application/pdf"), contentBase64: z.string().min(1), sha256 });

export const mensajeTienda = z.strictObject({
  schemaVersion: z.literal(VERSION_CONTRATO),
  eventType: z.enum(["order.ready", "order.cancelled"]),
  eventId: z.uuid(),
  source: z.literal(ORIGEN_TIENDA),
  sourceOrderId: z.string().min(1).max(100),
  sourceOrderRevision: z.number().int().positive(),
  destinationFactoryCode: texto(40),
  issuedAt: z.iso.datetime(),
  order: pedido.optional(),
  cancellation: cancelacion.optional(),
  documents: z.strictObject({ commercial: documento, production: documento }).optional(),
}).refine((m) => (m.eventType === "order.ready" ? !!m.order && !!m.documents && !m.cancellation : !!m.cancellation && !m.order && !m.documents), {
  message: "order.ready lleva order y documents; order.cancelled, solo cancellation.",
});

export type MensajeTienda = z.infer<typeof mensajeTienda>;
export type PedidoTienda = NonNullable<MensajeTienda["order"]>;
export type ItemTienda = PedidoTienda["items"][number];
export type ReferenciaTienda = ItemTienda["references"][number];

/** Clave de idempotencia que manda la tienda: estable por pedido y revisión en todos sus reintentos. */
export const clavePedido = (m: Pick<MensajeTienda, "sourceOrderId" | "destinationFactoryCode" | "sourceOrderRevision">) =>
  `${ORIGEN_TIENDA}:${m.sourceOrderId}:${m.destinationFactoryCode}:${m.sourceOrderRevision}`;
export const claveAdjunto = (sha: string) => `${ORIGEN_TIENDA}:attachment:${sha}`;

/**
 * Lo que la fábrica conserva del mensaje (ADR-0023 D1, REQ-COT-8.9): sin documentos, sin lo comercial (va aparte) y,
 * del cliente final, solo el proyecto. Nombre, RUT, giro, teléfono, dirección y quién aprobó o emitió no se guardan.
 */
export function payloadConservado(m: MensajeTienda) {
  const sobre = {
    schemaVersion: m.schemaVersion, eventType: m.eventType, eventId: m.eventId, source: m.source, sourceOrderId: m.sourceOrderId,
    sourceOrderRevision: m.sourceOrderRevision, destinationFactoryCode: m.destinationFactoryCode, issuedAt: m.issuedAt,
  };
  if (m.cancellation) return { ...sobre, cancellation: { ...m.cancellation, cancelledBy: null } };
  const o = m.order!;
  return {
    ...sobre,
    order: {
      orderNumber: o.orderNumber, orderDate: o.orderDate, quoteNumber: o.quoteNumber, customer: { project: o.customer.project },
      delivery: o.delivery, items: o.items, notes: o.notes, relatedOrders: o.relatedOrders,
    },
  };
}
export type PayloadConservado = ReturnType<typeof payloadConservado>;
