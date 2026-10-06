// Idempotency-Key (API §1, DESIGN §5): una repetición por mala conexión no duplica movimientos.
import { createHash } from "node:crypto";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { idempotencia } from "@/db/esquema/seguridad";
import { ErrorDominio } from "../errores";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORAS = 24;

/**
 * Ejecuta `accion` una sola vez por (clave, usuario). Con el mismo cuerpo devuelve la respuesta guardada;
 * con otro cuerpo, 422. Solo se guardan respuestas que no son error del servidor.
 */
export async function conIdempotencia(clave: string | null, usuarioId: string, cuerpo: string, accion: () => Promise<Response>): Promise<Response> {
  if (!clave || !UUID.test(clave)) throw new ErrorDominio("IDEMPOTENCIA_REQUERIDA", "Falta la cabecera Idempotency-Key (UUID).");
  const hashCuerpo = createHash("sha256").update(cuerpo).digest("hex");
  const donde = and(eq(idempotencia.clave, clave), eq(idempotencia.usuarioId, usuarioId));

  await bd().delete(idempotencia).where(and(donde, lte(idempotencia.expiraEn, sql`now()`)));
  const [previa] = await bd().select().from(idempotencia).where(and(donde, gt(idempotencia.expiraEn, sql`now()`)));
  if (previa) {
    if (previa.hashCuerpo !== hashCuerpo) {
      throw new ErrorDominio("IDEMPOTENCIA_CONFLICTO", "Esta Idempotency-Key ya se usó con otro contenido.");
    }
    const r = previa.estadoHttp === 204 ? new NextResponse(null, { status: 204 }) : NextResponse.json(previa.respuesta, { status: previa.estadoHttp });
    r.headers.set("idempotent-replay", "true");
    return r;
  }

  const respuesta = await accion();
  if (respuesta.status < 500) {
    const texto = await respuesta.clone().text();
    await bd()
      .insert(idempotencia)
      .values({ clave, usuarioId, hashCuerpo, estadoHttp: respuesta.status, respuesta: texto ? JSON.parse(texto) : {}, expiraEn: new Date(Date.now() + HORAS * 3_600_000) })
      .onConflictDoNothing();
  }
  return respuesta;
}
