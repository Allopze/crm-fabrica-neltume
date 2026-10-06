import type { Client } from "pg";
import { PERMISOS, ROL_ADMIN } from "@/domain/auth/permisos";

// Datos de referencia estables (DATA-MODEL §6). Rangos, altos y tipos coinciden con la hoja Categorias.
const RANGOS: [string, string, number, number][] = [
  ["1", "0,60 A 0,65", 0.6, 0.65], ["2", "0,70 A 0,75", 0.7, 0.75], ["3", "0,80 A 0,85", 0.8, 0.85],
  ["4", "0,90 A 0,95", 0.9, 0.95], ["5", "1,00 A 1,05", 1.0, 1.05], ["6", "1,10 A 1,15", 1.1, 1.15],
  ["7", "1,20 A 1,25", 1.2, 1.25], ["8", "1,30 A 1,35", 1.3, 1.35], ["9", "1,40 A 1,45", 1.4, 1.45],
];
const ALTOS: [string, number][] = [["A", 2.0], ["B", 2.1], ["C", 2.2], ["D", 2.3], ["E", 2.4], ["F", 2.5], ["G", 2.6]];
// Feriados de Chile 2026 (verificar con el calendario oficial; editables en la tabla feriado).
const FERIADOS_2026: [string, string][] = [
  ["2026-01-01", "Año Nuevo"], ["2026-04-03", "Viernes Santo"], ["2026-04-04", "Sábado Santo"],
  ["2026-05-01", "Día del Trabajo"], ["2026-05-21", "Glorias Navales"], ["2026-06-21", "Pueblos Indígenas"],
  ["2026-06-29", "San Pedro y San Pablo"], ["2026-07-16", "Virgen del Carmen"], ["2026-08-15", "Asunción de la Virgen"],
  ["2026-09-18", "Independencia Nacional"], ["2026-09-19", "Glorias del Ejército"], ["2026-10-12", "Encuentro de Dos Mundos"],
  ["2026-10-31", "Iglesias Evangélicas y Protestantes"], ["2026-11-01", "Todos los Santos"],
  ["2026-12-08", "Inmaculada Concepción"], ["2026-12-25", "Navidad"],
];

/** Permisos, rol administrador y datos de referencia. Idempotente: corre tras cada migración. */
export async function sembrar(cliente: Client): Promise<void> {
  await cliente.query("BEGIN");
  try {
    for (const [codigo, descripcion] of Object.entries(PERMISOS)) {
      await cliente.query(
        "INSERT INTO permiso (codigo, descripcion) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion",
        [codigo, descripcion],
      );
    }
    await cliente.query("INSERT INTO rol (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", [ROL_ADMIN]);
    await cliente.query(
      `INSERT INTO rol_permiso (rol_id, permiso_codigo)
       SELECT r.id, p.codigo FROM rol r CROSS JOIN permiso p WHERE r.nombre = $1
       ON CONFLICT DO NOTHING`,
      [ROL_ADMIN],
    );
    await cliente.query("INSERT INTO bodega (nombre) VALUES ('Fábrica') ON CONFLICT DO NOTHING");
    for (const t of ["BLOQUE", "PANEL", "ESPECIAL"]) {
      await cliente.query("INSERT INTO tipo_puerta (nombre) VALUES ($1) ON CONFLICT DO NOTHING", [t]);
    }
    for (const [codigo, etiqueta, min, max] of RANGOS) {
      await cliente.query("INSERT INTO rango_ancho (codigo, etiqueta, min_m, max_m) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [codigo, etiqueta, min, max]);
    }
    for (const [codigo, m] of ALTOS) {
      await cliente.query("INSERT INTO alto (codigo, alto_m) VALUES ($1, $2) ON CONFLICT DO NOTHING", [codigo, m]);
    }
    for (const [codigo, nombre] of [["un", "unidad"], ["m", "metro"], ["m2", "metro cuadrado"], ["m3", "metro cúbico"], ["pulg", "pulgada maderera"], ["kg", "kilogramo"], ["lt", "litro"]]) {
      await cliente.query("INSERT INTO unidad (codigo, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING", [codigo, nombre]);
    }
    await cliente.query(`INSERT INTO parametro (clave, valor) VALUES ('vigencia_dias_habiles', '10'), ('iva', '0.19') ON CONFLICT DO NOTHING`);
    for (const [fecha, nombre] of FERIADOS_2026) {
      await cliente.query("INSERT INTO feriado (fecha, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING", [fecha, nombre]);
    }
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  }
}
