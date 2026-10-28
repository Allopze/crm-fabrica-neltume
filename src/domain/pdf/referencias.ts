// Imágenes de referencia del cliente para la nota y la orden de trabajo (estilo común v1 §5, ADR-0025 D14; REQ-COT-4.14).
// Las fotos y croquis que la tienda adjunta a un ítem están en `adjunto_tienda` por su sha256. Al imprimir, cada imagen se
// reduce a 1000 px de lado mayor en JPEG de calidad 80 con fondo blanco (react-pdf no lee WEBP y así el PDF sigue liviano).
// Si las de un documento pasan de 4 MiB entre todas, se baja la calidad (hasta 50) y luego el lado (hasta 320 px).
// Los PDF adjuntos no se incrustan, y una imagen que no se puede leer tampoco: las dos se nombran en la celda del producto.
import { inArray } from "drizzle-orm";
import sharp from "sharp";
import type { Tx } from "@/db/conexion";
import { adjuntoTienda } from "@/db/esquema/integracion";
import { registro } from "@/lib/registro";
import type { Referencia } from "../pedidos/consulta";
import { IMAGENES } from "./estilo";

/** Imagen lista para el PDF: JPEG y su tamaño en píxeles. */
export interface ImagenPdf { data: Buffer; ancho: number; alto: number }
/** Un adjunto del ítem: su nombre y, si es una imagen legible, la imagen ya reducida. */
export interface ReferenciaPdf { nombre: string; imagen: ImagenPdf | null }

const esImagen = (mime: string) => mime.startsWith("image/");

/** La imagen reducida a JPEG, o nula si no se puede decodificar. */
export async function reducirImagen(bytes: Buffer, lado: number = IMAGENES.ladoMaxPx, calidad: number = IMAGENES.calidadJpeg): Promise<ImagenPdf | null> {
  try {
    const { data, info } = await sharp(bytes, { failOn: "error" }).rotate()
      .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: Math.round(calidad * 100) })
      .toBuffer({ resolveWithObject: true });
    return { data, ancho: info.width, alto: info.height };
  } catch {
    return null;
  }
}

/** Pasos del presupuesto: primero baja la calidad de 10 en 10 hasta el mínimo; después el lado, un 20 % cada vez hasta el mínimo. */
function pasos(): { lado: number; calidad: number }[] {
  const lista: { lado: number; calidad: number }[] = [];
  for (let q = IMAGENES.calidadJpeg; q > IMAGENES.calidadJpegMin + 1e-9; q -= 0.1) lista.push({ lado: IMAGENES.ladoMaxPx, calidad: q });
  for (let lado = IMAGENES.ladoMaxPx; lado > IMAGENES.ladoMinPx; lado = Math.round(lado * 0.8)) lista.push({ lado, calidad: IMAGENES.calidadJpegMin });
  lista.push({ lado: IMAGENES.ladoMinPx, calidad: IMAGENES.calidadJpegMin });
  return lista;
}

/** Reduce todas las imágenes de un documento con los mismos lado y calidad, hasta que quepan en el presupuesto del estándar. */
export async function reducirAlPresupuesto(originales: Buffer[], presupuesto: number = IMAGENES.presupuestoBytes): Promise<{ imagenes: (ImagenPdf | null)[]; excede: boolean }> {
  let imagenes: (ImagenPdf | null)[] = [];
  for (const { lado, calidad } of pasos()) {
    imagenes = await Promise.all(originales.map((b) => reducirImagen(b, lado, calidad)));
    if (imagenes.reduce((t, i) => t + (i?.data.length ?? 0), 0) <= presupuesto) return { imagenes, excede: false };
  }
  return { imagenes, excede: true };
}

/** Los adjuntos de cada ítem, en su orden, con las imágenes ya reducidas. Lee de la BD solo las imágenes. */
export async function referenciasDeItems(tx: Tx, items: { referencias: Referencia[] }[]): Promise<ReferenciaPdf[][]> {
  const shas = [...new Set(items.flatMap((i) => i.referencias.filter((r) => esImagen(r.mimeType)).map((r) => r.attachmentId)))];
  const filas = shas.length
    ? await tx.select({ sha256: adjuntoTienda.sha256, contenido: adjuntoTienda.contenido }).from(adjuntoTienda).where(inArray(adjuntoTienda.sha256, shas))
    : [];
  const { imagenes: reducidas, excede } = await reducirAlPresupuesto(filas.map((f) => f.contenido));
  if (excede) registro.warn("imágenes de referencia sobre el presupuesto del estándar", { imagenes: filas.length, presupuestoBytes: IMAGENES.presupuestoBytes });
  const imagenes = new Map(filas.map((f, k) => [f.sha256, reducidas[k]] as const));
  return items.map((i) => i.referencias.map((r) => ({ nombre: r.filename, imagen: esImagen(r.mimeType) ? imagenes.get(r.attachmentId) ?? null : null })));
}
