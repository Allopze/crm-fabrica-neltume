// Mapeo determinista de la propuesta de la IA al catálogo (REQ-COT-2.3–2.5; AI.md §2; DESIGN §3 paso 7).
// Puro: el catálogo se pasa como datos. Nada se completa en silencio: lo incierto queda por confirmar.
import type { ItemPropuesto } from "@/ai/esquema";
import { normalizar } from "../importacion/mapear";
import { mapearAccesorio, type PiezaCatalogo } from "./accesorios";
import { type AliasModelo, resolverModelo } from "./modelos";

export interface CatalogoMapeo {
  modelos: { id: string; nombre: string; codigo: string }[];
  maderas: { id: string; nombre: string; codigo: string }[];
  rangos: { codigo: string; etiqueta: string; minM: number; maxM: number }[];
  altos: { codigo: string; altoM: number }[];
  /** Artículo por variante: `${modeloId}|${maderaId}|${anchoCodigo}|${altoCodigo}` */
  articulos: Map<string, { id: string; codigo: string }>;
  /** Nombres alternativos de modelos (REQ-COT-2.11). */
  alias: AliasModelo[];
  /** Modelos de accesorio (MARCO, PIEZAS T, molduras) y sus artículos con sección y largo (REQ-COT-2.13). */
  accesorios: { id: string; nombre: string; codigo: string }[];
  piezas: PiezaCatalogo[];
}

export interface ItemMapeado {
  estado: "ok" | "por_confirmar" | "a_pedido";
  articuloId: string | null;
  codigo: string | null;
  referencia: { articuloId: string; codigo: string } | null;
  cantidad: number;
  descripcion: string; // del catálogo, nunca texto libre de la IA
  duda: string | null;
  textoFuente: string;
  /** Medida pedida en mm (con hoja/vano si se dijo), cuando no es exactamente la del artículo o se indicó el tipo. */
  medidaSolicitada: string | null;
}

/** Interpreta un número de medida: ≤ 10 en metros, ≤ 300 en cm, ≤ 3000 en mm. Fuera de 0,3 m–`max` es implausible (null). */
export function metros(n: number, max = 3): number | null {
  const m = n <= 10 ? n : n <= 300 ? n / 100 : n <= 3000 ? n / 1000 : NaN;
  return Number.isFinite(m) && m >= 0.3 && m <= max ? Number(m.toFixed(4)) : null;
}
const mm = (m: number) => String(Math.round(m * 1000));

const ALIAS_MADERA: Record<string, string> = { PINO: "PINO OREGON", OREGON: "PINO OREGON", "PINO OREGON": "PINO OREGON", RAULI: "RAULI", LENGA: "LENGA", MARA: "MARA" };
const NOMBRE_MADERA: Record<string, string> = { "PINO OREGON": "Pino Oregón", RAULI: "Raulí", LENGA: "Lenga", MARA: "Mara" };
const TOL = 0.0051;
const m2 = (n: number) => n.toFixed(2).replace(".", ",");
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export function mapearItem(p: ItemPropuesto, cat: CatalogoMapeo): ItemMapeado {
  const base = { articuloId: null, codigo: null, referencia: null, cantidad: p.cantidad ?? 1, textoFuente: p.texto_fuente, medidaSolicitada: null };
  const porConfirmar = (duda: string): ItemMapeado => ({ ...base, estado: "por_confirmar", descripcion: "Ítem por confirmar", duda });

  if (p.tipo === "desconocido") return porConfirmar(p.dudas.length ? p.dudas.join(". ") : "No se reconoce el producto.");
  if (p.dudas.length) return porConfirmar(p.dudas.join(". "));
  if (p.cantidad === null) return porConfirmar("Falta la cantidad.");
  if (p.tipo !== "puerta") {
    const nombreMaderaAcc = ALIAS_MADERA[normalizar(p.madera)];
    const maderaAcc = cat.maderas.find((m) => m.nombre === nombreMaderaAcc);
    if (!maderaAcc) return porConfirmar(p.madera ? `La madera «${p.madera}» no está en el catálogo.` : "Falta la madera.");
    return mapearAccesorio(p, cat, maderaAcc, NOMBRE_MADERA[maderaAcc.nombre], p.alto_m === null ? null : metros(p.alto_m, 6));
  }

  const resuelto = resolverModelo(p.modelo, cat.modelos, cat.alias);
  if (resuelto.tipo === "posible") return porConfirmar(`¿Te refieres a «${titulo(resuelto.modelo.nombre)}»? «${p.modelo}» no está en el catálogo con ese nombre.`);
  if (resuelto.tipo === "desconocido") return porConfirmar(p.modelo ? `El modelo «${p.modelo}» no está en el catálogo.` : "Falta el modelo.");
  const modelo = resuelto.modelo;
  const nombreMadera = ALIAS_MADERA[normalizar(p.madera)];
  const madera = cat.maderas.find((m) => m.nombre === nombreMadera);
  if (!madera) {
    const lista = Object.values(NOMBRE_MADERA).join(", ");
    return porConfirmar(p.madera ? `La madera «${p.madera}» no está en el catálogo (${lista}).` : "Falta la madera.");
  }
  if (p.ancho_m === null || p.alto_m === null) return porConfirmar("Falta la medida.");
  const ancho = metros(p.ancho_m);
  const altoM = metros(p.alto_m);
  if (ancho === null || altoM === null) return porConfirmar(`La medida ${p.ancho_m} × ${p.alto_m} no es plausible para una puerta (0,30 a 3 m): confirma la unidad.`);
  const tipo = p.tipo_medida ? ` (${p.tipo_medida})` : "";

  const rangoExacto = cat.rangos.find((r) => ancho >= r.minM - TOL && ancho <= r.maxM + TOL);
  const rangoSuperior = rangoExacto ?? [...cat.rangos].sort((a, b) => a.minM - b.minM).find((r) => r.minM > ancho);
  const altoExacto = cat.altos.find((a) => Math.abs(a.altoM - altoM) < TOL);
  const altoSuperior = altoExacto ?? [...cat.altos].sort((a, b) => a.altoM - b.altoM).find((a) => a.altoM > altoM);
  const pedida = `${mm(ancho)} × ${mm(altoM)} mm${tipo}`;
  const nombre = `${titulo(modelo.nombre)} · ${NOMBRE_MADERA[madera.nombre]}`;

  if (rangoExacto && altoExacto) {
    const art = cat.articulos.get(`${modelo.id}|${madera.id}|${rangoExacto.codigo}|${altoExacto.codigo}`);
    if (!art) return porConfirmar(`No existe la variante ${nombre} ${rangoExacto.etiqueta} × ${m2(altoExacto.altoM)} m.`);
    return {
      ...base, estado: "ok", articuloId: art.id, codigo: art.codigo, duda: null, descripcion: `${nombre} · ${rangoExacto.etiqueta.replace(" A ", " a ")} × ${m2(altoExacto.altoM)} m`,
      medidaSolicitada: tipo ? pedida : null,
    };
  }
  if (!rangoSuperior || !altoSuperior) return porConfirmar(`La medida ${m2(ancho)} × ${m2(altoM)} m supera la grilla del catálogo.`);
  const ref = cat.articulos.get(`${modelo.id}|${madera.id}|${rangoSuperior.codigo}|${altoSuperior.codigo}`);
  if (!ref) return porConfirmar(`No hay variante de referencia para ${nombre} ${m2(ancho)} × ${m2(altoM)} m.`);
  return {
    ...base, estado: "a_pedido", referencia: { articuloId: ref.id, codigo: ref.codigo },
    descripcion: `${nombre} · ${m2(ancho)} × ${m2(altoM)} m (medida especial)`, medidaSolicitada: pedida,
    duda: "La medida queda fuera de la grilla: se fabrica a pedido. Una persona debe fijar el precio.",
  };
}
