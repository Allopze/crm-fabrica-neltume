// Lectura del XML de un DTE de compra (ADR-0021). El XML es dato no confiable: se rechaza cualquier DTD (sin
// entidades externas ni expansiones), tiene tope de tamaño y solo se toman el encabezado y las líneas <Detalle>.
// Acepta el DTE suelto o dentro de <EnvioDTE>, en ISO-8859-1 o UTF-8.
import { SaxesParser } from "saxes";

export const MAX_XML_BYTES = 2 * 1024 * 1024;

export interface LineaDte {
  nro: number; codigo: string | null; nombre: string; cantidad: number | null; unidad: string | null; precioUnitario: number | null;
}
export interface DocumentoDte { tipo: number; folio: number; fechaEmision: string; rutEmisor: string; razonSocial: string; lineas: LineaDte[] }

export class ErrorDte extends Error {}

/** Texto del XML según la codificación que declara (los DTE del SII suelen venir en ISO-8859-1). */
export function decodificarXml(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_XML_BYTES) throw new ErrorDte("El XML supera el tamaño máximo.");
  const cabecera = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const codificacion = /encoding=["']([^"']+)["']/i.exec(cabecera)?.[1]?.toLowerCase() ?? "utf-8";
  const latin = ["iso-8859-1", "iso8859-1", "latin1", "windows-1252"].includes(codificacion);
  try {
    return new TextDecoder(latin ? "latin1" : "utf-8", { fatal: !latin }).decode(bytes);
  } catch {
    throw new ErrorDte("El XML no está en la codificación que declara.");
  }
}

const local = (nombre: string) => nombre.slice(nombre.indexOf(":") + 1);
const numero = (t: string): number | null => {
  const n = Number(t.trim());
  return t.trim() && Number.isFinite(n) ? n : null;
};

/** Documentos del XML con su encabezado y sus líneas. */
export function leerDte(texto: string): DocumentoDte[] {
  if (texto.length > MAX_XML_BYTES) throw new ErrorDte("El XML supera el tamaño máximo.");
  const parser = new SaxesParser();
  const pila: string[] = [];
  const documentos: DocumentoDte[] = [];
  let doc: Partial<DocumentoDte> & { lineas: LineaDte[] } | null = null;
  let linea: Partial<LineaDte> | null = null;
  let buffer = "";
  const dentro = (n: string) => pila.includes(n);

  parser.on("doctype", () => { throw new ErrorDte("El XML trae una declaración DOCTYPE: se rechaza."); });
  parser.on("opentag", (t) => {
    const n = local(t.name);
    pila.push(n);
    buffer = "";
    if (n === "Documento") doc = { lineas: [] };
    else if (n === "Detalle" && doc) linea = {};
  });
  parser.on("text", (t) => { buffer += t; });
  parser.on("cdata", (t) => { buffer += t; });
  parser.on("closetag", (t) => {
    const n = local(t.name);
    const valor = buffer.trim();
    if (doc && linea && dentro("Detalle")) {
      if (n === "NroLinDet") linea.nro = numero(valor) ?? undefined;
      else if (n === "VlrCodigo" && dentro("CdgItem") && !linea.codigo) linea.codigo = valor || null;
      else if (n === "NmbItem") linea.nombre = valor;
      else if (n === "QtyItem") linea.cantidad = numero(valor);
      else if (n === "UnmdItem") linea.unidad = valor || null;
      else if (n === "PrcItem") linea.precioUnitario = numero(valor);
      else if (n === "Detalle") {
        doc.lineas.push({ nro: linea.nro ?? doc.lineas.length + 1, codigo: linea.codigo ?? null, nombre: linea.nombre ?? "",
          cantidad: linea.cantidad ?? null, unidad: linea.unidad ?? null, precioUnitario: linea.precioUnitario ?? null });
        linea = null;
      }
    } else if (doc && dentro("Encabezado")) {
      if (n === "TipoDTE" && dentro("IdDoc")) doc.tipo = numero(valor) ?? undefined;
      else if (n === "Folio" && dentro("IdDoc")) doc.folio = numero(valor) ?? undefined;
      else if (n === "FchEmis" && dentro("IdDoc")) doc.fechaEmision = valor;
      else if (n === "RUTEmisor" && dentro("Emisor")) doc.rutEmisor = valor;
      else if ((n === "RznSoc" || n === "RznSocEmisor") && dentro("Emisor")) doc.razonSocial = valor;
    } else if (n === "Documento" && doc) {
      if (doc.tipo === undefined || doc.folio === undefined || !doc.rutEmisor) throw new ErrorDte("El DTE no trae tipo, folio o RUT del emisor.");
      documentos.push({ tipo: doc.tipo, folio: doc.folio, fechaEmision: doc.fechaEmision ?? "", rutEmisor: doc.rutEmisor, razonSocial: doc.razonSocial ?? "", lineas: doc.lineas });
      doc = null;
    }
    pila.pop();
    buffer = "";
  });
  try {
    parser.write(texto).close();
  } catch (e) {
    if (e instanceof ErrorDte) throw e;
    throw new ErrorDte("El XML no es válido.");
  }
  if (!documentos.length) throw new ErrorDte("El XML no trae ningún DTE.");
  return documentos;
}
