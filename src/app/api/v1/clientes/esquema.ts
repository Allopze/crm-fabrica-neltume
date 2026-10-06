import { z } from "zod";

const texto = (max: number) => z.string().trim().max(max).nullable().optional();
export const Cliente = z.strictObject({
  nombre: z.string().trim().min(2).max(160),
  rut: z.string().trim().min(3).max(15),
  tipo: z.enum(["tienda", "directo"]).optional(),
  giro: texto(160), direccion: texto(200), direccionDespacho: texto(200), comuna: texto(80),
  contacto: texto(120), email: texto(254), telefono: texto(30),
});
