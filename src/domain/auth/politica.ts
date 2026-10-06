// Punto único de autorización en el backend (SECURITY §2). Todo route handler se exporta envuelto
// en `conPermiso` o `publico`; un test estructural lo exige (T0.12).
import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { bd } from "@/db/conexion";
import { registro } from "@/lib/registro";
import { registrarAuditoria } from "../auditoria";
import { ESTADO_HTTP, ErrorDominio, type CodigoError } from "../errores";
import { conIdempotencia, huellaCuerpo } from "./idempotencia";
import type { Permiso } from "./permisos";
import { type SesionActiva, validarSesion } from "./sesiones";

export const COOKIE_SESION = "neltume_sesion";
const MUTANTES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Cuerpo máximo por defecto (ADR-0011): 1 MB. Las rutas que reciben archivos declaran el suyo. */
export const MAX_CUERPO = 1024 * 1024;
/** Excel del catálogo y PDF de la nota de la tienda: archivo de hasta 5 MB más el sobre multipart. */
export const MAX_CUERPO_ARCHIVO = 6 * 1024 * 1024;

export interface ContextoBase<P> {
  req: NextRequest;
  params: P;
  correlacionId: string;
  ip?: string;
  userAgent?: string;
}
export interface ContextoAutenticado<P> extends ContextoBase<P> {
  sesion: SesionActiva;
  actor: { tipo: "usuario"; id: string; ip?: string; userAgent?: string };
}

type Manejador<C> = (ctx: C) => Promise<Response>;
type Ruta<P> = (req: NextRequest, segmento: { params: Promise<P> }) => Promise<Response>;

export function respuestaError(codigo: CodigoError, mensaje: string, correlacionId: string, detalles?: unknown): NextResponse {
  return NextResponse.json(
    { error: { codigo, mensaje, ...(detalles === undefined ? {} : { detalles }), correlacion_id: correlacionId } },
    { status: ESTADO_HTTP[codigo], headers: { "x-correlacion-id": correlacionId } },
  );
}

function contextoBase<P>(req: NextRequest, params: P, correlacionId = randomUUID()): ContextoBase<P> {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  return { req, params, correlacionId, ip, userAgent: req.headers.get("user-agent") ?? undefined };
}

/**
 * Acota el cuerpo sin leer de más (ADR-0011; antes lo hacía Caddy). Con `Content-Length` se decide sin leer nada. Sin
 * él (envío por trozos; `cloudflared` puede reenviar así), se lee contando bytes y se corta al pasar el máximo; lo
 * leído se entrega al handler como una petición nueva con el mismo método, URL y cabeceras.
 */
async function acotarCuerpo(req: NextRequest, max: number, correlacionId: string): Promise<NextRequest | NextResponse> {
  const grande = () => respuestaError("CUERPO_GRANDE", `El envío supera ${Math.round(max / 1024 / 1024)} MB.`, correlacionId);
  const largo = req.headers.get("content-length");
  if (largo !== null) {
    const n = Number(largo);
    if (!Number.isInteger(n) || n < 0) return respuestaError("VALIDACION", "Content-Length inválido.", correlacionId);
    return n > max ? grande() : req;
  }
  if (!req.body) return req;
  const partes: Uint8Array[] = [];
  let total = 0;
  const lector = req.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => undefined);
      return grande();
    }
    partes.push(value);
  }
  return new NextRequest(req.url, { method: req.method, headers: req.headers, body: Buffer.concat(partes) });
}

async function ejecutar<C extends ContextoBase<unknown>>(ctx: C, manejador: Manejador<C>, actorId?: string): Promise<Response> {
  try {
    const r = await manejador(ctx);
    r.headers.set("x-correlacion-id", ctx.correlacionId);
    return r;
  } catch (e) {
    // REQ-ADM-3.5: una mutación que falla se audita aunque su transacción se haya revertido.
    if (actorId && MUTANTES.has(ctx.req.method)) {
      const codigo = e instanceof ErrorDominio ? e.codigo : e instanceof ZodError ? "VALIDACION" : "INTERNO";
      await registrarAuditoria(bd(), {
        actor: { tipo: "usuario", id: actorId, ip: ctx.ip, userAgent: ctx.userAgent },
        accion: `${ctx.req.method} ${ctx.req.nextUrl.pathname}`, recurso: "api", despues: { codigo },
        resultado: "error", origen: "web", correlacionId: ctx.correlacionId,
      }).catch((err) => registro.error("no se pudo auditar el error", { correlacion_id: ctx.correlacionId, error: err }));
    }
    if (e instanceof ErrorDominio) return respuestaError(e.codigo, e.message, ctx.correlacionId, e.detalles);
    if (e instanceof ZodError) {
      return respuestaError("VALIDACION", "Datos inválidos", ctx.correlacionId, e.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })));
    }
    registro.error("error no controlado en ruta", { correlacion_id: ctx.correlacionId, ruta: ctx.req.nextUrl.pathname, metodo: ctx.req.method, error: e });
    return respuestaError("INTERNO", "Ocurrió un error inesperado. Usa el código de correlación para soporte.", ctx.correlacionId);
  }
}

async function auditarDenegacion(ctx: ContextoBase<unknown>, motivo: CodigoError, actorId?: string): Promise<void> {
  await registrarAuditoria(bd(), {
    actor: { tipo: actorId ? "usuario" : "visitante", id: actorId, ip: ctx.ip, userAgent: ctx.userAgent },
    accion: `${ctx.req.method} ${ctx.req.nextUrl.pathname}`,
    recurso: "api",
    despues: { motivo },
    resultado: "denegado",
    origen: "web",
    correlacionId: ctx.correlacionId,
  });
}

function csrfValido(enviado: string | null, esperado: string): boolean {
  if (!enviado) return false;
  const a = Buffer.from(enviado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Exige sesión válida, CSRF en mutaciones y el o los permisos indicados ("sesion" = solo autenticado).
 * Con `idempotente`, exige Idempotency-Key y no repite la acción (API §1).
 * Con `ocultar`, la falta de permiso responde el mismo 404 que un recurso inexistente (anti-IDOR, REQ-COT-10.2);
 * la denegación se audita igual. `maxCuerpo` (por defecto 1 MB) acota el cuerpo antes de leerlo (ADR-0011).
 */
export function conPermiso<P = Record<string, never>>(
  permiso: Permiso | Permiso[] | "sesion",
  manejador: Manejador<ContextoAutenticado<P>>,
  opciones: { idempotente?: boolean; ocultar?: string; maxCuerpo?: number } = {},
): Ruta<P> {
  return async (peticion, segmento) => {
    const correlacionId = randomUUID();
    const acotada = await acotarCuerpo(peticion, opciones.maxCuerpo ?? MAX_CUERPO, correlacionId);
    if (acotada instanceof NextResponse) return acotada;
    const req = acotada;
    const base = contextoBase(req, await segmento.params, correlacionId);
    const sesion = await validarSesion(req.cookies.get(COOKIE_SESION)?.value);
    if (!sesion) {
      await auditarDenegacion(base, "NO_AUTENTICADO");
      return respuestaError("NO_AUTENTICADO", "Debes iniciar sesión.", base.correlacionId);
    }
    if (MUTANTES.has(req.method) && !csrfValido(req.headers.get("x-csrf-token"), sesion.csrf)) {
      await auditarDenegacion(base, "CSRF", sesion.usuario.id);
      return respuestaError("CSRF", "Token de seguridad inválido. Recarga la página.", base.correlacionId);
    }
    const requeridos = permiso === "sesion" ? [] : Array.isArray(permiso) ? permiso : [permiso];
    if (!requeridos.every((p) => sesion.permisos.has(p))) {
      await auditarDenegacion(base, "SIN_PERMISO", sesion.usuario.id);
      if (opciones.ocultar) return respuestaError("NO_ENCONTRADO", opciones.ocultar, base.correlacionId);
      return respuestaError("SIN_PERMISO", "No tienes permiso para esta acción.", base.correlacionId);
    }
    const actor = { tipo: "usuario" as const, id: sesion.usuario.id, ip: base.ip, userAgent: base.userAgent };
    const ctx = { ...base, sesion, actor };
    if (!opciones.idempotente) return ejecutar(ctx, manejador, sesion.usuario.id);
    return ejecutar(ctx, async (c) =>
      conIdempotencia(req.headers.get("idempotency-key"), sesion.usuario.id, await huellaCuerpo(req), () => manejador(c)),
    sesion.usuario.id);
  };
}

/** Rutas sin sesión (login y salud). Las mutaciones exigen JSON para bloquear formularios de otros sitios. */
export function publico<P = Record<string, never>>(manejador: Manejador<ContextoBase<P>>): Ruta<P> {
  return async (peticion, segmento) => {
    const correlacionId = randomUUID();
    const acotada = await acotarCuerpo(peticion, MAX_CUERPO, correlacionId);
    if (acotada instanceof NextResponse) return acotada;
    const req = acotada;
    const base = contextoBase(req, await segmento.params, correlacionId);
    if (MUTANTES.has(req.method) && !req.headers.get("content-type")?.startsWith("application/json")) {
      return respuestaError("VALIDACION", "Se esperaba JSON.", base.correlacionId);
    }
    return ejecutar(base, manejador);
  };
}
