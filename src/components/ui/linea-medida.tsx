import { lineaDeMedida } from "@/lib/medida";

/**
 * «Medida solicitada: …» de una línea de la cotización o del pedido en pantalla (REQ-COT-4.12): solo si el título no la dice
 * ya, y con «hoja» o «vano» si el cliente lo indicó (quien vende o produce necesita verlo; el PDF de la cotización no lo imprime).
 */
export function LineaMedida({ titulo, medida, como: Etiqueta = "span" }: { titulo: string; medida: string | null | undefined; como?: "p" | "span" }) {
  const texto = lineaDeMedida(titulo, medida, true);
  return texto ? <Etiqueta className="block text-xs text-tinta-tenue">{texto}</Etiqueta> : null;
}
