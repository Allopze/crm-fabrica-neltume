// Llamadas del navegador a /api/v1 con CSRF y, en mutaciones idempotentes, Idempotency-Key.
export class ErrorApi extends Error {
  /** `estado` es el código HTTP; sin él (corte de red) no se sabe qué pasó. */
  constructor(public codigo: string, mensaje: string, public correlacionId?: string, public estado?: number) {
    super(mensaje);
  }
}

/** Una respuesta perdida no dice si el servidor guardó o no: nunca se afirma «no se guardó» (auditoría H-06). */
export const SIN_CONFIRMAR = "No pudimos confirmar si se guardó. Vuelve a intentarlo: con la misma operación no se duplica.";
const SIN_CONFIRMAR_NO_IDEMPOTENTE = "No pudimos confirmar si se guardó. Recarga y revisa antes de repetirlo.";

// Clave por envío (DESIGN §5): se conserva entre los reintentos automáticos y, si la respuesta no llegó, también si la
// persona repite el mismo envío (mismo método, ruta y contenido) en los 10 minutos siguientes. Así el reintento es
// seguro: el servidor devuelve la respuesta original en vez de repetir la acción.
const PENDIENTES = new Map<string, { clave: string; hasta: number }>();
const VIGENCIA_MS = 10 * 60_000;
const ESPERAS_MS = [1_000, 2_000, 4_000];

function claveDe(huella: string): string {
  const ahora = Date.now();
  for (const [h, p] of PENDIENTES) if (p.hasta < ahora) PENDIENTES.delete(h);
  const previa = PENDIENTES.get(huella);
  if (previa) return previa.clave;
  const clave = crypto.randomUUID();
  PENDIENTES.set(huella, { clave, hasta: ahora + VIGENCIA_MS });
  return clave;
}

async function enCurso(res: Response): Promise<boolean> {
  if (res.status !== 409) return false;
  const datos = await res.clone().json().catch(() => null);
  return datos?.error?.codigo === "IDEMPOTENCIA_EN_CURSO";
}

/**
 * Envía una mutación idempotente: reintenta con la misma Idempotency-Key ante un corte de red o mientras el primer
 * envío sigue en curso (409). `huella` identifica el envío (método, ruta y contenido) para reutilizar la clave.
 */
export async function enviarIdempotente(huella: string, enviar: (clave: string) => Promise<Response>): Promise<Response> {
  const clave = claveDe(huella);
  for (let intento = 0; ; intento++) {
    let res: Response | null = null;
    try { res = await enviar(clave); } catch { res = null; }
    if (res && !(await enCurso(res))) {
      // Respuesta definitiva (guardada o rechazada): la próxima vez es un envío nuevo. Un 5xx libera la clave en el
      // servidor, así que reutilizarla también es seguro.
      if (res.status < 500) PENDIENTES.delete(huella);
      return res;
    }
    if (intento >= ESPERAS_MS.length) {
      if (!res) throw new ErrorApi("SIN_CONFIRMAR", SIN_CONFIRMAR);
      return res;
    }
    await new Promise((ok) => setTimeout(ok, ESPERAS_MS[intento]));
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
  const cuerpo = opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo);

  let res: Response;
  if (opciones.idempotente) {
    res = await enviarIdempotente(`${metodo} ${url} ${cuerpo ?? ""}`, (clave) =>
      fetch(url, { method: metodo, headers: { ...cabeceras, "idempotency-key": clave }, body: cuerpo }));
  } else {
    try {
      res = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo });
    } catch {
      throw new ErrorApi("SIN_CONFIRMAR", metodo === "GET" ? "Sin conexión: no se pudo cargar." : SIN_CONFIRMAR_NO_IDEMPOTENTE);
    }
  }
  if (res.status === 204) return undefined as T;
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ErrorApi(datos?.error?.codigo ?? "INTERNO", datos?.error?.mensaje ?? "Error inesperado", datos?.error?.correlacion_id, res.status);
  }
  return datos as T;
}

/** Huella de un formulario con archivos: nombre, tamaño y fecha de cada archivo, y el valor de cada campo. */
export function huellaFormulario(form: FormData): string {
  return [...form.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : `${v.name}:${v.size}:${v.lastModified}`}`).join("&");
}
