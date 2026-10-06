// Clientes (datos personales: SECURITY §4), cotizaciones y pedidos (DATA-MODEL §2; REQ-COT).
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const cliente = pgTable("cliente", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull(),
  rut: text().notNull().unique(), // normalizado: 12345678-5
  tipo: text().notNull().default("directo"), // tienda | directo
  giro: text(),
  direccion: text(),
  direccionDespacho: text(),
  comuna: text(),
  contacto: text(),
  email: text(),
  telefono: text(),
  creadoEn: ahora(),
  actualizadoEn: ahora(),
}, (t) => [
  check("cliente_tipo", sql`${t.tipo} in ('tienda', 'directo')`),
  index("cliente_nombre_idx").on(t.nombre),
]);
