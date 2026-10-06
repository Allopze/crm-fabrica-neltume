// Salida estructurada del LLM (AI.md §2). Estricta: sin campos de precio, total ni descuento (SECURITY T1, T2).
import { z } from "zod";

export const TIPOS_ITEM = ["puerta", "marco", "piezas_t", "endolado", "guardapolvo", "pilastra", "desconocido"] as const;

export const ItemPropuesto = z.strictObject({
  texto_fuente: z.string().max(400),
  tipo: z.enum(TIPOS_ITEM),
  modelo: z.string().max(60).nullable(),
  madera: z.string().max(60).nullable(),
  // En metros; si llegan en cm o mm el backend los convierte (≤ 10 m, ≤ 300 cm, ≤ 3000 mm; REQ-COT-2.12).
  ancho_m: z.number().positive().max(3000).nullable(),
  alto_m: z.number().positive().max(3000).nullable(),
  medida_accesorio: z.string().max(80).nullable(),
  cantidad: z.number().int().min(1).max(500).nullable(),
  /** Solo si el cliente lo dice explícitamente; nunca se asume (REQ-COT-2.12). */
  tipo_medida: z.enum(["hoja", "vano"]).nullable().optional(),
  dudas: z.array(z.string().max(300)).max(10),
});

export const Propuesta = z.strictObject({
  items: z.array(ItemPropuesto).max(30),
  alertas: z.array(z.string().max(300)).max(10),
  sin_items: z.boolean(),
});

export type ItemPropuesto = z.infer<typeof ItemPropuesto>;
export type Propuesta = z.infer<typeof Propuesta>;

/** JSON Schema de la herramienta `proponer_items` que se fuerza en la llamada (ADR-0001). */
export const HERRAMIENTA_PROPONER_ITEMS = {
  type: "function",
  function: {
    name: "proponer_items",
    description: "Devuelve los ítems que pidió el cliente. Nunca incluyas precios, totales ni descuentos.",
    parameters: z.toJSONSchema(Propuesta, { target: "draft-7" }),
  },
} as const;
