// Pedido directo desde la nota de pedido en PDF de la tienda (ADR-0008; REQ-COT-8.6–8.9). Precio: venta de la lista
// vigente sin recargo (NC-12). El archivo no se guarda (solo su hash) y no se guardan datos del cliente final.
import { createHash } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import type { Tx } from "@/db/conexion";
import { cliente, notaPedido } from "@/db/esquema/comercial";
import { clp } from "@/lib/formato";
import type { Actor, Origen } from "../auditoria";
import { listaVigenteId, precioDeArticulo } from "../cotizaciones/calculo";
import { articuloConDescripcion } from "../cotizaciones/edicion";
import { ErrorDominio } from "../errores";
import { alPeso } from "../precios/calcular";
import { leerNotaTienda, NotaIlegible, type NotaTienda } from "./nota-tienda";
import { esPdf, fragmentosPdf, MAX_PDF_BYTES } from "./pdf-texto";
import { insertarPedido } from "./pedidos";

export interface LineaPrevista {
  codigo: string; cantidad: number; medidaSolicitada: string | null; precioNota: number;
  articulo: { id: string; descripcion: string } | null; precioLista: number | null; aviso: string | null;
}
export interface VistaPrevia { nota: NotaTienda; hash: string; lineas: LineaPrevista[]; errores: string[]; duplicada: { id: string; numero: number } | null }

/** Lee y valida la nota contra el catálogo y la lista vigente, sin escribir nada. */
export async function prepararNotaTienda(tx: Tx, datos: Uint8Array, clienteId?: string | null): Promise<VistaPrevia> {
  if (datos.length > MAX_PDF_BYTES) throw new ErrorDominio("VALIDACION", "El PDF supera 5 MB.");
  if (!esPdf(datos)) throw new ErrorDominio("VALIDACION", "El archivo no es un PDF.");
  let nota: NotaTienda;
  try {
    nota = leerNotaTienda(await fragmentosPdf(datos));
  } catch (e) {
    if (e instanceof NotaIlegible) throw new ErrorDominio("NOTA_ILEGIBLE", e.message);
    throw new ErrorDominio("NOTA_ILEGIBLE", "No se pudo leer el PDF. ¿Es la nota de pedido que genera el cotizador de la tienda?");
  }
  const hash = createHash("sha256").update(datos).digest("hex");
  const listaId = await listaVigenteId(tx);
  const errores: string[] = [];
  const lineas: LineaPrevista[] = [];
  for (const l of nota.lineas) {
    let art: { id: string; descripcion: string } | null = null;
    let precioLista: number | null = null;
    try {
      const a = await articuloConDescripcion(tx, l.codigo);
      art = { id: a.id, descripcion: a.descripcion };
      precioLista = alPeso((await precioDeArticulo(tx, a.id, listaId)).precioNetoLista);
    } catch {
      errores.push(`El código ${l.codigo} no existe, está inactivo o no tiene precio en la lista vigente.`);
    }
    const aviso = precioLista !== null && precioLista !== l.precioUnitario
      ? `La nota trae ${clp(l.precioUnitario)}; la lista vigente dice ${clp(precioLista)} (se usa la lista).` : null;
    lineas.push({ codigo: l.codigo, cantidad: l.cantidad, medidaSolicitada: l.medidaSolicitada, precioNota: l.precioUnitario, articulo: art, precioLista, aviso });
  }
  const condicion = clienteId ? or(eq(notaPedido.archivoHash, hash), and(eq(notaPedido.clienteId, clienteId), eq(notaPedido.refExterna, nota.numero))) : eq(notaPedido.archivoHash, hash);
  const [dup] = await tx.select({ id: notaPedido.id, numero: notaPedido.numero }).from(notaPedido).where(condicion);
  return { nota, hash, lineas, errores, duplicada: dup ?? null };
}

export interface DatosPedidoDirecto {
  clienteId: string;
  direccionDespacho?: string | null; medioTransporte?: string | null; entregaComprometida?: string | null; observaciones?: string | null;
}

export async function crearPedidoDirecto(tx: Tx, datos: Uint8Array, d: DatosPedidoDirecto, actor: Actor & { id: string }, origen: Origen) {
  const [cli] = await tx.select().from(cliente).where(eq(cliente.id, d.clienteId));
  if (!cli) throw new ErrorDominio("NO_ENCONTRADO", "Cliente no encontrado");
  if (cli.tipo !== "tienda") throw new ErrorDominio("VALIDACION", "La nota de la tienda se carga a un cliente de tipo «tienda».");
  const v = await prepararNotaTienda(tx, datos, d.clienteId);
  if (v.duplicada) throw new ErrorDominio("YA_IMPORTADA", `Esta nota ya se cargó como la nota de pedido N.º ${v.duplicada.numero}.`, { id: v.duplicada.id });
  if (v.errores.length) throw new ErrorDominio("VALIDACION", "La nota tiene códigos que no se pueden pedir.", { errores: v.errores });
  const texto = (x: string | null | undefined, porDefecto: string | null) => (x === undefined ? porDefecto : x?.trim() || null);
  const p = await insertarPedido(tx, {
    cabecera: {
      cotizacionId: null, clienteId: d.clienteId, origen: "nota_tienda", refExterna: v.nota.numero, archivoHash: v.hash,
      proyecto: v.nota.despacho.proyecto,
      direccionDespacho: texto(d.direccionDespacho, v.nota.despacho.direccion),
      medioTransporte: texto(d.medioTransporte, v.nota.despacho.transporte),
      entregaComprometida: texto(d.entregaComprometida, v.nota.despacho.entregaComprometida),
      observaciones: texto(d.observaciones, null),
    },
    lineas: v.lineas.map((l) => ({
      articuloId: l.articulo!.id, descripcion: l.articulo!.descripcion, medidaSolicitada: l.medidaSolicitada,
      cantidad: l.cantidad, precioUnitario: l.precioLista!, totalLinea: l.precioLista! * l.cantidad,
    })),
  }, actor, origen, { notaTienda: v.nota.numero, refCotizacionTienda: v.nota.refCotizacion, avisosPrecio: v.lineas.filter((l) => l.aviso).length });
  return { ...p, avisos: [...v.nota.avisos, ...v.lineas.flatMap((l) => (l.aviso ? [`${l.codigo}: ${l.aviso}`] : []))] };
}
