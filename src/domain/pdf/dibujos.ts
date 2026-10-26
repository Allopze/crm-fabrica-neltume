// Dibujos de línea de las puertas y del marco para los PDF (estilo común v1, ADR-0025 D12). Son los de la tienda, copiados
// de su repo (src/servidor/pdf-recursos/dibujos): `dibujos.json` dice qué archivo usa cada modelo del catálogo y dónde está
// la hoja dentro del dibujo, que es lo que permite poner las cotas. Cuando la tienda agrega un modelo hay que copiarlo.
import { readFileSync } from "node:fs";
import path from "node:path";

/** La hoja dentro del dibujo, como fracción del ancho y del alto del lienzo. */
export interface Hoja { izq: number; der: number; arriba: number; abajo: number }
export interface Dibujo {
  /** Archivo PNG en `public/marca/dibujos`; vacío en el esquema genérico, que se dibuja con trazos. */
  archivo: string;
  /** Tamaño del lienzo en píxeles. */
  px: [number, number];
  hoja: Hoja | null;
}

const CARPETA = path.join(process.cwd(), "public/marca/dibujos");
/** Puerta sin dibujo propio: marco, hoja y manilla en el mismo lienzo de 455 × 900 que los dibujos del catálogo. */
export const GENERICO: Dibujo = { archivo: "", px: [455, 900], hoja: { izq: 0.14, der: 0.86, arriba: 0.07, abajo: 0.985 } };

/** «Toltén» → «TOLTEN», «Chan Chan» → «CHANCHAN»: la clave con que se busca un modelo en el manifiesto. */
export const normalizarModelo = (modelo: string) => modelo.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

let manifiesto: Map<string, Dibujo> | null = null;
export function dibujosDelCatalogo(): Map<string, Dibujo> {
  if (!manifiesto) {
    manifiesto = new Map();
    try {
      const json = JSON.parse(readFileSync(path.join(CARPETA, "dibujos.json"), "utf8")) as Record<string, Dibujo>;
      for (const [modelo, d] of Object.entries(json)) manifiesto.set(normalizarModelo(modelo), d);
    } catch {
      // Sin el manifiesto el documento se imprime igual, con el esquema genérico de puerta.
    }
  }
  return manifiesto;
}

const imagenes = new Map<string, Buffer>();
/** Los bytes del PNG de un dibujo, leídos una sola vez. */
export function imagenDelDibujo(d: Dibujo): Buffer {
  let bytes = imagenes.get(d.archivo);
  if (!bytes) { bytes = readFileSync(path.join(CARPETA, d.archivo)); imagenes.set(d.archivo, bytes); }
  return bytes;
}

/** Ancho y alto pedidos, en milímetros. */
export interface Medida { ancho: number; alto: number }

export interface LineaDibujable {
  /** Nombre del modelo del catálogo y su familia; nulos en una línea «a pedido» sin artículo. */
  modelo: string | null;
  familia: "puerta" | "accesorio" | null;
  descripcion: string;
  medida: Medida | null;
}

/**
 * Dibujo de la línea: el del modelo si lo hay (una puerta del catálogo o el marco), el esquema genérico para otra puerta y
 * ninguno para molduras y accesorios. Una línea «a pedido» sin artículo toma el modelo del comienzo de su descripción
 * («Toltén · Raulí · …»); si no es ninguno y trae ancho y alto, es una puerta especial y lleva el esquema genérico.
 */
export function dibujoDe(l: LineaDibujable): Dibujo | null {
  const del = (modelo: string) => dibujosDelCatalogo().get(normalizarModelo(modelo)) ?? null;
  if (l.modelo !== null) {
    if (l.familia === "puerta") return del(l.modelo) ?? GENERICO;
    return normalizarModelo(l.modelo) === "MARCO" ? del("MARCO") : null;
  }
  return del(l.descripcion.split(" · ")[0]) ?? (l.medida ? GENERICO : null);
}

/** Ancho y alto pedidos, en mm, de una medida solicitada como «820 × 2000 mm (Hoja)» o «830 × 2360 mm, vano». */
export function medidaPedida(texto: string | null): Medida | null {
  const m = texto ? /(\d{3,4})\s*[×x]\s*(\d{3,4})\s*mm/i.exec(texto) : null;
  return m ? { ancho: Number(m[1]), alto: Number(m[2]) } : null;
}
