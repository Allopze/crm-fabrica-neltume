import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Encabezado, Etiqueta } from "@/components/ui/base";
import { EstadoCotizacionEtiqueta } from "@/components/ui/estado-cotizacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { buscarClientes } from "@/domain/clientes";
import { obtenerCotizacion } from "@/domain/cotizaciones/consulta";
import { ErrorDominio } from "@/domain/errores";
import { fechaHora } from "@/lib/formato";
import { EsperaInterpretacion } from "./espera";
import { Revision } from "./revision";

export const metadata: Metadata = { title: "Revisión de cotización" };

export default async function CotizacionPage({ params }: PageProps<"/cotizaciones/[id]">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("cotizaciones.crear")) return <SinPermiso permiso="cotizaciones.crear" />;
  const { id } = await params;
  const verClientes = sesion.permisos.has("clientes.ver");
  const c = await obtenerCotizacion(bd(), id, verClientes).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const clientes = verClientes ? (await buscarClientes(bd(), { limite: 200 })).datos.map((x) => ({ id: x.id, nombre: x.nombre })) : null;

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/cotizaciones" className="hover:text-tinta">Cotizaciones</Link><ChevronRight className="h-3.5 w-3.5" /><span className="text-tinta">#{c.numero}</span>
      </nav>
      <Encabezado
        antetitulo={`Cotizador · ${c.estado === "borrador" || c.estado === "interpretando" ? "paso 2 de 3" : c.estado === "ia_fallida" ? "cotización a mano" : "paso 3 de 3"} · ${fechaHora(new Date(c.creadoEn).toISOString())}`}
        titulo={<>Cotización <span className="text-rauli">#{c.numero}</span></>}
        descripcion={<>{c.cliente ? <>Para <strong className="text-tinta">{c.cliente.nombre}</strong>. </> : null}Revisa lo que entendió la IA: nada se envía sin tu aprobación.</>}
        acciones={
          <div className="flex items-center gap-2">
            {c.vencida ? <Etiqueta>Vencida</Etiqueta> : <EstadoCotizacionEtiqueta estado={c.estado as never} />}
            {c.lista.usada && <Etiqueta tono="pizarra">Lista v{c.lista.usada}{c.lista.desactualizada ? " · hay una más nueva" : ""}</Etiqueta>}
          </div>
        }
      />
      {c.estado === "interpretando"
        ? <EsperaInterpretacion texto={c.textoOriginal ?? ""} />
        : <Revision key={`${c.id}:${c.version}`} inicial={c} csrf={sesion.csrf} puedeAprobar={sesion.permisos.has("cotizaciones.aprobar")} clientes={clientes} />}
    </>
  );
}
