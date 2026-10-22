import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { FileSpreadsheet, Upload } from "lucide-react";
import { BotonLink, Encabezado, Etiqueta, Panel, Placa, Vacio } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { Filtros } from "@/components/ui/filtros";
import { Paginacion } from "@/components/ui/paginacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { importacion } from "@/db/esquema/catalogo";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarVersiones, listaVigente, opcionesFiltroPrecios, preciosDeLista, recargosDe } from "@/domain/precios/listas";
import { clp, fechaHora, metros, nombreMadera, titulo } from "@/lib/formato";
import { EditarPrecio } from "./editar-precio";
import { EditorRecargos } from "./editor-recargos";

export const metadata: Metadata = { title: "Lista de precios" };

export default async function PreciosPage({ searchParams }: PageProps<"/precios">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 60) : undefined;
  const maderaF = typeof sp.madera === "string" && /^[A-Z]$/.test(sp.madera) ? sp.madera : undefined;
  const tipoF = typeof sp.tipo === "string" && /^[A-ZÁÉÍÓÚ]{3,20}$/.test(sp.tipo) ? sp.tipo : undefined;
  const altoF = typeof sp.alto === "string" && Number(sp.alto) > 0 ? Number(sp.alto) : undefined;
  const filtros = { ...(q ? { q } : {}), ...(maderaF ? { madera: maderaF } : {}), ...(tipoF ? { tipo: tipoF } : {}), ...(altoF ? { alto: String(altoF) } : {}) };
  const filtrando = Object.keys(filtros).length > 0;
  const cursor = typeof sp.desde === "string" ? sp.desde : undefined;
  const puedeEditar = sesion.permisos.has("precios.editar");
  const puedeImportar = puedeEditar && sesion.permisos.has("catalogo.editar");
  const verCostos = sesion.permisos.has("costos.ver");

  const vigente = await listaVigente();
  const acciones = (
    <>
      <BotonLink href="/precios/alias">Alias de modelos</BotonLink>
      {puedeImportar && <BotonLink href="/precios/importar" variante="primario"><Upload className="h-4 w-4" /> Importar Excel</BotonLink>}
    </>
  );
  const encabezado = (
    <Encabezado titulo="Lista de precios" acciones={acciones}
      descripcion="Cada cambio crea una versión nueva. Las cotizaciones aprobadas conservan el precio de la versión con que se emitieron." />
  );
  if (!vigente) {
    return <>{encabezado}<Panel><Vacio titulo="Aún no hay lista de precios" accion={acciones}>Importa el Excel del cotizador para crear el catálogo y la versión 1.</Vacio></Panel></>;
  }

  const [versiones, recargos, precios, [ultima], opciones] = await Promise.all([
    listarVersiones(), recargosDe(vigente.id), preciosDeLista(vigente.version, { q, madera: maderaF, tipo: tipoF, alto: altoF, cursor, limite: 50 }, verCostos),
    bd().select().from(importacion).orderBy(desc(importacion.creadoEn)).limit(1), opcionesFiltroPrecios(),
  ]);
  // Con recargo 0 % el precio de venta es igual al neto de lista: una sola columna.
  const hayRecargo = Object.values(recargos).some((r) => Number(r) > 0);

  return (
    <>
      {encabezado}
      <Panel titulo={<>Precios vigentes <span className="text-tinta-tenue">· v{vigente.version}</span></>} sinRelleno>
        <Filtros etiqueta="Filtrar precios" className="border-b border-linea px-5 py-3">
          <input type="search" name="q" defaultValue={q} maxLength={60} placeholder="Código o modelo" aria-label="Buscar precio" className={`${campo} w-full max-w-56`} />
          <Dropdown name="madera" defaultValue={maderaF ?? ""} aria-label="Madera">
            <option value="">Todas las maderas</option>
            {opciones.maderas.map((m) => <option key={m.codigo} value={m.codigo}>{nombreMadera(m.nombre)}</option>)}
          </Dropdown>
          <Dropdown name="tipo" defaultValue={tipoF ?? ""} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            {opciones.tipos.map((t) => <option key={t} value={t}>{titulo(t)}</option>)}
            <option value="ACCESORIO">Accesorios</option>
          </Dropdown>
          <Dropdown name="alto" defaultValue={altoF ? String(altoF) : ""} aria-label="Alto o largo">
            <option value="">Todo alto o largo</option>
            {opciones.altos.map((a) => <option key={a} value={a}>{metros(a)} m</option>)}
          </Dropdown>
          {filtrando && <Link href="/precios" className="text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
        </Filtros>
        {precios.datos.length === 0 ? (
          <Vacio titulo="Sin resultados">Ningún artículo coincide con los filtros.</Vacio>
        ) : (
          <Tabla etiqueta="Precios vigentes" fija>
            <thead>
              <tr>
                <Th>Código</Th><Th>Modelo</Th><Th className="hidden md:table-cell">Madera</Th><Th className="hidden md:table-cell">Medida (m)</Th><Th className="hidden lg:table-cell">Tipo</Th>
                <Th alinear="der">{hayRecargo ? "Neto lista" : "Neto"}</Th>{hayRecargo && <Th alinear="der">Con recargo</Th>}<Th alinear="der">Con IVA</Th>
                {verCostos && <><Th alinear="der" className="hidden lg:table-cell">Costo</Th><Th alinear="der" className="hidden lg:table-cell">Margen</Th></>}
              </tr>
            </thead>
            <tbody>
              {precios.datos.map((p) => (
                <Tr key={p.codigo}>
                  <Td><Placa codigo={p.codigo} /></Td>
                  <Td className="font-medium">{titulo(p.modelo)}</Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave md:table-cell">{nombreMadera(p.madera)}</Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave tabular-nums md:table-cell">{p.ancho} × {metros(Number(p.altoM))}</Td>
                  <Td className="hidden text-tinta-suave lg:table-cell">{p.tipo ? titulo(p.tipo) : "Accesorio"}</Td>
                  <Td alinear="der">{puedeEditar ? <EditarPrecio codigo={p.codigo} precioNeto={Number(p.precioNeto)} csrf={sesion.csrf} /> : clp(Number(p.precioNeto))}</Td>
                  {hayRecargo && <Td alinear="der" className="font-medium">{clp(p.precioVenta)}</Td>}
                  <Td alinear="der" className="text-tinta-suave">{clp(p.precioVentaConIva)}</Td>
                  {verCostos && "costoTotal" in p && <>
                    <Td alinear="der" className="hidden text-tinta-suave lg:table-cell">{p.costoTotal ? clp(Number(p.costoTotal)) : "—"}</Td>
                    <Td alinear="der" className="hidden text-tinta-suave lg:table-cell">{p.margen !== null && p.margen !== undefined ? `${Math.round(Number(p.margen) * 100)} %` : "—"}</Td>
                  </>}
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      <Paginacion total={precios.total} singular="precio" plural="precios"
        inicio={cursor ? `/precios${filtrando ? `?${new URLSearchParams(filtros)}` : ""}` : undefined}
        siguiente={precios.siguiente ? `/precios?${new URLSearchParams({ ...filtros, desde: precios.siguiente })}` : null} />
      <div className="mt-10 grid items-start gap-8 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
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
                {l.vigente && <Etiqueta tono="rauli" className="self-start">Vigente</Etiqueta>}
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
    </>
  );
}
