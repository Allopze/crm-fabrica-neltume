// Interfaz agnóstica al proveedor (ADR-0001). El resto del código depende solo de esto.
import type { Propuesta } from "./esquema";

/** Catálogo resumido que se entrega al LLM: sin precios, costos ni stock (AI.md §4). */
export interface CatalogoResumido {
  modelos: string[];
  maderas: string[];
  anchos: { codigo: string; etiqueta: string }[];
  altosM: number[];
  accesorios: string[];
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

export type TipoErrorIA = "timeout" | "transitorio" | "permanente" | "invalida" | "sin_zdr";

export class ErrorIA extends Error {
  constructor(public readonly tipo: TipoErrorIA, mensaje: string) {
    super(mensaje);
    this.name = "ErrorIA";
  }
  get reintentable() {
    return this.tipo === "timeout" || this.tipo === "transitorio" || this.tipo === "invalida";
  }
}

export interface InterpreteIA {
  readonly nombre: string;
  /** Recibe texto YA redactado. Devuelve una propuesta validada o lanza ErrorIA. */
  interpretar(textoRedactado: string, catalogo: CatalogoResumido): Promise<ResultadoInterpretacion>;
}
