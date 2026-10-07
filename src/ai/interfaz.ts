// Interfaz agnóstica al proveedor (ADR-0001). El resto del código depende solo de esto.
import type { Propuesta } from "./esquema";

/** Catálogo resumido que se entrega al LLM: sin precios, costos ni stock (AI.md §4). */
export interface CatalogoResumido {
  modelos: string[];
  maderas: string[];
  anchos: { codigo: string; etiqueta: string }[];
  altosM: number[];
  accesorios: string[];
  /** Nombres alternativos seguros de modelos (alias → modelo); sin precios ni datos de stock. */
  alias?: { alias: string; modelo: string }[];
  /** Escuadrías o secciones y largos de cada accesorio (REQ-COT-2.13); solo medidas, sin precios. */
  medidasAccesorio?: { tipo: string; secciones: string[]; largosM: number[] }[];
}

export interface ResultadoInterpretacion {
  propuesta: Propuesta;
  proveedor: string;
  modelo?: string;
  tokensEntrada?: number;
  tokensSalida?: number;
  costoUsd?: number;
  latenciaMs: number;
}

export type TipoProveedor = "commandcode" | "groq" | "doble";
export type TipoErrorIA = "timeout" | "transitorio" | "permanente" | "invalida" | "sin_zdr";
export const MAX_RETRY_AFTER_MS = 30_000;

export class ErrorIA extends Error {
  constructor(public readonly tipo: TipoErrorIA, mensaje: string, public readonly retryAfterMs?: number) {
    super(mensaje);
    this.name = "ErrorIA";
  }
  get reintentable() {
    return (this.tipo === "timeout" || this.tipo === "transitorio" || this.tipo === "invalida")
      && (this.retryAfterMs === undefined || this.retryAfterMs <= MAX_RETRY_AFTER_MS);
  }
}

/** Segunda pasada (REQ-COT-2.15): partes del pedido que la primera respuesta dejó sin registrar, ya redactadas. */
export interface OpcionesInterpretacion {
  omitidos?: string[];
  /** Reintento tras una salida inválida: el motivo que escribe el sistema (rutas y reglas del esquema, sin valores). */
  correccion?: string;
}

export interface InterpreteIA {
  readonly nombre: string;
  /** Recibe texto YA redactado. Devuelve una propuesta validada o lanza ErrorIA. */
  interpretar(textoRedactado: string, catalogo: CatalogoResumido, opciones?: OpcionesInterpretacion): Promise<ResultadoInterpretacion>;
}
