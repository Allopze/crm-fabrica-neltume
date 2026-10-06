import type { Metadata } from "next";
import { Encabezado } from "@/components/ui/base";
import { EntradaPedido } from "./entrada-pedido";

export const metadata: Metadata = { title: "Nueva cotización" };

export default function NuevaCotizacionPage() {
  return (
    <>
      <Encabezado
        antetitulo="Cotizador · paso 1 de 3"
        titulo="¿Qué pidió el cliente?"
        descripcion="Pega el correo o el mensaje completo. No hace falta ordenarlo ni corregirlo."
      />
      <EntradaPedido />
    </>
  );
}
