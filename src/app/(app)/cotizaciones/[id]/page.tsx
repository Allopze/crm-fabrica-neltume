import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Encabezado, Etiqueta } from "@/components/ui/base";
import { EstadoCotizacionEtiqueta } from "@/components/ui/estado-cotizacion";
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
  // Sin permiso se responde como si no existiera (REQ-COT-10.2).
  if (!sesion.permisos.has("cotizaciones.crear")) notFound();
  const { id } = await params;
  const verClientes = sesion.permisos.has("clientes.ver");
  const c = await obtenerCotizacion(bd(), id, verClientes).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const clientes = verClientes ? (await buscarClientes(bd(), { limite: 200 })).datos.map((x) => ({ id: x.id, nombre: x.nombre })) : null;

  const aprobada = c.estado === "aprobada" || c.estado === "aceptada";
  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/cotizaciones" className="hover:text-tinta">Cotizaciones</Link><ChevronRight className="h-3.5 w-3.5" /><span className="text-tinta">N.º {c.numero}</span>
      </nav>
      <Encabezado
        titulo={<>Cotización <span className="text-rauli">N.º {c.numero}</span></>}
        meta={`Creada el ${fechaHora(new Date(c.creadoEn).toISOString())} · ${c.origen === "ia" ? "desde el texto del cliente" : "a mano"}`}
        descripcion={<>{c.cliente ? <>Para <strong className="text-tinta">{c.cliente.nombre}</strong>. </> : null}{c.estado === "ia_fallida" ? "La IA no pudo interpretar el pedido: arma los ítems a mano." : c.origen === "ia" && !aprobada ? "Revisa lo que entendió la IA: nada se envía sin tu aprobación." : !aprobada ? "Revisa los ítems: nada se envía sin tu aprobación." : null}</>}
        acciones={
          <div className="flex items-center gap-2">
            {c.vencida ? <Etiqueta>Vencida</Etiqueta> : <EstadoCotizacionEtiqueta estado={c.estado as never} pedidoEstado={c.pedido?.estado} />}
            {c.lista.usada && <Etiqueta tono="pizarra">Lista v{c.lista.usada}{c.lista.desactualizada ? " · hay una más nueva" : ""}</Etiqueta>}
          </div>
        }
      />
      {c.estado === "interpretando"
        ? <EsperaInterpretacion id={c.id} texto={c.textoOriginal ?? ""} />
        : <Revision inicial={c} csrf={sesion.csrf} puedeAprobar={sesion.permisos.has("cotizaciones.aprobar")} puedeDescontar={sesion.permisos.has("descuentos.aplicar")} puedeCrearCliente={sesion.permisos.has("clientes.editar")} clientes={clientes} />}
    </>
  );
}
