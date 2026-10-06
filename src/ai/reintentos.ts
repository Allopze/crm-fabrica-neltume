// Reintentos acotados solo ante errores transitorios (AI.md §5): esperas de 1 s y 3 s.
import { ErrorIA, type InterpreteIA, type CatalogoResumido, type OpcionesInterpretacion, type ResultadoInterpretacion } from "./interfaz";

export interface Intento { numero: number; error?: ErrorIA; resultado?: ResultadoInterpretacion; latenciaMs: number }

/** LLM_MAX_REINTENTOS vacío o inválido = valor por defecto (2); 0 desactiva los reintentos. */
export function reintentosDesdeEntorno(valor = process.env.LLM_MAX_REINTENTOS): number {
  const n = valor?.trim() ? Number(valor) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : 2;
}

export async function interpretarConReintentos(
  ia: InterpreteIA, texto: string, catalogo: CatalogoResumido,
  opciones: { maxReintentos?: number; esperasMs?: number[]; alIntentar?: (i: Intento) => Promise<void> | void } & OpcionesInterpretacion = {},
): Promise<ResultadoInterpretacion> {
  const max = opciones.maxReintentos ?? reintentosDesdeEntorno();
  const esperas = opciones.esperasMs ?? [1_000, 3_000];
  for (let n = 0; ; n++) {
    const inicio = Date.now();
    try {
      const resultado = await ia.interpretar(texto, catalogo, opciones.omitidos?.length ? { omitidos: opciones.omitidos } : undefined);
      await opciones.alIntentar?.({ numero: n + 1, resultado, latenciaMs: Date.now() - inicio });
      return resultado;
    } catch (e) {
      const error = e instanceof ErrorIA ? e : new ErrorIA("permanente", (e as Error).message);
      await opciones.alIntentar?.({ numero: n + 1, error, latenciaMs: Date.now() - inicio });
      // Una salida inválida se reintenta una sola vez (DESIGN §3, paso 6).
      const limite = error.tipo === "invalida" ? Math.min(1, max) : max;
      if (!error.reintentable || n >= limite) throw error;
      const espera = Math.max(esperas[Math.min(n, esperas.length - 1)], error.retryAfterMs ?? 0);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}
