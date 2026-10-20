import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { EstadoCotizacionEtiqueta } from "@/components/ui/estado-cotizacion";
import { estadoPago, estadoPedido } from "@/components/ui/estado-pedido";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { obtenerCliente } from "@/domain/clientes";
import { listarCotizaciones } from "@/domain/cotizaciones/consulta";
import { ErrorDominio } from "@/domain/errores";
import { listarPedidos } from "@/domain/pedidos/consulta";
import { formatearRut } from "@/domain/rut";
import { clp, fecha } from "@/lib/formato";
import { EditarCliente } from "./editar-cliente";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientePage({ params }: PageProps<"/clientes/[id]">) {
  const sesion = await requerirSesion();
  // Los datos de clientes son personales: sin permiso se responde como si no existiera.
  if (!sesion.permisos.has("clientes.ver")) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await obtenerCliente(bd(), id).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const [cotizaciones, pedidos] = await Promise.all([
    listarCotizaciones(bd(), { clienteId: c.id, limite: 8 }, true),
    listarPedidos(bd(), { clienteId: c.id, limite: 8 }, true),
  ]);

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/clientes" className="hover:text-tinta">Clientes</Link><ChevronRight className="h-3.5 w-3.5" /><span className="text-tinta">{c.nombre}</span>
      </nav>
      <Encabezado
        titulo={c.nombre}
        meta={`${formatearRut(c.rut)} · ${c.tipo === "tienda" ? "Tienda" : "Cliente directo"} · cliente desde ${fecha(new Date(c.creadoEn).toISOString())}`}
        descripcion={c.giro ?? undefined}
        acciones={sesion.permisos.has("clientes.editar") ? <EditarCliente cliente={c} csrf={sesion.csrf} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <Panel titulo="Cotizaciones recientes" sinRelleno
            accion={<Link href={`/cotizaciones?q=${encodeURIComponent(c.nombre)}`} className="-my-2 py-2 text-sm text-rauli hover:underline">Ver todas</Link>}>
            {cotizaciones.datos.length === 0 ? <Vacio titulo="Sin cotizaciones">Aún no hay cotizaciones para este cliente.</Vacio> : (
              <Tabla etiqueta={`Cotizaciones de ${c.nombre}`}>
                <thead><tr><Th>N.º</Th><Th>Creada</Th><Th>Estado</Th><Th alinear="der">Total</Th></tr></thead>
                <tbody>
                  {cotizaciones.datos.map((x) => (
                    <Tr key={x.id}>
                      <Td><Link href={`/cotizaciones/${x.id}`} className="font-medium tabular-nums text-rauli hover:underline">N.º {x.numero}</Link></Td>
                      <Td className="text-tinta-suave">{fecha(new Date(x.creadoEn).toISOString())}</Td>
                      <Td><EstadoCotizacionEtiqueta estado={(x.vencida ? "vencida" : x.estado) as never} pedidoEstado={x.pedidoEstado} /></Td>
                      <Td alinear="der">{x.total !== null && Number(x.total) > 0 ? clp(Number(x.total)) : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Panel>

          <Panel titulo="Notas de pedido" sinRelleno
            accion={<Link href="/pedidos" className="-my-2 py-2 text-sm text-rauli hover:underline">Ver todas</Link>}>
            {pedidos.datos.length === 0 ? <Vacio titulo="Sin notas de pedido">Aún no hay notas de pedido para este cliente.</Vacio> : (
              <Tabla etiqueta={`Notas de pedido de ${c.nombre}`}>
                <thead><tr><Th>N.º</Th><Th>Creada</Th><Th>Estado</Th><Th>Pago</Th><Th alinear="der">Total</Th></tr></thead>
                <tbody>
                  {pedidos.datos.map((x) => {
                    const ep = estadoPago(x.estadoPago);
                    const ee = estadoPedido(x.estado);
                    return (
                      <Tr key={x.id}>
                        <Td><Link href={`/pedidos/${x.id}`} className="font-medium tabular-nums text-rauli hover:underline">N.º {x.numero}</Link></Td>
                        <Td className="text-tinta-suave">{fecha(new Date(x.creadoEn).toISOString())}</Td>
                        <Td><Etiqueta tono={ee.tono}>{ee.texto}</Etiqueta></Td>
                        <Td><Etiqueta tono={ep.tono}>{ep.texto}</Etiqueta></Td>
                        <Td alinear="der">{clp(x.total)}{x.pagado > 0 && x.pagado < x.total && <span className="block text-xs font-normal text-tinta-tenue">pagado {clp(x.pagado)}</span>}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Tabla>
            )}
          </Panel>
        </div>

        <Panel titulo="Datos">
          <dl className="space-y-3 text-sm">
            {[
              ["RUT", formatearRut(c.rut)], ["Tipo", c.tipo === "tienda" ? "Tienda" : "Cliente directo"], ["Giro", c.giro],
              ["Contacto", c.contacto], ["Correo", c.email], ["Teléfono", c.telefono], ["Dirección", c.direccion],
              ["Comuna", c.comuna], ["Despacho", c.direccionDespacho],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-tinta-suave">{k}</dt><dd className="text-right">{v || "—"}</dd></div>
            ))}
          </dl>
          <p className="mt-4 border-t border-linea pt-3 text-xs text-tinta-tenue">Datos personales: solo se muestran a quien tiene permiso de clientes y nunca se envían a la IA.</p>
        </Panel>
      </div>
    </>
  );
}
