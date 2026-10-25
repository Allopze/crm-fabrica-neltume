// Mensajes `connection.test` de la tienda (ADR-0024; contrato en docs/contratos/prueba-conexion-v1.md) para las pruebas de
// la ruta de recepción. Datos inventados y PDF sintéticos: nunca datos reales de la tienda ni de sus clientes.
import { createHash, randomUUID } from "node:crypto";
import { clavePrueba } from "@/domain/integracion-tienda/conexion";
import { pdf } from "./mensaje";

export interface OpcionesPrueba { eventId?: string; factoryCode?: string; contenido?: Buffer; filename?: string; issuedAt?: string }

/** `connection.test` como lo manda la tienda (`source` = neltume-store), con un PDF que pdfjs puede abrir. */
export async function mensajePruebaTienda(o: OpcionesPrueba = {}) {
  const eventId = o.eventId ?? randomUUID();
  const contenido = o.contenido ?? await pdf([`Prueba de conexión ${eventId.slice(0, 8)}`, "PRUEBA DE CONEXIÓN — no es un pedido", "Enviada por la tienda"]);
  return {
    schemaVersion: "1.0", eventType: "connection.test", eventId, source: "neltume-store", factoryCode: o.factoryCode ?? "PANGUIPULLI",
    issuedAt: o.issuedAt ?? new Date().toISOString(),
    document: {
      filename: o.filename ?? `prueba-conexion-${eventId.slice(0, 8)}.pdf`, mimeType: "application/pdf",
      contentBase64: contenido.toString("base64"), sha256: createHash("sha256").update(contenido).digest("hex"),
    },
  };
}

export const clavePruebaTienda = (m: { eventId: string }) => clavePrueba("neltume-store", m.eventId);
