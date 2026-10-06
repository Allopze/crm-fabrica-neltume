import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { FileSpreadsheet, Upload } from "lucide-react";
import { BotonLink, Encabezado, Etiqueta, Panel, Placa, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { importacion } from "@/db/esquema/catalogo";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarVersiones, listaVigente, preciosDeLista, recargosDe } from "@/domain/precios/listas";
import { clp, fechaHora, metros } from "@/lib/formato";
import { EditarPrecio } from "./editar-precio";
import { EditorRecargos } from "./editor-recargos";

export const metadata: Metadata = { title: "Lista de precios" };

export default async function PreciosPage({ searchParams }: PageProps<"/precios">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const cursor = typeof sp.desde === "string" ? sp.desde : undefined;
  const puedeEditar = sesion.permisos.has("precios.editar");
  const puedeImportar = puedeEditar && sesion.permisos.has("catalogo.editar");
  const verCostos = sesion.permisos.has("costos.ver");

  const vigente = await listaVigente();
  const acciones = puedeImportar && <BotonLink href="/precios/importar" variante="primario"><Upload className="h-4 w-4" /> Importar Excel</BotonLink>;
  const encabezado = (
    <Encabezado antetitulo="Configuración · precios" titulo="Lista de precios" acciones={acciones}
      descripcion="Cada cambio crea una versión nueva. Las cotizaciones aprobadas conservan el precio de la versión con que se emitieron." />
  );
  if (!vigente) {
    return <>{encabezado}<Panel><Vacio titulo="Aún no hay lista de precios" accion={acciones}>Importa el Excel del cotizador para crear el catálogo y la versión 1.</Vacio></Panel></>;
  }

  const [versiones, recargos, precios, [ultima]] = await Promise.all([
    listarVersiones(), recargosDe(vigente.id), preciosDeLista(vigente.version, { q, cursor, limite: 50 }, verCostos),
    bd().select().from(importacion).orderBy(desc(importacion.creadoEn)).limit(1),
  ]);

  return (
    <>
      {encabezado}
      <div className="mb-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Panel titulo="Versiones" sinRelleno>
          <ol>
            {versiones.map((l) => (
              <li key={l.version} className="flex gap-4 border-b border-linea/70 px-5 py-4 last:border-0">
                <span className={l.vigente
                  ? "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rauli font-display text-lg text-lamina"
                  : "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-linea-fuerte font-display text-lg text-tinta-suave"}>
                  v{l.version}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.descripcion}</p>
                  <p className="text-sm text-tinta-tenue">
                    {l.origen === "excel" ? "Excel" : "Edición"} · {l.autor ?? "—"} · {fechaHora(new Date(l.creadoEn).toISOString())} · {l.articulos.toLocaleString("es-CL")} artículos
                  </p>
                </div>
                {l.vigente && <Etiqueta tono="rauli">vigente</Etiqueta>}
              </li>
            ))}
          </ol>
        </Panel>
        <div className="space-y-8">
          <Panel titulo="Recargo por tipo de puerta">
            <EditorRecargos recargos={recargos} csrf={sesion.csrf} puedeEditar={puedeEditar} />
          </Panel>
          {ultima && (
            <Panel titulo="Última importación">
              <p className="flex items-center gap-3 text-sm">
                <FileSpreadsheet className="h-7 w-7 text-musgo" strokeWidth={1.4} />
                <span><span className="block font-medium">{ultima.nombreArchivo}</span>
                  <span className="text-tinta-tenue">{ultima.creadas} creadas · {ultima.actualizadas} actualizadas · {ultima.rechazadas} rechazadas</span></span>
              </p>
            </Panel>
          )}
        </div>
      </div>

      <Panel titulo={<>Precios vigentes <span className="text-tinta-tenue">· v{vigente.version}</span></>}
        accion={<form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Código o modelo" aria-label="Buscar precio"
          className="h-8 w-48 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none" /></form>} sinRelleno>
        <Tabla>
          <thead>
            <tr>
              <Th>Código</Th><Th>Modelo</Th><Th>Madera</Th><Th>Medida</Th><Th>Tipo</Th><Th alinear="der">Neto lista</Th>
              <Th alinear="der">Venta</Th><Th alinear="der">Con IVA</Th>{verCostos && <><Th alinear="der">Costo</Th><Th alinear="der">Margen</Th></>}
            </tr>
          </thead>
          <tbody>
            {precios.datos.map((p) => (
              <Tr key={p.codigo}>
                <Td><Placa codigo={p.codigo} /></Td>
                <Td className="font-medium capitalize">{p.modelo.toLowerCase()}</Td>
                <Td className="text-tinta-suave capitalize">{p.madera.toLowerCase()}</Td>
                <Td className="text-tinta-suave">{p.ancho} × {metros(Number(p.altoM))}</Td>
                <Td className="text-tinta-suave capitalize">{p.tipo?.toLowerCase() ?? "accesorio"}</Td>
                <Td alinear="der">{puedeEditar ? <EditarPrecio codigo={p.codigo} precioNeto={Number(p.precioNeto)} csrf={sesion.csrf} /> : clp(Number(p.precioNeto))}</Td>
                <Td alinear="der" className="font-medium">{clp(p.precioVenta)}</Td>
                <Td alinear="der" className="text-tinta-suave">{clp(p.precioVentaConIva)}</Td>
                {verCostos && "costoTotal" in p && <>
                  <Td alinear="der" className="text-tinta-suave">{p.costoTotal ? clp(Number(p.costoTotal)) : "—"}</Td>
                  <Td alinear="der" className="text-tinta-suave">{p.margen !== null && p.margen !== undefined ? `${Math.round(Number(p.margen) * 100)} %` : "—"}</Td>
                </>}
              </Tr>
            ))}
          </tbody>
        </Tabla>
        {precios.datos.length === 0 && <Vacio titulo="Sin resultados">No hay artículos que coincidan con «{q}».</Vacio>}
      </Panel>
      {precios.siguiente && (
        <p className="mt-4 text-sm"><Link className="text-rauli hover:underline" href={`/precios?${new URLSearchParams({ ...(q ? { q } : {}), desde: precios.siguiente })}`}>Ver más →</Link></p>
      )}
    </>
  );
}
