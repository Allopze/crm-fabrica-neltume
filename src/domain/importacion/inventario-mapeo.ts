// Mapeo puro de la planilla de inventario de la fábrica (REQ-STK-9, 10; ADR-0018). Sin BD.
// Las columnas de importes (DETALLE y las sin encabezado de Despachos) nunca se leen.
import { createHash } from "node:crypto";
import { normalizar } from "./mapear";
import { fechaPlausible, leerMadera, leerMedida, leerModelo, limpiarObservacion, normalizarUbicacion } from "../puertas/normalizar";

export interface FilaInventario {
  fila: number; modelo: unknown; medida: unknown; codigo: unknown; madera: unknown; produccion: unknown; estado: unknown; ubicacion: unknown; cliente: unknown; observaciones: unknown;
}
export interface FilaDespacho {
  fila: number; modelo: unknown; medida: unknown; codigo: unknown; madera: unknown; fecha: unknown; estado: unknown; cliente: unknown; documento: unknown; nota: unknown;
}

export interface PuertaInventario {
  fila: number; codigo: string | null; modelo: string; calidad: "primera" | "segunda"; madera: string; anchoMm: number; altoMm: number;
  ubicacion: string; observacion: string | null; fechaProduccion: string | null; apartadaPara: string | null; dudas: string[];
}
export type ResultadoInventario = { ok: true; puerta: PuertaInventario } | { ok: false; fila: number; motivo: string };

const texto = (v: unknown) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t || null;
};
/** Un código de etiqueta llega como número (202308000000210) o como texto. */
export const leerCodigo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(Math.round(v)) : texto(v)?.toUpperCase() ?? null);
const REVISAR = /POSIBLE VENDIDA|SIN CANCELAR|SIN PAGAR/i;

export function mapearPuerta(f: FilaInventario, hoy: string): ResultadoInventario {
  const { modelo, calidad } = leerModelo(f.modelo);
  if (!modelo) return { ok: false, fila: f.fila, motivo: "Sin modelo" };
  const medida = leerMedida(f.medida);
  if (!medida) return { ok: false, fila: f.fila, motivo: `Medida «${texto(f.medida) ?? ""}» ilegible` };
  const madera = leerMadera(f.madera);
  if (!madera) return { ok: false, fila: f.fila, motivo: "Sin madera" };
  const dudas: string[] = [];
  const codigo = leerCodigo(f.codigo);
  if (!codigo) dudas.push("sin código: se asigna uno nuevo");
  const fechaProduccion = fechaPlausible(f.produccion, hoy);
  if (!fechaProduccion && texto(f.produccion)) dudas.push("fecha de producción imposible: queda vacía");
  const estado = normalizar(f.estado);
  const observacion = limpiarObservacion(estado && estado !== "DISPONIBLE" ? f.estado : null, f.observaciones);
  if (REVISAR.test(String(f.observaciones ?? ""))) dudas.push(`observación a revisar: «${observacion}»`);
  return {
    ok: true,
    puerta: { fila: f.fila, codigo, modelo, calidad, madera, ...medida, ubicacion: normalizarUbicacion(f.ubicacion), observacion, fechaProduccion, apartadaPara: texto(f.cliente), dudas },
  };
}

/** Mapea todas las filas; un código repetido en la hoja recibe uno nuevo (REQ-STK-9.2). */
export function mapearPuertas(filas: FilaInventario[], hoy: string) {
  const puertas: PuertaInventario[] = [];
  const rechazos: { fila: number; motivo: string }[] = [];
  const vistos = new Set<string>();
  for (const f of filas) {
    const r = mapearPuerta(f, hoy);
    if (!r.ok) { rechazos.push({ fila: r.fila, motivo: r.motivo }); continue; }
    if (r.puerta.codigo && vistos.has(r.puerta.codigo)) {
      r.puerta.dudas.push(`código ${r.puerta.codigo} repetido en la hoja: se asigna uno nuevo`);
      r.puerta.codigo = null;
    }
    if (r.puerta.codigo) vistos.add(r.puerta.codigo);
    puertas.push(r.puerta);
  }
  return { puertas, rechazos };
}

export interface CatalogoInventario {
  modelos: Set<string>; maderas: Set<string>;
  rangos: { codigo: string; minM: number; maxM: number }[]; altos: { codigo: string; altoM: number }[];
  /** `MODELO|MADERA|rango|alto` → artículo de catálogo activo. */
  articulos: Map<string, { id: string; codigo: string }>;
}
export type Destino = { tipo: "catalogo"; articuloId: string; codigo: string } | { tipo: "fuera"; motivo: string };

/** Catálogo solo si modelo y madera existen, el ancho cae en un rango, el alto es de la grilla y hay artículo (REQ-STK-9.1). */
export function resolverArticulo(p: Pick<PuertaInventario, "modelo" | "madera" | "anchoMm" | "altoMm">, cat: CatalogoInventario): Destino {
  if (!cat.modelos.has(p.modelo)) return { tipo: "fuera", motivo: "modelo que no está en la lista" };
  if (!cat.maderas.has(p.madera)) return { tipo: "fuera", motivo: "madera que no está en la lista" };
  const rango = cat.rangos.find((r) => p.anchoMm >= Math.round(r.minM * 1000) && p.anchoMm <= Math.round(r.maxM * 1000));
  if (!rango) return { tipo: "fuera", motivo: "ancho fuera de grilla" };
  const alto = cat.altos.find((a) => Math.round(a.altoM * 1000) === p.altoMm);
  if (!alto) return { tipo: "fuera", motivo: "alto fuera de grilla" };
  const a = cat.articulos.get(`${p.modelo}|${p.madera}|${rango.codigo}|${alto.codigo}`);
  return a ? { tipo: "catalogo", articuloId: a.id, codigo: a.codigo } : { tipo: "fuera", motivo: "combinación sin precio en la lista" };
}

export interface DespachoHistorico {
  fila: number; codigo: string | null; modelo: string | null; medida: string | null; madera: string | null; fechaProduccion: string | null; fechaTexto: string | null;
  estado: string | null; cliente: string | null; documento: string | null; nota: string | null; dudas: string[]; huella: string;
}

/** Cada fila tal cual, con sus dudas; la huella (contenido + repetición) hace idempotente la recarga (REQ-STK-10.1). */
export function mapearDespachos(filas: FilaDespacho[], hoy: string): DespachoHistorico[] {
  const veces = new Map<string, number>();
  for (const f of filas) { const c = leerCodigo(f.codigo); if (c) veces.set(c, (veces.get(c) ?? 0) + 1); }
  const ocurrencias = new Map<string, number>();
  return filas.map((f) => {
    const codigo = leerCodigo(f.codigo);
    const fechaProduccion = fechaPlausible(f.fecha, hoy);
    const crudo = f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : texto(f.fecha);
    const d = { codigo, modelo: texto(f.modelo), medida: texto(f.medida), madera: texto(f.madera), fechaProduccion, fechaTexto: fechaProduccion ? null : crudo,
      estado: texto(f.estado), cliente: texto(f.cliente), documento: texto(f.documento), nota: texto(f.nota) };
    const dudas: string[] = [];
    if (!codigo) dudas.push("sin código");
    else if (!/^\d{15}$/.test(codigo)) dudas.push("código no numérico");
    else if ((veces.get(codigo) ?? 0) > 1) dudas.push("código repetido");
    if (crudo && !fechaProduccion) dudas.push("fecha imposible");
    const contenido = JSON.stringify([d.codigo, d.modelo, d.medida, d.madera, crudo, d.estado, d.cliente, d.documento, d.nota]);
    const n = (ocurrencias.get(contenido) ?? 0) + 1;
    ocurrencias.set(contenido, n);
    return { fila: f.fila, ...d, dudas, huella: createHash("sha256").update(`${contenido}#${n}`).digest("hex") };
  });
}
