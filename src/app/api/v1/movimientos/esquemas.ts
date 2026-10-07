import { z } from "zod";

// Cuerpos de los movimientos (API.md). Las puertas se mueven en unidades enteras y cada una tiene su código (ADR-0018).
const CodigoArticulo = z.string().min(3).max(40);
const Puertas = z.array(z.string().trim().min(3).max(40)).min(1).max(500);
const Ubicacion = z.string().trim().min(1).max(60);

export const Entrada = z.strictObject({
  codigo: CodigoArticulo,
  cantidad: z.number().int().positive().max(10_000).optional(),
  puertas: Puertas.optional(),
  ubicacion: Ubicacion.optional(),
  referencia: z.string().trim().max(120).optional(),
}).refine((e) => e.cantidad !== undefined || e.puertas, "Indica la cantidad o las puertas");

export const Salida = z.strictObject({
  codigo: CodigoArticulo.optional(),
  cantidad: z.number().int().positive().max(10_000).optional(),
  puertas: Puertas.optional(),
  referencia: z.string().trim().max(120).optional(),
}).refine((s) => s.puertas || (s.codigo && s.cantidad !== undefined), "Indica el artículo y la cantidad, o las puertas");

export const Ajuste = z.strictObject({
  codigo: CodigoArticulo.optional(),
  materiaPrimaId: z.uuid().optional(),
  cantidad: z.number().refine((n) => n !== 0, "La cantidad no puede ser cero").refine((n) => Math.abs(n) <= 100_000),
  motivo: z.string().trim().min(3, "El motivo es obligatorio").max(300),
  puertas: Puertas.optional(),
  ubicacion: Ubicacion.optional(),
}).refine((a) => (a.materiaPrimaId ? !a.codigo : Boolean(a.codigo || a.puertas)), "Indica un artículo, sus puertas o una materia prima");
