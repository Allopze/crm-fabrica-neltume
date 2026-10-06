// Mapeo de accesorios (REQ-COT-2.13; REQ-STK-1.4): marcos y piezas T por escuadría en pulgadas × largo; molduras
// (endolado, guardapolvo, pilastra) por sección en cm × espesor × largo. Reglas portadas del cotizador de la tienda.
// Igual que en puertas: exacto → ok; entre escalones → a pedido con referencia del escalón superior; nada en silencio.
import type { ItemPropuesto } from "@/ai/esquema";
import { normalizar } from "../importacion/mapear";
import type { CatalogoMapeo, ItemMapeado } from "./mapear";

export interface PiezaCatalogo { id: string; codigo: string; modeloId: string; maderaId: string; seccion: string; largoM: number }

const MODELO_DE_TIPO: Record<string, string> = { marco: "MARCO", piezas_t: "PIEZAS T", endolado: "ENDOLADO", guardapolvo: "GUARDAPOLVO", pilastra: "PILASTRA" };
const POR_PULGADAS = new Set(["MARCO", "PIEZAS T"]);
const HOLGURA = 0.005; // 5 mm
const LARGO_LINEAL = 3; // desde 3 m es pieza lineal; bajo 3 m, kit

/**
 * Escuadría o sección normalizada como en los códigos del catálogo: «2 x 6"» → 2X6, «6 pulgadas» → 2X6 (marcos),
 * «6 x 4.5 cm» → 6X4,5. Devuelve null si no hay medida.
 */
export function normalizarSeccion(texto: string | null, porPulgadas: boolean): string | null {
  if (!texto?.trim()) return null;
  const t = normalizar(texto).replace(/[×*]/g, "X").replace(/\./g, ",");
  // Se toma la sección de cualquier frase: «de 4», «2 x 6 pulg», «12x4,5 cm», «6 pulgadas».
  const par = /(\d{1,2}(?:,\d)?)\s*X\s*(\d{1,2}(?:,\d)?)/.exec(t);
  if (par) return `${par[1]}X${par[2]}`;
  const solo = /\b(\d{1,2})\b/.exec(t);
  return porPulgadas && solo ? `2X${solo[1]}` : null;
}

const m2 = (n: number) => n.toFixed(2).replace(".", ",");
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export function mapearAccesorio(p: ItemPropuesto, cat: CatalogoMapeo, madera: { id: string; nombre: string }, nombreMadera: string, largoM: number | null): ItemMapeado {
  const base = { articuloId: null, codigo: null, referencia: null, cantidad: p.cantidad ?? 1, textoFuente: p.texto_fuente, medidaSolicitada: null };
  const porConfirmar = (duda: string): ItemMapeado => ({ ...base, estado: "por_confirmar", descripcion: "Ítem por confirmar", duda });
  const nombreModelo = MODELO_DE_TIPO[p.tipo];
  const modelo = nombreModelo && cat.accesorios.find((m) => m.nombre === nombreModelo);
  if (!modelo) return porConfirmar("No se reconoce el tipo de accesorio.");
  const pulgadas = POR_PULGADAS.has(modelo.nombre);
  const seccion = normalizarSeccion(p.medida_accesorio, pulgadas);
  if (!seccion) return porConfirmar(pulgadas ? "Falta la escuadría del marco (2x4, 2x5, 2x6 o 2x8)." : "Falta la sección de la moldura (cm × espesor).");
  if (largoM === null) return porConfirmar("Falta el largo.");

  const candidatos = cat.piezas.filter((x) => x.modeloId === modelo.id && x.maderaId === madera.id && x.seccion === seccion).sort((a, b) => a.largoM - b.largoM);
  const etiquetaSeccion = pulgadas ? `${seccion.replace(/^2X/, "2x")} pulg.` : `${seccion.replace("X", " × ")} cm`;
  const nombre = `${titulo(modelo.nombre)} · ${nombreMadera} · ${etiquetaSeccion}`;
  if (!candidatos.length) {
    const hay = [...new Set(cat.piezas.filter((x) => x.modeloId === modelo.id && x.maderaId === madera.id).map((x) => x.seccion))].join(", ");
    return porConfirmar(`No hay ${titulo(modelo.nombre).toLowerCase()} de ${etiquetaSeccion} en ${nombreMadera.toLowerCase()}${hay ? ` (hay: ${hay})` : ""}.`);
  }
  const forma = (l: number) => (pulgadas && l < LARGO_LINEAL ? "kit" : `× ${m2(l)} m`);
  const exacto = candidatos.find((x) => Math.abs(x.largoM - largoM) <= HOLGURA);
  if (exacto) return { ...base, estado: "ok", articuloId: exacto.id, codigo: exacto.codigo, duda: null, descripcion: `${nombre} ${forma(exacto.largoM)}${pulgadas && exacto.largoM < LARGO_LINEAL ? ` ${m2(exacto.largoM)} m` : ""}` };
  // Entre escalones o bajo el menor (se corta en obra): referencia del escalón siguiente, y una persona fija el precio.
  const superior = candidatos.find((x) => x.largoM > largoM);
  if (!superior) return porConfirmar(`El largo ${m2(largoM)} m supera el mayor del catálogo (${m2(candidatos.at(-1)!.largoM)} m).`);
  return {
    ...base, estado: "a_pedido", referencia: { articuloId: superior.id, codigo: superior.codigo },
    descripcion: `${nombre} × ${m2(largoM)} m (largo especial)`, medidaSolicitada: `${etiquetaSeccion} × ${m2(largoM)} m`,
    duda: "El largo no está en el catálogo: se fabrica a pedido. Una persona debe fijar el precio.",
  };
}
