import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { resumenCompras } from "@/domain/compras/consulta";
import { listarMapeos, listarProveedores } from "@/domain/compras/proveedores";
import { listarMateriasPrimas } from "@/domain/materias-primas";
import { formatearRut } from "@/domain/rut";
import { cantidad, clp, fecha, numero } from "@/lib/formato";
import { ActivarProveedor, AsociarLinea, NuevoProveedor, SincronizarAhora } from "./acciones";

export const metadata: Metadata = { title: "Compras desde Chipax" };

/** Fecha y hora en Santiago (dd-mm-aaaa hh:mm). */
const enSantiago = (d: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
};
const tipoDoc = (t: number) => (t === 34 ? "Factura exenta" : t === 61 ? "Nota de crédito" : t === 56 ? "Nota de débito" : "Factura");

export default async function ComprasPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const verCostos = sesion.permisos.has("costos.ver");
  const puedeAsociar = sesion.permisos.has("mp.mover") && sesion.permisos.has("mp.editar");
  const [r, proveedores, mapeos, materias] = await Promise.all([resumenCompras(bd(), verCostos), listarProveedores(bd()), listarMapeos(bd()), listarMateriasPrimas(bd())]);
  const activas = materias.filter((m) => m.activo).map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }));
  const { ultima, pendiente } = r.sincronizacion;
  const enCurso = Boolean(pendiente) || Boolean(ultima && !ultima.fin);
  const conteos = (ultima?.conteos ?? null) as Record<string, number> | null;
  const esperaLarga = pendiente?.demorada;

  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/materias-primas" className="hover:text-tinta">Materias primas</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="text-tinta">Compras (Chipax)</span>
      </nav>
      <Encabezado
        titulo="Compras desde Chipax"
        descripcion="Las facturas de compra de los proveedores habilitados suben el stock solas cuando su ítem ya está asociado a una materia prima. Lo nuevo queda por asociar; nada se completa en silencio."
        acciones={sesion.permisos.has("mp.mover") && <SincronizarAhora csrf={sesion.csrf} enCurso={enCurso} />}
      />

      <Panel titulo="Última sincronización" className="mb-8">
        {ultima ? (
          <div className="space-y-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span>{enSantiago(new Date(ultima.inicio!))}</span>
              {ultima.fin ? <Etiqueta tono={ultima.resultado === "ok" ? "musgo" : ultima.resultado === "parcial" ? "ambar" : "error"}>{ultima.resultado === "ok" ? "Completa" : ultima.resultado === "parcial" ? "Parcial" : "Con error"}</Etiqueta>
                : <Etiqueta tono="pizarra">En curso</Etiqueta>}
            </p>
            {conteos && (
              <p className="tabular-nums text-tinta-suave">
                {numero(conteos.leidas ?? 0)} facturas leídas · {numero(conteos.lineasRecibidas ?? 0)} líneas recibidas · {numero(conteos.porAsociar ?? 0)} por asociar · {numero(conteos.porRevisar ?? 0)} por revisar
                {(conteos.xmlPendientes ?? 0) > 0 && <> · {numero(conteos.xmlPendientes)} con el XML aún no disponible (se reintentan)</>}
              </p>
            )}
            {ultima.error && <p role="alert" className="text-error">{ultima.error}</p>}
          </div>
        ) : <p className="text-sm text-tinta-tenue">Aún no hay sincronizaciones. Habilita un proveedor y pulsa «Sincronizar ahora»; luego corre sola cada 30 minutos.</p>}
        {pendiente && <p className="mt-2 text-sm text-pizarra">Pedida a las {enSantiago(new Date(pendiente.solicitadaEn)).slice(11)}; el servicio la toma en segundos.</p>}
        {esperaLarga && <p className="mt-1 text-sm text-ambar">Sigue pendiente: revisa que el servicio de compras esté corriendo (RUNBOOK, «Compras desde Chipax»).</p>}
      </Panel>

      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <Panel titulo={`Por asociar${r.porAsociar.length ? ` (${r.porAsociar.length})` : ""}`}>
            {r.porAsociar.length === 0 ? <p className="text-sm text-tinta-tenue">Nada por asociar: todo lo leído de Chipax ya tiene su materia prima.</p> : (
              <ul className="divide-y divide-linea">
                {r.porAsociar.map((l) => (
                  <li key={l.id} className="py-4 first:pt-0 last:pb-0">
                    <p className="text-xs text-tinta-tenue">{l.proveedor} · {tipoDoc(l.tipo)} {l.folio} · {fecha(l.fechaEmision)}</p>
                    <p className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{l.nombreItem}{l.codigoItem && <span className="ml-2 font-mono text-xs text-tinta-tenue">{l.codigoItem}</span>}</span>
                      <span className="text-sm tabular-nums">{l.cantidad === null ? "—" : cantidad(l.cantidad)} {l.unidad ?? ""}{l.precioUnitario !== null && <span className="ml-2 text-xs text-tinta-tenue">{clp(l.precioUnitario)} c/u</span>}</span>
                    </p>
                    {puedeAsociar && <AsociarLinea id={l.id} item={l.nombreItem} cantidad={l.cantidad} unidad={l.unidad} materias={activas} csrf={sesion.csrf} />}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {r.porRevisar.length > 0 && (
            <Panel titulo={`Por revisar (${r.porRevisar.length})`}>
              <ul className="divide-y divide-linea text-sm">
                {r.porRevisar.map((l) => (
                  <li key={l.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs text-tinta-tenue">{l.proveedor} · {tipoDoc(l.tipo)} {l.folio} · {fecha(l.fechaEmision)}</p>
                    <p className="mt-0.5 flex flex-wrap justify-between gap-2"><span className="font-medium">{l.nombreItem}</span><span className="tabular-nums">{l.cantidad === null ? "—" : cantidad(l.cantidad)} {l.unidad ?? ""}</span></p>
                    <p className="mt-1 text-ambar">{l.motivoRevision} <Link href="/materias-primas" className="ml-1 text-rauli hover:underline">Registrar ajuste</Link></p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel titulo="Facturas leídas" sinRelleno>
            {r.recientes.length === 0 ? (
              <Vacio titulo="Aún no hay facturas leídas">Cuando Chipax entregue la primera factura de un proveedor habilitado, aparecerá aquí.</Vacio>
            ) : (
              <Tabla etiqueta="Facturas leídas de Chipax">
                <thead><tr><Th className="hidden sm:table-cell">Emisión</Th><Th>Proveedor</Th><Th>Documento</Th><Th alinear="der" className="hidden sm:table-cell">Líneas</Th><Th>Estado</Th></tr></thead>
                <tbody>
                  {r.recientes.map((c) => (
                    <Tr key={c.id}>
                      <Td className="hidden whitespace-nowrap text-tinta-suave sm:table-cell">{fecha(c.fechaEmision)}</Td>
                      <Td>{c.proveedor}</Td>
                      <Td className="whitespace-nowrap">{tipoDoc(c.tipo)} {c.folio}</Td>
                      <Td alinear="der" className="hidden tabular-nums sm:table-cell">{c.recibidas} / {c.lineas}</Td>
                      <Td>
                        {c.aviso ? <span className="text-xs text-error">{c.aviso}</span>
                          : c.xmlPendiente ? <Etiqueta tono="pizarra">XML pendiente</Etiqueta>
                          : c.pendientes > 0 ? <Etiqueta tono="ambar">{c.pendientes} por resolver</Etiqueta>
                          : <Etiqueta tono="musgo">Recibida</Etiqueta>}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Panel>
        </div>

        <div className="space-y-8">
          <Panel titulo="Proveedores habilitados">
            {proveedores.length === 0 ? <p className="text-sm text-tinta-tenue">Ninguno todavía. Solo se leen las facturas de los proveedores de esta lista, desde el día en que se habilitan.</p> : (
              <ul className="mb-4 space-y-3 text-sm">
                {proveedores.map((p) => (
                  <li key={p.rut} className="flex items-start justify-between gap-3">
                    <span><span className="font-medium">{p.nombre}</span>{!p.activo && <Etiqueta className="ml-2">Inactivo</Etiqueta>}
                      <span className="block text-xs text-tinta-tenue">{formatearRut(p.rut)} · desde {fecha(p.habilitadoDesde)}</span></span>
                    {sesion.permisos.has("mp.editar") && <ActivarProveedor rut={p.rut} activo={p.activo} csrf={sesion.csrf} />}
                  </li>
                ))}
              </ul>
            )}
            {sesion.permisos.has("mp.editar") && <NuevoProveedor csrf={sesion.csrf} />}
          </Panel>

          {mapeos.length > 0 && (
            <Panel titulo="Ítems asociados">
              <ul className="space-y-2 text-sm">
                {mapeos.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium">{m.descripcion}</span>
                    <span className="block text-xs text-tinta-tenue">{m.proveedor} · {m.ignorar ? "no es materia prima" : `${m.materiaPrima} × ${cantidad(Number(m.factor))} ${m.unidad ?? ""} por ${m.unidadFacturada ?? "unidad"}`}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
