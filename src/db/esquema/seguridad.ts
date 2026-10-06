// Usuarios, permisos, sesiones, auditoría e idempotencia (DATA-MODEL §2, SECURITY §1–3).
import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const permiso = pgTable("permiso", {
  codigo: text().primaryKey(),
  descripcion: text().notNull(),
});

export const rol = pgTable("rol", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull().unique(),
  creadoEn: ahora(),
});

export const rolPermiso = pgTable(
  "rol_permiso",
  {
    rolId: uuid().notNull().references(() => rol.id, { onDelete: "cascade" }),
    permisoCodigo: text().notNull().references(() => permiso.codigo),
  },
  (t) => [primaryKey({ columns: [t.rolId, t.permisoCodigo] })],
);

export const usuario = pgTable(
  "usuario",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    nombre: text().notNull(),
    hashPassword: text().notNull(),
    rolId: uuid().notNull().references(() => rol.id),
    activo: boolean().notNull().default(true),
    creadoEn: ahora(),
    actualizadoEn: ahora(),
  },
  (t) => [check("usuario_email_minusculas", sql`${t.email} = lower(${t.email})`)],
);

export const sesion = pgTable(
  "sesion",
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text().notNull().unique(),
    csrfToken: text().notNull(),
    usuarioId: uuid().notNull().references(() => usuario.id),
    creadaEn: ahora(),
    expiraEn: timestamp({ withTimezone: true }).notNull(),
    revocadaEn: timestamp({ withTimezone: true }),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index("sesion_usuario_idx").on(t.usuarioId)],
);

export const intentoLogin = pgTable(
  "intento_login",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    ip: text(),
    ok: boolean().notNull(),
    ocurridoEn: ahora(),
  },
  (t) => [index("intento_login_email_idx").on(t.email, t.ocurridoEn), index("intento_login_ip_idx").on(t.ip, t.ocurridoEn)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ocurridoEn: ahora(),
    actorId: uuid().references(() => usuario.id),
    actorTipo: text().notNull(),
    accion: text().notNull(),
    recurso: text().notNull(),
    recursoId: text(),
    antes: jsonb(),
    despues: jsonb(),
    resultado: text().notNull(),
    origen: text().notNull(),
    ip: text(),
    userAgent: text(),
    correlacionId: text(),
  },
  (t) => [
    check("audit_resultado", sql`${t.resultado} in ('ok', 'denegado', 'error')`),
    check("audit_actor_tipo", sql`${t.actorTipo} in ('usuario', 'visitante', 'sistema', 'worker')`),
    index("audit_recurso_idx").on(t.recurso, t.recursoId),
    index("audit_fecha_idx").on(t.ocurridoEn),
  ],
);

export const idempotencia = pgTable(
  "idempotencia",
  {
    clave: uuid().notNull(),
    usuarioId: uuid().notNull().references(() => usuario.id),
    hashCuerpo: text().notNull(),
    estadoHttp: integer().notNull(),
    respuesta: jsonb().notNull(),
    expiraEn: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.clave, t.usuarioId] })],
);
