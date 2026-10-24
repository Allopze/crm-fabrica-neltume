// Respuesta de un archivo de la tienda o de la orden de trabajo (ADR-0023 §6): privado, sin caché, sin adivinar el tipo y
// en un origen sin permisos (CSP sandbox), por si un PDF o una imagen traen algo activo.
export function respuestaArchivo(contenido: Uint8Array, tipo: string, disposicion: string): Response {
  return new Response(new Uint8Array(contenido), {
    headers: {
      "content-type": tipo, "content-disposition": disposicion, "cache-control": "private, no-store",
      "x-content-type-options": "nosniff", "content-security-policy": "sandbox",
    },
  });
}

/** `attachment` con un nombre que arma la app (nunca el que mandó la tienda). */
export const descarga = (nombre: string) =>
  `attachment; filename="${nombre.normalize("NFD").replace(/[^A-Za-z0-9.-]+/g, "-")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
