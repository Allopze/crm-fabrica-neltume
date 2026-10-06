// Mapeo puro de una fila de la hoja "Precio" a un artículo con precio (DATA-MODEL §5).
// Sin BD: se prueba con unit tests. Las reglas de código replican las fórmulas del Excel.

export interface Categorias {
  modelos: Map<string, string>; // NOMBRE normalizado → código (NEL)
  anchos: Map<string, string>; // etiqueta normalizada → código (1–9, 2X4…)
  altos: Map<string, string>; // clave normalizada (2.1, 6X1X2…) → letra
}

export interface FilaPrecio {
  fila: number;
  codigo: unknown; modelo: unknown; tipo: unknown; ancho: unknown; espesor: unknown; alto: unknown; madera: unknown; pulgadas: unknown;
  costoProduccion: unknown; costoMateriales: unknown; costoInsumos: unknown; costosGenerales: unknown; costoTotal: unknown;
  margen: unknown; precioNeto: unknown;
}

export interface ArticuloImportado {
  fila: number;
  codigo: string;
  modelo: string;
  modeloCodigo: string;
  familia: "puerta" | "accesorio";
  madera: string;
  anchoCodigo: string;
  anchoEtiqueta: string;
  altoCodigo: string;
  altoM: number;
  espesor: number | null;
  pulgadas: number | null;
  tipo: "BLOQUE" | "PANEL" | "ESPECIAL" | null;
  costos: { produccion: number | null; materiales: number | null; insumos: number | null; generales: number | null; total: number | null };
  margen: number | null;
  precioNeto: number;
}

export type ResultadoFila = { ok: true; articulo: ArticuloImportado } | { ok: false; fila: number; motivo: string };

export const MADERAS: Record<string, string> = { "PINO OREGON": "O", LENGA: "L", MARA: "M", RAULI: "R" };
const MARCOS = new Set(["MARCO", "PIEZAS T"]);
const MOLDURAS = new Set(["PILASTRA", "ENDOLADO", "GUARDAPOLVO"]);

/** Mayúsculas, sin tildes ni espacios repetidos: "Raulí " → "RAULI". */
export function normalizar(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Clave numérica como la escribe Excel: 2 → "2", 2.1 → "2.1". */
const claveNum = (n: number) => String(Number(n.toFixed(4)));
const texto = (n: number) => claveNum(n).replace(".", ",");

export function mapearFila(f: FilaPrecio, cat: Categorias): ResultadoFila {
  const error = (motivo: string): ResultadoFila => ({ ok: false, fila: f.fila, motivo });
  const codigo = normalizar(f.codigo);
  if (!codigo) return error("Fila sin código");
  const modelo = normalizar(f.modelo);
  const modeloCodigo = cat.modelos.get(modelo);
  if (!modeloCodigo) return error(`Modelo «${String(f.modelo ?? "")}» no está en la hoja Categorias`);
  const madera = normalizar(f.madera);
  const maderaCodigo = MADERAS[madera];
  if (!maderaCodigo) return error(`Madera «${String(f.madera ?? "")}» no reconocida`);
  const altoM = numero(f.alto);
  if (altoM === null || altoM <= 0) return error("Alto o largo inválido");
  const precioNeto = numero(f.precioNeto);
  if (precioNeto === null || precioNeto <= 0) return error("Precio neto vacío o no positivo");

  let familia: "puerta" | "accesorio" = "puerta";
  let anchoCodigo: string | undefined;
  let anchoEtiqueta: string;
  let altoCodigo: string | undefined;
  let espesor: number | null = null;
  let tipo: ArticuloImportado["tipo"] = null;

  if (MARCOS.has(modelo)) {
    familia = "accesorio";
    const pulg = numero(f.ancho);
    if (pulg === null) return error("Ancho en pulgadas inválido");
    anchoCodigo = cat.anchos.get(`2X${claveNum(pulg)}`);
    anchoEtiqueta = `${texto(pulg)} pulg.`;
    altoCodigo = cat.altos.get(claveNum(altoM));
  } else if (MOLDURAS.has(modelo)) {
    familia = "accesorio";
    const cm = numero(String(f.ancho ?? "").replace(/cm/i, ""));
    espesor = numero(f.espesor);
    if (cm === null || espesor === null) return error("Ancho en cm o espesor inválido");
    const base = `${claveNum(cm)}X${texto(espesor)}`;
    anchoCodigo = cat.anchos.get(base) ?? base;
    anchoEtiqueta = `${claveNum(cm)} cm × ${texto(espesor)}`;
    altoCodigo = cat.altos.get(`${base}X${claveNum(altoM)}`);
  } else {
    const etiqueta = normalizar(f.ancho);
    anchoCodigo = cat.anchos.get(etiqueta);
    anchoEtiqueta = etiqueta.replace(" A ", " a ");
    altoCodigo = cat.altos.get(claveNum(altoM));
    const t = normalizar(f.tipo).replace(/^PUERTA /, "");
    if (t !== "BLOQUE" && t !== "PANEL" && t !== "ESPECIAL") return error(`Tipo de puerta «${String(f.tipo ?? "")}» no reconocido`);
    tipo = t;
  }
  if (!anchoCodigo) return error(`Ancho «${String(f.ancho ?? "")}» no está en la hoja Categorias`);
  if (!altoCodigo) return error(`Alto o largo ${texto(altoM)} no está en la hoja Categorias`);

  const esperado = `${modeloCodigo}-${maderaCodigo}-${anchoCodigo}-${altoCodigo}`.toUpperCase();
  if (esperado !== codigo) return error(`El código ${codigo} no coincide con modelo, madera y medida (se esperaba ${esperado})`);

  const costoTotal = numero(f.costoTotal);
  const margen = numero(f.margen);
  if (costoTotal !== null && margen !== null && Math.abs(costoTotal * (1 + margen) - precioNeto) > 1) {
    return error("El precio neto no coincide con costo total × (1 + margen)");
  }

  return {
    ok: true,
    articulo: {
      fila: f.fila, codigo, modelo, modeloCodigo, familia, madera, anchoCodigo: anchoCodigo.toUpperCase(), anchoEtiqueta,
      altoCodigo, altoM, espesor, pulgadas: numero(f.pulgadas), tipo,
      costos: { produccion: numero(f.costoProduccion), materiales: numero(f.costoMateriales), insumos: numero(f.costoInsumos), generales: numero(f.costosGenerales), total: costoTotal },
      margen, precioNeto,
    },
  };
}

/** Mapea todas las filas y rechaza códigos repetidos (se conserva la primera aparición). */
export function mapearFilas(filas: FilaPrecio[], cat: Categorias) {
  const validos: ArticuloImportado[] = [];
  const rechazos: { fila: number; motivo: string }[] = [];
  const vistos = new Map<string, number>();
  for (const f of filas) {
    const r = mapearFila(f, cat);
    if (!r.ok) { rechazos.push({ fila: r.fila, motivo: r.motivo }); continue; }
    const previa = vistos.get(r.articulo.codigo);
    if (previa) { rechazos.push({ fila: f.fila, motivo: `Código ${r.articulo.codigo} repetido (ya está en la fila ${previa})` }); continue; }
    vistos.set(r.articulo.codigo, f.fila);
    validos.push(r.articulo);
  }
  return { validos, rechazos };
}
