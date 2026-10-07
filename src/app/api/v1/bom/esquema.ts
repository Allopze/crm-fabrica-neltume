import { z } from "zod";

/**
 * Cantidad de un insumo por puerta: hasta 3 decimales, la precisión con que se guardan los movimientos de stock
 * (auditoría H-13). Con más decimales el consumo de una orden pequeña redondeaba a 0 y el cierre fallaba con 500.
 */
export const CantidadInsumo = z.number().positive().max(1e6)
  .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, "La cantidad admite hasta 3 decimales.");
