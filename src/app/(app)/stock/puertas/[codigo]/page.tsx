import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Lock } from "lucide-react";
import { Aviso, Encabezado, Panel, Placa, Vacio } from "@/components/ui/base";
import { nombreMovimiento } from "@/components/ui/movimientos";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { ErrorDominio } from "@/domain/errores";
import { obtenerPuerta, ubicaciones } from "@/domain/puertas/consulta";
import { cn, fecha, fechaHora } from "@/lib/formato";
import { Calidad, EstadoPuerta, medidaPuerta } from "../presentacion";
import { AccionesPuerta, EditarPuerta } from "./acciones-puerta";

export const metadata: Metadata = { title: "Puerta" };

function Referencia({ refTipo, refId, refNumero }: { refTipo: string | null; refId: string | null; refNumero: number | null }) {
  if (refTipo === "pedido" && refId && refNumero !== null) return <Link href={`/pedidos/${refId}`} className="text-rauli hover:underline">Nota de pedido N.º {refNumero}</Link>;
  if (refTipo === "orden" && refNumero !== null) return <Link href={refId ? `/produccion?orden=${refId}` : "/produccion"} className="text-rauli hover:underline">Orden N.º {refNumero}</Link>;
  if (refTipo === "manual" && refId) return <>{refId}</>;
  if (refTipo === "inventario") return <>Planilla de inventario</>;
  return <>—</>;
}

/** Una puerta: datos, acciones y toda su historia, incluido el despacho anterior a la app (REQ-STK-8.4–8.6, 10.2). */
export default async function PuertaPage({ params }: PageProps<"/stock/puertas/[codigo]">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const codigo = decodeURIComponent((await params).codigo);
  const verClientes = sesion.permisos.has("clientes.ver");
  const p = await obtenerPuerta(bd(), codigo, verClientes).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const puedeMover = sesion.permisos.has("stock.mover");
  const lugares = puedeMover ? await ubicaciones(bd()) : [];

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/stock" className="hover:text-tinta">Stock de puertas</Link><ChevronRight className="h-3.5 w-3.5" />
        <Link href="/stock/puertas" className="hover:text-tinta">Puertas</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono text-tinta">{p.codigo}</span>
      </nav>
      <Encabezado
        titulo={<span className="font-mono">{p.codigo}</span>}
        meta={<span className="capitalize">{p.modelo.toLowerCase()} · {p.madera.toLowerCase()} · {medidaPuerta(p)} · {p.ubicacion}</span>}
        acciones={<div className="flex items-center gap-2"><Calidad calidad={p.calidad} /><EstadoPuerta p={p} /><Link href={`/stock/${encodeURIComponent(p.articulo)}`}><Placa codigo={p.articulo} className="px-3 py-1 text-base hover:border-tinta" /></Link></div>}
      />
      {p.apartadaPara && (
        <div className="mb-6"><Aviso tono="pizarra" titulo={p.apartadaPara}>No sale en despachos automáticos. Libérala o regístrale la salida cuando se entregue.</Aviso></div>
      )}
      {p.fueraCatalogo && (
        <div className="mb-6"><Aviso tono="neutro" titulo="Fuera de catálogo">No está en la lista de precios: no se cotiza. Se vende registrando su salida con el documento.</Aviso></div>
      )}

      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-8">
          <Panel titulo="Historia" accion={<span className="inline-flex items-center gap-1 text-xs text-tinta-tenue"><Lock className="h-3 w-3" /> inmutable</span>} sinRelleno>
            {p.movimientos.length === 0 ? <Vacio titulo="Sin movimientos" /> : (
              <Tabla etiqueta="Movimientos de la puerta">
                <thead><tr><Th>Fecha</Th><Th>Movimiento</Th><Th>Referencia</Th><Th className="hidden sm:table-cell">Usuario</Th></tr></thead>
                <tbody>
                  {p.movimientos.map((m) => (
                    <Tr key={m.id}>
                      <Td className="whitespace-nowrap text-tinta-suave">{fechaHora(new Date(m.ocurridoEn).toISOString())}</Td>
                      <Td>
                        <span className={cn(m.tipo !== "reserva" && m.tipo !== "liberacion" && (m.cantidad > 0 ? "text-musgo" : "text-error"))}>{nombreMovimiento(m.tipo, "puerta")}</span>
                        {m.motivo && <span className="block text-xs text-tinta-tenue">{m.motivo}</span>}
                      </Td>
                      <Td className="text-tinta-suave"><Referencia refTipo={m.refTipo} refId={m.refId} refNumero={m.refNumero} /></Td>
                      <Td className="hidden text-tinta-suave sm:table-cell">{m.usuario}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Panel>
          {p.historico.length > 0 && (
            <Panel titulo="Despachos anteriores a la app" sinRelleno>
              <Tabla etiqueta="Despachos de la planilla">
                <thead><tr><Th>Estado</Th>{verClientes && <Th>Cliente</Th>}<Th>Documento</Th><Th className="hidden sm:table-cell">Producción</Th></tr></thead>
                <tbody>
                  {p.historico.map((h) => (
                    <Tr key={h.id}>
                      <Td>{h.estado ?? "—"}</Td>{verClientes && <Td>{h.cliente ?? "—"}</Td>}<Td>{h.documento ?? "—"}</Td>
                      <Td className="hidden text-tinta-suave sm:table-cell">{h.fechaProduccion ? fecha(h.fechaProduccion) : h.fechaTexto ?? "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabla>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel titulo="Datos">
            {puedeMover ? (
              <EditarPuerta codigo={p.codigo} ubicacion={p.ubicacion} calidad={p.calidad} observacion={p.observacion} ubicaciones={lugares} csrf={sesion.csrf} />
            ) : (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-tinta-suave">Ubicación</dt><dd>{p.ubicacion}</dd></div>
                <div className="flex justify-between"><dt className="text-tinta-suave">Calidad</dt><dd>{p.calidad === "segunda" ? "De segunda" : "Primera"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-tinta-suave">Observación</dt><dd className="text-right">{p.observacion ?? "—"}</dd></div>
              </dl>
            )}
            <p className="mt-4 border-t border-linea pt-3 text-xs text-tinta-tenue">Producida: {p.fechaProduccion ? fecha(p.fechaProduccion) : "sin fecha"}</p>
          </Panel>
          <Panel titulo="Acciones">
            <AccionesPuerta codigo={p.codigo} existencia={p.existencia} apartada={p.apartada} puedeMover={puedeMover}
              puedeAjustar={sesion.permisos.has("stock.ajustar")} csrf={sesion.csrf} />
          </Panel>
        </div>
      </div>
    </>
  );
}
