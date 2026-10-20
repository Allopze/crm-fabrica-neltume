import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Lock } from "lucide-react";
import { Cifra, Encabezado, Panel, Placa, Vacio } from "@/components/ui/base";
import { maderas, type MaderaId } from "@/components/ui/maderas";
import { nombreMovimiento } from "@/components/ui/movimientos";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { ErrorDominio } from "@/domain/errores";
import { listaVigente, preciosDeLista } from "@/domain/precios/listas";
import { articuloPorCodigo, movimientosDe, saldo } from "@/domain/stock";
import { clp, cn, fechaHora, metros } from "@/lib/formato";
import { listarPuertas, ubicaciones } from "@/domain/puertas/consulta";
import { AccionesMovimiento } from "../formulario-movimiento";
import { Calidad, EstadoPuerta, medidaPuerta } from "../puertas/presentacion";
import { EditarMinimo } from "./editar-minimo";

export const metadata: Metadata = { title: "Artículo" };

/** Referencia legible: el documento con su número y enlace; nunca un id interno. */
function Referencia({ refTipo, refId, refNumero }: { refTipo: string | null; refId: string | null; refNumero: number | null }) {
  if (refTipo === "pedido" && refId && refNumero !== null) return <Link href={`/pedidos/${refId}`} className="text-rauli hover:underline">Nota de pedido N.º {refNumero}</Link>;
  if (refTipo === "orden" && refNumero !== null) return <Link href={refId ? `/produccion?orden=${refId}` : "/produccion"} className="text-rauli hover:underline">Orden N.º {refNumero}</Link>;
  if (refTipo === "manual" && refId) return <>{refId}</>;
  return <>—</>;
}

/** Reserva y liberación no cambian la existencia: se leen aparte, en pizarra, sin signo de entrada o salida. */
function CantidadMovimiento({ tipo, cantidad }: { tipo: string; cantidad: number }) {
  const n = Math.abs(cantidad);
  if (tipo === "reserva" || tipo === "liberacion") {
    const verbo = tipo === "reserva" ? (n === 1 ? "reservada" : "reservadas") : (n === 1 ? "liberada" : "liberadas");
    return <span className="font-mono text-pizarra">{n} <span className="font-sans text-xs">{verbo}</span></span>;
  }
  return <span className={cn("font-mono font-semibold", cantidad < 0 ? "text-error" : "text-musgo")}>{cantidad > 0 ? "+" : "−"}{n}</span>;
}

export default async function ArticuloPage({ params }: PageProps<"/stock/[codigo]">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const codigo = decodeURIComponent((await params).codigo);
  const a = await articuloPorCodigo(bd(), codigo).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const vigente = await listaVigente();
  const [s, movimientos, puertas, lugares, precio] = await Promise.all([
    saldo(bd(), { articuloId: a.id }), movimientosDe(bd(), a.id),
    listarPuertas(bd(), { articulo: a.codigo, limite: 100 }, sesion.permisos.has("clientes.ver")), ubicaciones(bd()),
    vigente ? preciosDeLista(vigente.version, { q: a.codigo, limite: 5 }, sesion.permisos.has("costos.ver")) : null,
  ]);
  const p = precio?.datos.find((x) => x.codigo === a.codigo);
  const tipos = [...(sesion.permisos.has("stock.mover") ? (["entrada", "salida"] as const) : []), ...(sesion.permisos.has("stock.ajustar") ? (["ajuste"] as const) : [])];

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/stock" className="hover:text-tinta">Stock de puertas</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono text-tinta">{a.codigo}</span>
      </nav>
      <Encabezado
        titulo={<span className="capitalize">{p?.modelo.toLowerCase() ?? a.codigo} <span className="text-tinta-tenue normal-case">{a.anchoEtiqueta} × {metros(Number(a.altoM))} m</span></span>}
        meta={p ? `${p.tipo ? `Puerta ${p.tipo.toLowerCase()}` : "Accesorio"} · ${maderas[p.maderaCodigo as MaderaId]?.nombre ?? p.madera.toLowerCase()}` : undefined}
        acciones={<div className="flex flex-col items-end gap-3"><Placa codigo={a.codigo} className="px-3 py-1 text-base" />{tipos.length > 0 && <AccionesMovimiento tipos={[...tipos]} csrf={sesion.csrf} codigo={a.codigo} ubicaciones={lugares} />}</div>}
      />

      <div className="mb-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
        <Cifra etiqueta="Existencia" valor={s.existencia} />
        <Cifra etiqueta="Reservado" valor={s.reservado} nota="en notas de pedido" />
        <Cifra etiqueta="Disponible" valor={s.disponible} tono={a.stockMinimo !== null && s.disponible < a.stockMinimo ? "ambar" : undefined}
          nota={a.stockMinimo !== null ? `mínimo ${a.stockMinimo}` : "sin mínimo"} />
        <Cifra etiqueta="Precio de venta" valor={p ? clp(p.precioVenta) : "—"}
          nota={p ? `neto · recargo ${Math.round(p.recargo * 100)} % · lista v${precio!.lista.version}` : a.fueraCatalogo ? "fuera de catálogo: no se cotiza" : "sin lista vigente"} />
      </div>

      <Panel titulo={`Puertas en stock (${puertas.datos.length}${puertas.siguiente ? "+" : ""})`} className="mb-8" sinRelleno
        accion={<Link href={`/stock/puertas?articulo=${encodeURIComponent(a.codigo)}&estado=todas`} className="text-xs text-rauli hover:underline">Ver todas, también las despachadas →</Link>}>
        {puertas.datos.length === 0 ? <Vacio titulo="No hay puertas de este artículo en stock" /> : (
          <Tabla etiqueta="Puertas en stock">
            <thead><tr><Th>Código</Th><Th className="hidden sm:table-cell">Medida</Th><Th>Ubicación</Th><Th>Estado</Th><Th className="hidden md:table-cell">Observación</Th></tr></thead>
            <tbody>
              {puertas.datos.map((x) => (
                <Tr key={x.codigo}>
                  <Td><Link href={`/stock/puertas/${encodeURIComponent(x.codigo)}`} className="font-mono text-[13px] text-rauli hover:underline">{x.codigo}</Link> <Calidad calidad={x.calidad} /></Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave sm:table-cell">{medidaPuerta(x)}</Td>
                  <Td className="text-tinta-suave">{x.ubicacion}</Td>
                  <Td><EstadoPuerta p={x} /></Td>
                  <Td className="hidden max-w-xs truncate text-tinta-suave md:table-cell">{x.observacion ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1.6fr_1fr]">
        <Panel titulo="Movimientos" accion={<span className="inline-flex items-center gap-1 text-xs text-tinta-tenue"><Lock className="h-3 w-3" /> inmutables</span>} sinRelleno>
          {movimientos.length === 0 ? <Vacio titulo="Sin movimientos aún" /> : (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th className="hidden sm:table-cell">Puerta</Th><Th>Referencia</Th><Th>Usuario</Th><Th alinear="der">Cantidad</Th></tr></thead>
              <tbody>
                {movimientos.map((m) => (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap text-tinta-suave">{fechaHora(new Date(m.ocurridoEn).toISOString())}</Td>
                    <Td>{nombreMovimiento(m.tipo)}{m.motivo && <span className="block text-xs text-tinta-tenue">Motivo: {m.motivo}</span>}</Td>
                    <Td className="hidden sm:table-cell">{m.puerta ? <Link href={`/stock/puertas/${encodeURIComponent(m.puerta)}`} className="font-mono text-[13px] text-rauli hover:underline">{m.puerta}</Link> : <span className="text-tinta-tenue">—</span>}</Td>
                    <Td className="text-tinta-suave"><Referencia refTipo={m.refTipo} refId={m.refId} refNumero={m.refNumero} /></Td>
                    <Td className="text-tinta-suave">{m.usuario}</Td>
                    <Td alinear="der" className="whitespace-nowrap"><CantidadMovimiento tipo={m.tipo} cantidad={Number(m.cantidad)} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel titulo="Ficha">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-tinta-suave">Ancho</dt><dd>{a.anchoEtiqueta}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-suave">Alto o largo</dt><dd>{metros(Number(a.altoM))} m</dd></div>
              <div className="flex justify-between"><dt className="text-tinta-suave">Mínimo</dt>
                <dd>{sesion.permisos.has("config.editar") ? <EditarMinimo codigo={a.codigo} minimo={a.stockMinimo} csrf={sesion.csrf} /> : a.stockMinimo ?? "—"}</dd></div>
            </dl>
          </Panel>
          {p && "costoTotal" in p && (
            <Panel titulo="Costos y margen" accion={<span className="text-xs text-tinta-tenue">solo con permiso de costos</span>}>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-tinta-suave">Costo total</dt><dd>{p.costoTotal ? clp(Number(p.costoTotal)) : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-tinta-suave">Margen de lista</dt><dd>{p.margen !== null && p.margen !== undefined ? `${Math.round(Number(p.margen) * 100)} %` : "—"}</dd></div>
              </dl>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
