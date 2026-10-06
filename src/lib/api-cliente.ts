// Llamadas del navegador a /api/v1 con CSRF y, en mutaciones idempotentes, Idempotency-Key.
export class ErrorApi extends Error {
  constructor(public codigo: string, mensaje: string, public correlacionId?: string) {
    super(mensaje);
  }
}

export async function pedir<T = unknown>(
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  opciones: { cuerpo?: unknown; csrf?: string; idempotente?: boolean } = {},
): Promise<T> {
  const cabeceras: Record<string, string> = {};
  if (opciones.cuerpo !== undefined) cabeceras["content-type"] = "application/json";
  if (opciones.csrf) cabeceras["x-csrf-token"] = opciones.csrf;
  if (opciones.idempotente) cabeceras["idempotency-key"] = crypto.randomUUID();

  let res: Response;
  try {
    res = await fetch(url, { method: metodo, headers: cabeceras, body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo) });
  } catch {
    throw new ErrorApi("SIN_CONEXION", "Sin conexión: los cambios no se guardaron.");
  }
  if (res.status === 204) return undefined as T;
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ErrorApi(datos?.error?.codigo ?? "INTERNO", datos?.error?.mensaje ?? "Error inesperado", datos?.error?.correlacion_id);
  }
  return datos as T;
}
