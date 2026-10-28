// De las líneas de la nota de la tienda a ítems de la nota de pedido de la fábrica (ADR-0023 §5, D3, D4).
// Precio: venta de la lista vigente sin recargo (NC-12); el de la tienda solo se compara. Un código que la fábrica no
// tiene (alta con IA en la tienda, planilla más nueva) o un pedido especial entra «a pedido», marcado para revisar.
import type { Tx } from "@/db/conexion";
import { clp } from "@/lib/formato";
import { precioDeArticulo } from "../cotizaciones/calculo";
import { articuloConDescripcion } from "../cotizaciones/edicion";
import { alPeso } from "../precios/calcular";
import type { LineaPedido } from "../pedidos/pedidos";
import type { ItemTienda, PedidoTienda } from "./contrato";

/** La medida pedida como la imprime la tienda («820 × 2000 mm (Hoja)»), o armada desde los milímetros. */
export function medidaSolicitada(d: ItemTienda["dimensions"]): string | null {
  if (d.requested?.trim()) return d.requested.trim();
  const tipo = d.measureType === "hoja" || d.measureType === "vano" ? `, ${d.measureType}` : "";
  if (d.widthMm && d.heightMm) return `${d.widthMm} × ${d.heightMm} mm${tipo}`;
  // Marco o moldura: la tienda manda el ancho en `widthMm` solo en los especiales que lo traen (acordado el 27-10-2026).
  const mm = [d.widthMm, d.lengthMm].filter(Boolean).join(" × ");
  if (d.section || mm) return [d.section, mm && `${mm} mm`].filter(Boolean).join(" × ");
  return null;
}

/** Observación del ítem; si la vendedora reescribió la descripción, va primero, porque puede ser una instrucción. */
export function observacionItem(i: ItemTienda, conDescripcionPropia: boolean): string | null {
  const partes = [conDescripcionPropia && i.descriptionEdited ? `Descripción de la tienda: ${i.description}` : null, i.observations?.trim() || null];
  return partes.filter(Boolean).join("\n") || null;
}

/** Descripción de un ítem sin artículo de la fábrica, desde los campos estructurados (nunca desde el PDF). */
export function descripcionEspecial(i: ItemTienda): string {
  const base = i.description.trim() || [i.model, i.wood].filter(Boolean).join(" · ");
  return i.catalogReference ? `${base} (ref. tienda: ${i.catalogReference})` : base;
}

export interface LineaRecibida extends LineaPedido { avisos: string[] }

export async function lineasDelPedido(tx: Tx, o: { items: ItemTienda[]; commercial: Pick<PedidoTienda["commercial"], "lines"> }, listaId: string): Promise<LineaRecibida[]> {
  const precioTienda = new Map(o.commercial.lines.map((l) => [l.lineNumber, l.unitPrice]));
  const lineas: LineaRecibida[] = [];
  for (const i of o.items) {
    const unitarioTienda = precioTienda.get(i.lineNumber) ?? null;
    const referencias = i.references.length ? i.references : null;
    let art: { id: string; descripcion: string } | null = null;
    let lista: number | null = null;
    if (!i.isCustom) {
      try {
        const a = await articuloConDescripcion(tx, i.productCode);
        lista = alPeso((await precioDeArticulo(tx, a.id, listaId)).precioNetoLista);
        art = { id: a.id, descripcion: a.descripcion };
      } catch {
        art = null;
      }
    }
    if (art && lista !== null) {
      const aviso = unitarioTienda !== null && unitarioTienda !== lista
        ? [`${i.productCode}: la nota trae ${clp(unitarioTienda)}; la lista vigente dice ${clp(lista)} (se usa la lista).`] : [];
      lineas.push({ articuloId: art.id, descripcion: art.descripcion, medidaSolicitada: medidaSolicitada(i.dimensions), cantidad: i.quantity,
        precioUnitario: lista, totalLinea: lista * i.quantity, observacion: observacionItem(i, true), revisar: null, referencias, avisos: aviso });
      continue;
    }
    // D3 y D4: «a pedido», con el precio que informó la tienda o $0 «por definir»; una persona lo revisa.
    const motivos = [
      i.isCustom ? "Pedido especial de la tienda" : `El código ${i.productCode} no está en el catálogo de la fábrica (o está inactivo o sin precio): revisar`,
      unitarioTienda === null ? "precio por definir" : null,
    ].filter(Boolean).join("; ");
    const precio = unitarioTienda ?? 0;
    lineas.push({ articuloId: null, descripcion: descripcionEspecial(i), medidaSolicitada: medidaSolicitada(i.dimensions), cantidad: i.quantity,
      precioUnitario: precio, totalLinea: precio * i.quantity, observacion: observacionItem(i, false), revisar: motivos, referencias,
      avisos: [`Línea ${i.lineNumber}: ${motivos}.`] });
  }
  return lineas;
}
