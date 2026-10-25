import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { integracion } from "@/domain/auth/integracion";
import { clavePrueba, MAX_CUERPO_PRUEBA, mensajePruebaRecibida, verificarPdfPrueba } from "@/domain/integracion-tienda/conexion";
import { guardarPruebaRecibida } from "@/domain/integracion-tienda/conexion-datos";
import { ORIGEN_TIENDA, VERSION_CONTRATO } from "@/domain/integracion-tienda/contrato";
import { sha256Hex } from "@/domain/integracion-tienda/documentos";
import { ErrorIntegracion } from "@/domain/integracion-tienda/errores";

// Todo lo que no sea POST es 405 (contrato §3). Next responde 405 a los demás métodos, pero a OPTIONS responde 204 si nadie lo declara.
export const OPTIONS = () => new Response(null, { status: 405, headers: { allow: "POST" } });

// POST /api/integrations/neltume/connection-tests — prueba de conexión de la tienda: un PDF firmado que no crea pedidos
// ni mueve stock (ADR-0024; contrato en docs/contratos/prueba-conexion-v1.md, §3 fija el orden). 2xx solo tras el commit.
export const POST = integracion(async ({ req, cuerpo, config, ip, correlacionId }) => {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(cuerpo));
  } catch {
    throw new ErrorIntegracion(400, "schema_invalid", "El cuerpo no es JSON válido en UTF-8.");
  }
  const version = (json as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== VERSION_CONTRATO) throw new ErrorIntegracion(422, "unsupported_schema_version", `Versión de contrato no admitida: se espera ${VERSION_CONTRATO}.`);
  const m = mensajePruebaRecibida.parse(json);
  if (req.headers.get("x-idempotency-key") !== clavePrueba(ORIGEN_TIENDA, m.eventId)) {
    throw new ErrorIntegracion(400, "schema_invalid", "X-Idempotency-Key no corresponde al evento.");
  }
  if (m.factoryCode !== config.fabrica) throw new ErrorIntegracion(422, "destination_mismatch", `Esta fábrica es ${config.fabrica}.`);

  const pdf = await verificarPdfPrueba(m.document);
  const r = await bd().transaction((tx) => guardarPruebaRecibida(tx, { mensaje: m, hashCuerpo: sha256Hex(cuerpo), pdf, ip, correlacionId }));
  return NextResponse.json({ status: r.status, eventId: m.eventId, receiver: "neltume-factory", receivedAt: new Date().toISOString() }, { status: r.http });
}, { maxCuerpo: MAX_CUERPO_PRUEBA, tipos: ["application/json"] });
