import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { recepcionTienda } from "@/db/esquema/integracion";
import { integracion } from "@/domain/auth/integracion";
import { clavePedido, mensajeTienda, VERSION_CONTRATO } from "@/domain/integracion-tienda/contrato";
import { sha256Hex, verificarDocumento } from "@/domain/integracion-tienda/documentos";
import { ErrorIntegracion } from "@/domain/integracion-tienda/nota";
import { recibirMensaje } from "@/domain/integracion-tienda/recibir";

const respuesta = (http: number, status: "accepted" | "duplicate", eventId: string, factoryOrderId?: string) =>
  NextResponse.json({ status, eventId, ...(factoryOrderId ? { factoryOrderId } : {}), receivedAt: new Date().toISOString() }, { status: http });

// POST /api/integrations/neltume/orders — nota de pedido, revisión o anulación de la tienda, firmada (ADR-0023;
// contrato en docs/contratos/pedidos-tienda-v1.md). 2xx solo después del commit.
export const POST = integracion(async ({ req, cuerpo, config }) => {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(cuerpo));
  } catch {
    throw new ErrorIntegracion(400, "schema_invalid", "El cuerpo no es JSON válido en UTF-8.");
  }
  const version = (json as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== VERSION_CONTRATO) throw new ErrorIntegracion(422, "unsupported_schema_version", `Versión de contrato no admitida: se espera ${VERSION_CONTRATO}.`);
  const m = mensajeTienda.parse(json);
  const clave = req.headers.get("x-idempotency-key") ?? "";
  if (clave !== clavePedido(m)) throw new ErrorIntegracion(400, "schema_invalid", "X-Idempotency-Key no corresponde al pedido y su revisión.");
  if (m.destinationFactoryCode !== config.fabrica) throw new ErrorIntegracion(422, "destination_mismatch", `Esta fábrica es ${config.fabrica}.`);

  // Un reintento de algo ya guardado responde rápido, sin volver a leer los PDF (la transacción lo vuelve a comprobar).
  const hashCuerpo = sha256Hex(cuerpo);
  const [previa] = await bd().select({ notaPedidoId: recepcionTienda.notaPedidoId }).from(recepcionTienda)
    .where(and(eq(recepcionTienda.idempotenciaClave, clave), eq(recepcionTienda.hashCuerpo, hashCuerpo)));
  if (previa) return respuesta(200, "duplicate", m.eventId, previa.notaPedidoId ?? undefined);

  const documentos = m.documents && {
    comercial: await verificarDocumento(m.documents.commercial, "comercial", m.order!.orderNumber),
    produccion: await verificarDocumento(m.documents.production, "produccion", m.order!.orderNumber),
  };
  const r = await bd().transaction((tx) => recibirMensaje(tx, m, { clave, hashCuerpo, clienteRut: config.clienteRut, documentos }));
  return respuesta(r.http, r.status, m.eventId, r.factoryOrderId);
}, { maxCuerpo: 20 * 1024 * 1024, tipos: ["application/json"] });
