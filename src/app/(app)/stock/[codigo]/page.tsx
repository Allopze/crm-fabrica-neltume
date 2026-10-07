import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Lock } from "lucide-react";
import { Cifra, Encabezado, Etiqueta, Panel, Placa, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { ErrorDominio } from "@/domain/errores";
import { listaVigente, preciosDeLista } from "@/domain/precios/listas";
import { articuloPorCodigo, movimientosDe, saldo } from "@/domain/stock";
import { clp, cn, fechaHora, metros } from "@/lib/formato";
import { AccionesMovimiento } from "../formulario-movimiento";
import { EditarMinimo } from "./editar-minimo";

export const metadata: Metadata = { title: "Artículo" };

const NOMBRE_TIPO: Record<string, string> = {
  entrada_produccion: "Entrada producción", recepcion: "Recepción", salida_despacho: "Salida despacho", consumo_produccion: "Consumo producción",
  ajuste: "Ajuste", reserva: "Reserva", liberacion: "Liberación",
};

export default async function ArticuloPage({ params }: PageProps<"/stock/[codigo]">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const codigo = decodeURIComponent((await params).codigo);
  const a = await articuloPorCodigo(bd(), codigo).catch((e) => { if (e instanceof ErrorDominio) notFound(); throw e; });
  const vigente = await listaVigente();
  const [s, movimientos, precio] = await Promise.all([
    saldo(bd(), { articuloId: a.id }), movimientosDe(bd(), a.id),
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
        antetitulo={p ? `${p.tipo ? `Puerta ${p.tipo.toLowerCase()}` : "Accesorio"} · ${p.madera.toLowerCase()}` : "Artículo"}
        titulo={<span className="capitalize">{p?.modelo.toLowerCase() ?? a.codigo} <span className="text-tinta-tenue normal-case">{a.anchoEtiqueta} × {metros(Number(a.altoM))} m</span></span>}
        acciones={<div className="flex flex-col items-end gap-3"><Placa codigo={a.codigo} className="px-3 py-1 text-base" />{tipos.length > 0 && <AccionesMovimiento tipos={[...tipos]} csrf={sesion.csrf} codigo={a.codigo} />}</div>}
      />

      <div className="mb-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
        <Cifra etiqueta="Existencia" valor={s.existencia} />
        <Cifra etiqueta="Reservado" valor={s.reservado} nota="en notas de pedido" />
        <Cifra etiqueta="Disponible" valor={s.disponible} tono={a.stockMinimo !== null && s.disponible < a.stockMinimo ? "ambar" : undefined}
          nota={a.stockMinimo !== null ? `mínimo ${a.stockMinimo}` : "sin mínimo"} />
        <Cifra etiqueta="Precio de venta" valor={p ? clp(p.precioVenta) : "—"} nota={p ? `neto · recargo ${Math.round(p.recargo * 100)} % · lista v${precio!.lista.version}` : "sin lista vigente"} />
      </div>

      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1.6fr_1fr]">
        <Panel titulo="Movimientos" accion={<span className="inline-flex items-center gap-1 text-xs text-tinta-tenue"><Lock className="h-3 w-3" /> inmutables</span>} sinRelleno>
          {movimientos.length === 0 ? <Vacio titulo="Sin movimientos aún" /> : (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Referencia</Th><Th>Usuario</Th><Th alinear="der">Cantidad</Th></tr></thead>
              <tbody>
                {movimientos.map((m) => (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap text-tinta-suave">{fechaHora(new Date(m.ocurridoEn).toISOString())}</Td>
                    <Td>{NOMBRE_TIPO[m.tipo] ?? m.tipo}{m.motivo && <span className="block text-xs text-tinta-tenue">Motivo: {m.motivo}</span>}</Td>
                    <Td className="text-tinta-suave">{m.refId ?? (m.refTipo === "ajuste" ? "—" : m.refTipo) ?? "—"}</Td>
                    <Td className="text-tinta-suave">{m.usuario}</Td>
                    <Td alinear="der" className={cn("font-mono font-semibold", Number(m.cantidad) < 0 ? "text-error" : "text-musgo")}>
                      {Number(m.cantidad) > 0 ? "+" : "−"}{Math.abs(Number(m.cantidad))}
                    </Td>
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
            <Panel titulo="Costos y margen" accion={<Etiqueta tono="rauli">costos.ver</Etiqueta>}>
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
