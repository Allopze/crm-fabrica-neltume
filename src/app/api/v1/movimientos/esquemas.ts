import { z } from "zod";

// Cuerpos de los movimientos (API.md). Las puertas se mueven en unidades enteras.
export const MovimientoPuerta = z.strictObject({
  codigo: z.string().min(3).max(40),
  cantidad: z.number().int().positive().max(10_000),
  referencia: z.string().trim().max(120).optional(),
});

export const Ajuste = z.strictObject({
  codigo: z.string().min(3).max(40).optional(),
  materiaPrimaId: z.uuid().optional(),
  cantidad: z.number().refine((n) => n !== 0, "La cantidad no puede ser cero").refine((n) => Math.abs(n) <= 100_000),
  motivo: z.string().trim().min(3, "El motivo es obligatorio").max(300),
}).refine((a) => Boolean(a.codigo) !== Boolean(a.materiaPrimaId), "Indica un artículo o una materia prima");
