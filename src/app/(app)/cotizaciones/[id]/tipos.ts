import type { obtenerCotizacion } from "@/domain/cotizaciones/consulta";

export type CotizacionDetalle = Awaited<ReturnType<typeof obtenerCotizacion>>;
export type ItemDetalle = CotizacionDetalle["items"][number];
