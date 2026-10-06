// Marca de la empresa (logo oficial en public/marca/, datos impresos en los PDF). Los datos legales y de contacto
// vienen de NELTUME_EMPRESA_* (servidor): si faltan, no se imprimen, para no atribuir a la fábrica los de la tienda.
export const MARCA = { nombre: "Neltume.co", bajada: "Puertas nativas del sur", area: "Fábrica de puertas" } as const;

export interface DatosEmpresa {
  nombre: string; bajada: string; rut?: string; direccion?: string; telefono?: string; web?: string; correo: string;
}

/** Solo en el servidor: lee las variables en cada llamada (sin caché), para que un cambio de .env aplique al reiniciar. */
export function datosEmpresa(env: Record<string, string | undefined> = process.env): DatosEmpresa {
  const v = (k: string) => env[`NELTUME_EMPRESA_${k}`]?.trim() || undefined;
  return {
    nombre: v("NOMBRE") ?? MARCA.nombre, bajada: MARCA.bajada,
    rut: v("RUT"), direccion: v("DIRECCION"), telefono: v("TELEFONO"), web: v("WEB"),
    correo: v("CORREO") ?? "Neltume.co@gmail.com",
  };
}
