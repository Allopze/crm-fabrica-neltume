import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { adjuntoTienda } from "@/db/esquema/integracion";
import { registrarAuditoria } from "@/domain/auditoria";
import { integracion } from "@/domain/auth/integracion";
import { claveAdjunto, MIME_REFERENCIA } from "@/domain/integracion-tienda/contrato";
import { coincideTipo, MAX_ADJUNTO_BYTES, sha256Hex } from "@/domain/integracion-tienda/documentos";
import { actorIntegracion, ErrorIntegracion } from "@/domain/integracion-tienda/nota";

// PUT /api/integrations/neltume/attachments/:sha256 — foto o croquis del cliente, antes del pedido que lo nombra
// (contrato §2). Se guarda por su sha256; repetirlo no hace nada. Solo inserción.
export const PUT = integracion<{ sha256: string }>(async ({ req, params, cuerpo, tipo }) => {
  const sha = params.sha256;
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new ErrorIntegracion(400, "schema_invalid", "El sha256 de la ruta debe ser hexadecimal en minúsculas.");
  if (req.headers.get("x-idempotency-key") !== claveAdjunto(sha)) throw new ErrorIntegracion(400, "schema_invalid", "X-Idempotency-Key no corresponde al adjunto.");
  if (sha256Hex(cuerpo) !== sha) throw new ErrorIntegracion(422, "attachment_hash_mismatch", "El sha256 del contenido no coincide con la ruta.");
  if (!coincideTipo(cuerpo, tipo)) throw new ErrorIntegracion(422, "attachment_type_mismatch", `El contenido no es ${tipo}.`);
  const nuevo = await bd().transaction(async (tx) => {
    const [fila] = await tx.insert(adjuntoTienda).values({ sha256: sha, mime: tipo, bytes: cuerpo.length, contenido: Buffer.from(cuerpo) })
      .onConflictDoNothing().returning({ sha256: adjuntoTienda.sha256 });
    if (fila) {
      await registrarAuditoria(tx, { actor: await actorIntegracion(tx), accion: "recibir adjunto de la tienda", recurso: "adjunto_tienda", recursoId: sha,
        resultado: "ok", origen: "api", despues: { mime: tipo, bytes: cuerpo.length } });
    }
    return Boolean(fila);
  });
  return NextResponse.json({ status: nuevo ? "accepted" : "duplicate", attachmentId: sha }, { status: nuevo ? 201 : 200 });
}, { maxCuerpo: MAX_ADJUNTO_BYTES, tipos: MIME_REFERENCIA });
