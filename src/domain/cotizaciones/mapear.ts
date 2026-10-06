// Mapeo determinista de la propuesta de la IA al catálogo (REQ-COT-2.3–2.5; AI.md §2; DESIGN §3 paso 7).
// Puro: el catálogo se pasa como datos. Nada se completa en silencio: lo incierto queda por confirmar.
import type { ItemPropuesto } from "@/ai/esquema";
import { normalizar } from "../importacion/mapear";
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
}

const ALIAS_MADERA: Record<string, string> = { PINO: "PINO OREGON", OREGON: "PINO OREGON", "PINO OREGON": "PINO OREGON", RAULI: "RAULI", LENGA: "LENGA", MARA: "MARA" };
const NOMBRE_MADERA: Record<string, string> = { "PINO OREGON": "Pino Oregón", RAULI: "Raulí", LENGA: "Lenga", MARA: "Mara" };
const TOL = 0.0051;
const m2 = (n: number) => n.toFixed(2).replace(".", ",");
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export function mapearItem(p: ItemPropuesto, cat: CatalogoMapeo): ItemMapeado {
  const base = { articuloId: null, codigo: null, referencia: null, cantidad: p.cantidad ?? 1, textoFuente: p.texto_fuente };
  const porConfirmar = (duda: string): ItemMapeado => ({ ...base, estado: "por_confirmar", descripcion: "Ítem por confirmar", duda });

  if (p.tipo !== "puerta") return porConfirmar("Accesorio: el mapeo de marcos y molduras se confirma con la fábrica.");
  if (p.dudas.length) return porConfirmar(p.dudas.join(". "));
  if (p.cantidad === null) return porConfirmar("Falta la cantidad.");

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

  const rangoExacto = cat.rangos.find((r) => p.ancho_m! >= r.minM - TOL && p.ancho_m! <= r.maxM + TOL);
  const rangoSuperior = rangoExacto ?? [...cat.rangos].sort((a, b) => a.minM - b.minM).find((r) => r.minM > p.ancho_m!);
  const altoExacto = cat.altos.find((a) => Math.abs(a.altoM - p.alto_m!) < TOL);
  const altoSuperior = altoExacto ?? [...cat.altos].sort((a, b) => a.altoM - b.altoM).find((a) => a.altoM > p.alto_m!);
  const nombre = `${titulo(modelo.nombre)} · ${NOMBRE_MADERA[madera.nombre]}`;

  if (rangoExacto && altoExacto) {
    const art = cat.articulos.get(`${modelo.id}|${madera.id}|${rangoExacto.codigo}|${altoExacto.codigo}`);
    if (!art) return porConfirmar(`No existe la variante ${nombre} ${rangoExacto.etiqueta} × ${m2(altoExacto.altoM)} m.`);
    return { ...base, estado: "ok", articuloId: art.id, codigo: art.codigo, duda: null, descripcion: `${nombre} · ${rangoExacto.etiqueta.replace(" A ", " a ")} × ${m2(altoExacto.altoM)} m` };
  }
  if (!rangoSuperior || !altoSuperior) return porConfirmar(`La medida ${m2(p.ancho_m)} × ${m2(p.alto_m)} m supera la grilla del catálogo.`);
  const ref = cat.articulos.get(`${modelo.id}|${madera.id}|${rangoSuperior.codigo}|${altoSuperior.codigo}`);
  if (!ref) return porConfirmar(`No hay variante de referencia para ${nombre} ${m2(p.ancho_m)} × ${m2(p.alto_m)} m.`);
  return {
    ...base, estado: "a_pedido", referencia: { articuloId: ref.id, codigo: ref.codigo },
    descripcion: `${nombre} · ${m2(p.ancho_m)} × ${m2(p.alto_m)} m (medida especial)`,
    duda: "La medida queda fuera de la grilla: se fabrica a pedido. Una persona debe fijar el precio.",
  };
}
