// Reintentos acotados solo ante errores transitorios (AI.md §5): esperas de 1 s y 3 s.
import { ErrorIA, type InterpreteIA, type CatalogoResumido, type ResultadoInterpretacion } from "./interfaz";

export interface Intento { numero: number; error?: ErrorIA; resultado?: ResultadoInterpretacion; latenciaMs: number }

export async function interpretarConReintentos(
  ia: InterpreteIA, texto: string, catalogo: CatalogoResumido,
  opciones: { maxReintentos?: number; esperasMs?: number[]; alIntentar?: (i: Intento) => Promise<void> | void } = {},
): Promise<ResultadoInterpretacion> {
  const max = opciones.maxReintentos ?? Number(process.env.LLM_MAX_REINTENTOS ?? 2);
  const esperas = opciones.esperasMs ?? [1_000, 3_000];
  for (let n = 0; ; n++) {
    const inicio = Date.now();
    try {
      const resultado = await ia.interpretar(texto, catalogo);
      await opciones.alIntentar?.({ numero: n + 1, resultado, latenciaMs: Date.now() - inicio });
      return resultado;
    } catch (e) {
      const error = e instanceof ErrorIA ? e : new ErrorIA("permanente", (e as Error).message);
      await opciones.alIntentar?.({ numero: n + 1, error, latenciaMs: Date.now() - inicio });
      // Una salida inválida se reintenta una sola vez (DESIGN §3, paso 6).
      const limite = error.tipo === "invalida" ? Math.min(1, max) : max;
      if (!error.reintentable || n >= limite) throw error;
      await new Promise((r) => setTimeout(r, esperas[Math.min(n, esperas.length - 1)]));
    }
  }
}
