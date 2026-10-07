// Idempotency-Key (API §1, DESIGN §5): una repetición por mala conexión no duplica movimientos.
import { createHash } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { bd } from "@/db/conexion";
import { idempotencia } from "@/db/esquema/seguridad";
import { ErrorDominio } from "../errores";

/**
 * Huella del cuerpo. En multipart el boundary cambia en cada envío: se usa el contenido de los campos
 * y archivos, para que un reintento legítimo con el mismo archivo no dé un falso conflicto.
 */
export async function huellaCuerpo(req: Request): Promise<ArrayBuffer> {
  const copia = req.clone();
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) return copia.arrayBuffer();
  const form = await copia.formData();
  const partes: Buffer[] = [];
  for (const [nombre, v] of [...form.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    partes.push(Buffer.from(`${nombre}=`), typeof v === "string" ? Buffer.from(v) : Buffer.from(await v.arrayBuffer()), Buffer.from("\n"));
  }
  const total = Buffer.concat(partes);
  return total.buffer.slice(total.byteOffset, total.byteOffset + total.byteLength) as ArrayBuffer;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORAS = 24;
/** Estado de una clave reservada cuya acción aún no termina. */
const EN_CURSO = 0;
/** Una reserva sin respuesta vence a los 2 min (proceso caído): la limpieza de vencidas la libera (DESIGN §5). */
const RESERVA_MS = 2 * 60_000;

/**
 * Ejecuta `accion` una sola vez por (clave, usuario), también ante envíos simultáneos (auditoría H-06): la clave se
 * reserva antes de ejecutar. Con el mismo método, ruta y cuerpo devuelve la respuesta guardada; mientras la primera
 * sigue en curso, 409 IDEMPOTENCIA_EN_CURSO; con otro cuerpo u otra ruta, 422. Si la acción falla (excepción o 5xx),
 * la clave se libera para poder reintentar.
 */
export async function conIdempotencia(clave: string | null, usuarioId: string, ambito: string, cuerpo: ArrayBuffer, accion: () => Promise<Response>): Promise<Response> {
  if (!clave || !UUID.test(clave)) throw new ErrorDominio("IDEMPOTENCIA_REQUERIDA", "Falta la cabecera Idempotency-Key (UUID).");
  const hashCuerpo = createHash("sha256").update(`${ambito}\n`).update(Buffer.from(cuerpo)).digest("hex");
  const donde = and(eq(idempotencia.clave, clave), eq(idempotencia.usuarioId, usuarioId));

  await bd().delete(idempotencia).where(and(donde, lte(idempotencia.expiraEn, sql`now()`)));
  const reservada = await bd().insert(idempotencia)
    .values({ clave, usuarioId, hashCuerpo, estadoHttp: EN_CURSO, respuesta: {}, expiraEn: new Date(Date.now() + RESERVA_MS) })
    .onConflictDoNothing()
    .returning({ clave: idempotencia.clave });

  if (!reservada.length) {
    const [previa] = await bd().select().from(idempotencia).where(donde);
    if (previa && previa.hashCuerpo !== hashCuerpo) {
      throw new ErrorDominio("IDEMPOTENCIA_CONFLICTO", "Esta Idempotency-Key ya se usó con otro contenido.");
    }
    if (!previa || previa.estadoHttp === EN_CURSO) {
      throw new ErrorDominio("IDEMPOTENCIA_EN_CURSO", "Este envío ya se está procesando. Espera un momento y vuelve a consultar.");
    }
    const r = previa.estadoHttp === 204 ? new NextResponse(null, { status: 204 }) : NextResponse.json(previa.respuesta, { status: previa.estadoHttp });
    r.headers.set("idempotent-replay", "true");
    return r;
  }

  const liberar = () => bd().delete(idempotencia).where(and(donde, eq(idempotencia.estadoHttp, EN_CURSO)));
  let respuesta: Response;
  try {
    respuesta = await accion();
  } catch (e) {
    await liberar();
    throw e;
  }
  if (respuesta.status >= 500) {
    await liberar();
    return respuesta;
  }
  const texto = await respuesta.clone().text();
  await bd().update(idempotencia)
    .set({ estadoHttp: respuesta.status, respuesta: texto ? JSON.parse(texto) : {}, expiraEn: new Date(Date.now() + HORAS * 3_600_000) })
    .where(and(donde, eq(idempotencia.estadoHttp, EN_CURSO)));
  return respuesta;
}
