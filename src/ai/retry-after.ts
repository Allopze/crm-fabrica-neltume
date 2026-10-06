import { MAX_RETRY_AFTER_MS } from "./interfaz";

/** Lee Retry-After en segundos o fecha HTTP. >30 s devuelve un centinela para no reintentar antes de tiempo. */
export function leerRetryAfterMs(valor: string | null, ahora = Date.now()): number | undefined {
  if (!valor?.trim()) return undefined;
  const texto = valor.trim();
  const segundos = Number(texto);
  const ms = Number.isFinite(segundos) && segundos >= 0
    ? segundos * 1000
    : Date.parse(texto) - ahora;
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  if (ms > MAX_RETRY_AFTER_MS) return MAX_RETRY_AFTER_MS + 1;
  return Math.ceil(ms);
}
