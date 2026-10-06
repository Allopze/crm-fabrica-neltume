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

export type ResultadoFila =
  | { ok: true; articulo: ArticuloImportado }
  | { ok: false; fila: number; motivo: string; discrepancia?: { codigoHoja: string; conCodigoEsperado: ArticuloImportado } };

export interface Correccion { fila: number; detalle: string }

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

  const costoTotal = numero(f.costoTotal);
  const margen = numero(f.margen);
  if (costoTotal !== null && margen !== null && Math.abs(costoTotal * (1 + margen) - precioNeto) > 1) {
    return error("El precio neto no coincide con costo total × (1 + margen)");
  }

  const esperado = `${modeloCodigo}-${maderaCodigo}-${anchoCodigo}-${altoCodigo}`.toUpperCase();
  const articulo: ArticuloImportado = {
    fila: f.fila, codigo: esperado, modelo, modeloCodigo, familia, madera, anchoCodigo: anchoCodigo.toUpperCase(), anchoEtiqueta,
    altoCodigo, altoM, espesor, pulgadas: numero(f.pulgadas), tipo,
    costos: { produccion: numero(f.costoProduccion), materiales: numero(f.costoMateriales), insumos: numero(f.costoInsumos), generales: numero(f.costosGenerales), total: costoTotal },
    margen, precioNeto,
  };
  if (esperado !== codigo) {
    return { ok: false, fila: f.fila, motivo: `El código ${codigo} no coincide con modelo, madera y medida (se esperaba ${esperado})`, discrepancia: { codigoHoja: codigo, conCodigoEsperado: articulo } };
  }
  return { ok: true, articulo };
}

/**
 * Hipótesis B: los atributos están mal y el código bien. Reconstruye modelo, madera, ancho y alto desde el código de
 * la hoja y vuelve a mapear la fila; sirve solo si el resultado es exactamente ese código.
 */
function conAtributosDelCodigo(f: FilaPrecio, codigoHoja: string, cat: Categorias): ArticuloImportado | null {
  const partes = codigoHoja.split("-");
  if (partes.length !== 4) return null;
  const [mod, mad, ancho, alto] = partes;
  const modelo = [...cat.modelos].find(([, c]) => c.toUpperCase() === mod)?.[0];
  const madera = Object.entries(MADERAS).find(([, c]) => c === mad)?.[0];
  if (!modelo || !madera) return null;
  const corregida: FilaPrecio = { ...f, modelo, madera };
  if (MARCOS.has(modelo)) {
    const pulg = /^2X(\d+(?:\.\d+)?)$/.exec(ancho)?.[1];
    const largo = [...cat.altos].find(([k, l]) => l === alto && /^\d+(\.\d+)?$/.test(k))?.[0];
    if (!pulg || !largo) return null;
    Object.assign(corregida, { ancho: Number(pulg), alto: Number(largo) });
  } else if (MOLDURAS.has(modelo)) {
    const clave = [...cat.altos].find(([k, l]) => l === alto && k.startsWith(`${ancho}X`))?.[0];
    if (!clave) return null;
    Object.assign(corregida, { alto: Number(clave.slice(ancho.length + 1)) });
  } else {
    const etiqueta = [...cat.anchos].find(([, c]) => c.toUpperCase() === ancho)?.[0];
    const altoM = [...cat.altos].find(([k, l]) => l === alto && /^\d+(\.\d+)?$/.test(k))?.[0];
    if (!etiqueta || !altoM) return null;
    Object.assign(corregida, { ancho: etiqueta, alto: Number(altoM) });
  }
  const r = mapearFila(corregida, cat);
  return r.ok && r.articulo.codigo === codigoHoja ? r.articulo : null;
}

const detalleB = (antes: ArticuloImportado, despues: ArticuloImportado) => {
  const cambios = [
    antes.modelo !== despues.modelo && `modelo ${antes.modelo} → ${despues.modelo}`,
    antes.madera !== despues.madera && `madera ${antes.madera} → ${despues.madera}`,
    antes.anchoEtiqueta !== despues.anchoEtiqueta && `ancho ${antes.anchoEtiqueta} → ${despues.anchoEtiqueta}`,
    antes.altoM !== despues.altoM && `${antes.familia === "accesorio" ? "largo" : "alto"} ${texto(antes.altoM)} → ${texto(despues.altoM)} m`,
  ].filter(Boolean);
  return `${despues.codigo}: ${cambios.join(", ")}`;
};

/**
 * Mapea todas las filas y rechaza códigos repetidos (se conserva la primera aparición). Una fila cuyo código no
 * coincide con sus atributos se corrige si exactamente una hipótesis es consistente (REQ-STK-1.6):
 *  A) el código está mal: el código esperado no lo usa ninguna otra fila;
 *  B) los atributos están mal: los del código reconstruyen ese mismo código y nadie más lo usa.
 * Si ambas o ninguna, la fila se rechaza como discrepancia ambigua.
 */
export function mapearFilas(filas: FilaPrecio[], cat: Categorias) {
  const resultados = filas.map((f) => ({ f, r: mapearFila(f, cat) }));
  const usados = new Map<string, number>(); // código → fila, de las filas sin discrepancia
  for (const { f, r } of resultados) if (r.ok && !usados.has(r.articulo.codigo)) usados.set(r.articulo.codigo, f.fila);
  const codigosHoja = new Map<string, number>();
  for (const { f, r } of resultados) if (!r.ok && r.discrepancia) codigosHoja.set(r.discrepancia.codigoHoja, f.fila);

  const validos: ArticuloImportado[] = [];
  const rechazos: { fila: number; motivo: string }[] = [];
  const correcciones: Correccion[] = [];
  const vistos = new Map<string, number>();
  const aceptar = (a: ArticuloImportado, fila: number) => {
    const previa = vistos.get(a.codigo);
    if (previa) { rechazos.push({ fila, motivo: `Código ${a.codigo} repetido (ya está en la fila ${previa})` }); return false; }
    vistos.set(a.codigo, fila);
    validos.push(a);
    return true;
  };
  for (const { f, r } of resultados) {
    if (r.ok) { aceptar(r.articulo, f.fila); continue; }
    if (!r.discrepancia) { rechazos.push({ fila: r.fila, motivo: r.motivo }); continue; }
    const { codigoHoja, conCodigoEsperado } = r.discrepancia;
    const esperado = conCodigoEsperado.codigo;
    const otroUsa = (c: string) => (usados.has(c) && usados.get(c) !== f.fila) || (codigosHoja.has(c) && codigosHoja.get(c) !== f.fila);
    const a = !otroUsa(esperado);
    const b = otroUsa(codigoHoja) ? null : conAtributosDelCodigo(f, codigoHoja, cat);
    if (a && !b) {
      if (aceptar(conCodigoEsperado, f.fila)) correcciones.push({ fila: f.fila, detalle: `Código ${codigoHoja} → ${esperado}` });
    } else if (b && !a) {
      if (aceptar(b, f.fila)) correcciones.push({ fila: f.fila, detalle: detalleB(conCodigoEsperado, b) });
    } else {
      rechazos.push({ fila: f.fila, motivo: `Discrepancia ambigua entre el código ${codigoHoja} y sus atributos (se esperaba ${esperado})` });
    }
  }
  return { validos, rechazos, correcciones };
}
