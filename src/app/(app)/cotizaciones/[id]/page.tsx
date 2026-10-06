import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Encabezado, Etiqueta } from "@/components/ui/base";
import { EstadoCotizacionEtiqueta } from "@/components/ui/estado-cotizacion";
import { cotizaciones, nombreCliente } from "@/mock/comercial";
import { fechaHora } from "@/lib/formato";
import { Revision } from "./revision";

export const metadata: Metadata = { title: "Revisión de cotización" };

export default async function CotizacionPage({ params }: PageProps<"/cotizaciones/[id]">) {
  const { id } = await params;
  const c = cotizaciones.find((x) => x.id === id);
  if (!c) notFound();
  const demo = c.items.length > 0 ? c : cotizaciones[0];

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/cotizaciones" className="hover:text-tinta">Cotizaciones</Link>
        <ChevronRight className="h-3.5 w-3.5" /> <span className="text-tinta">#{c.numero}</span>
      </nav>
      <Encabezado
        antetitulo={`Cotizador · paso 2 de 3 · ${fechaHora(c.creada)}`}
        titulo={<>Cotización <span className="text-rauli">#{c.numero}</span></>}
        descripcion={<>Para <strong className="text-tinta">{nombreCliente(c.clienteId)}</strong>. Revisa lo que entendió la IA: nada se envía sin tu aprobación.</>}
        acciones={
          <div className="flex items-center gap-2">
            <EstadoCotizacionEtiqueta estado={c.estado} />
            <Etiqueta tono="pizarra">Lista v{c.listaVersion} · vigente</Etiqueta>
          </div>
        }
      />
      <Revision cotizacion={demo} />
    </>
  );
}
