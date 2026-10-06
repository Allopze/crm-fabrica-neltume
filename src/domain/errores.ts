// Errores de dominio con código estable (API.md §2). La capa HTTP los traduce a estado y JSON.
export type CodigoError =
  | "VALIDACION" | "CAMPO_NO_PERMITIDO" | "NO_AUTENTICADO" | "SIN_PERMISO" | "CSRF" | "NO_ENCONTRADO"
  | "VERSION_OBSOLETA" | "IDEMPOTENCIA_CONFLICTO" | "IDEMPOTENCIA_REQUERIDA" | "ULTIMO_ADMIN"
  | "LIMITE_LOGIN" | "CREDENCIALES" | "STOCK_INSUFICIENTE" | "INTERNO";

export const ESTADO_HTTP: Record<CodigoError, number> = {
  VALIDACION: 400, CAMPO_NO_PERMITIDO: 400, IDEMPOTENCIA_REQUERIDA: 400, CREDENCIALES: 401, NO_AUTENTICADO: 401,
  SIN_PERMISO: 403, CSRF: 403, NO_ENCONTRADO: 404, VERSION_OBSOLETA: 409, IDEMPOTENCIA_CONFLICTO: 422,
  ULTIMO_ADMIN: 422, STOCK_INSUFICIENTE: 409, LIMITE_LOGIN: 429, INTERNO: 500,
};

export class ErrorDominio extends Error {
  constructor(public readonly codigo: CodigoError, mensaje: string, public readonly detalles?: unknown) {
    super(mensaje);
    this.name = "ErrorDominio";
  }
}
