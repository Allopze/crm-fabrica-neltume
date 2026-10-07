import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Panel, Placa, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { ESTADOS_FILTRO, type EstadoFiltro, listarPuertas, ubicaciones } from "@/domain/puertas/consulta";
import { PestanasStock } from "../pestanas";
import { Calidad, EstadoPuerta, medidaPuerta } from "./presentacion";

export const metadata: Metadata = { title: "Puertas" };

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";
const ESTADOS: Record<EstadoFiltro, string> = { stock: "En stock", disponibles: "Disponibles", apartadas: "Apartadas", fuera: "Despachadas o de baja", todas: "Todas" };

/** Puerta por puerta: código de etiqueta, ubicación, calidad y estado (REQ-STK-8.6). */
export default async function PuertasPage({ searchParams }: PageProps<"/stock/puertas">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const sp = await searchParams;
  const texto = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const estado = (ESTADOS_FILTRO as readonly string[]).includes(texto("estado") ?? "") ? texto("estado") as EstadoFiltro : "stock";
  const calidad = texto("calidad") === "primera" || texto("calidad") === "segunda" ? texto("calidad") : undefined;
  const filtro = { q: texto("q"), articulo: texto("articulo"), ubicacion: texto("ubicacion"), calidad, estado, fueraCatalogo: texto("fuera") === "1" ? true : undefined, cursor: texto("desde") };
  const [{ datos, siguiente }, lugares] = await Promise.all([listarPuertas(bd(), filtro, sesion.permisos.has("clientes.ver")), ubicaciones(bd())]);
  const params = (extra: Record<string, string>) => new URLSearchParams({
    ...Object.fromEntries(Object.entries({ q: filtro.q, articulo: filtro.articulo, ubicacion: filtro.ubicacion, calidad, estado, fuera: filtro.fueraCatalogo ? "1" : undefined }).filter(([, v]) => v) as [string, string][]),
    ...extra,
  });

  return (
    <>
      <Encabezado titulo="Stock de puertas" descripcion={filtro.articulo
        ? <>Puertas del artículo <span className="font-mono">{filtro.articulo}</span>. <Link href="/stock/puertas" className="text-rauli hover:underline">Ver todas</Link></>
        : "Cada puerta con el código de su etiqueta. Busca por código, modelo u observación."} />
      <PestanasStock actual="puertas" />
      <form className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filtros">
        <input type="search" name="q" defaultValue={filtro.q} placeholder="Código, modelo u observación" aria-label="Buscar" className={`${campo} w-full sm:w-64`} />
        {filtro.articulo && <input type="hidden" name="articulo" value={filtro.articulo} />}
        <select name="estado" defaultValue={estado} className={campo} aria-label="Estado">
          {ESTADOS_FILTRO.map((e) => <option key={e} value={e}>{ESTADOS[e]}</option>)}
        </select>
        <select name="ubicacion" defaultValue={filtro.ubicacion ?? ""} className={campo} aria-label="Ubicación">
          <option value="">Todas las ubicaciones</option>{lugares.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select name="calidad" defaultValue={calidad ?? ""} className={campo} aria-label="Calidad">
          <option value="">Primera y segunda</option><option value="primera">Primera</option><option value="segunda">De segunda</option>
        </select>
        <label className="inline-flex items-center gap-2 px-2 text-sm text-tinta-suave">
          <input type="checkbox" name="fuera" value="1" defaultChecked={filtro.fueraCatalogo} className="accent-[var(--rauli)]" /> Solo fuera de catálogo
        </label>
        <button className="h-9 rounded-md border border-linea-fuerte px-3 text-sm hover:border-tinta pointer-coarse:h-11">Filtrar</button>
      </form>

      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={filtro.q || filtro.ubicacion || calidad || filtro.fueraCatalogo || estado !== "stock" ? "Sin resultados" : "Aún no hay puertas en stock"}>
            {filtro.q || filtro.ubicacion ? "Prueba con otros filtros." : "Las puertas entran al cerrar una orden de producción, con una entrada o con la carga del inventario."}
          </Vacio>
        ) : (
          <Tabla etiqueta="Puertas">
            <thead>
              <tr>
                <Th>Código</Th><Th className="hidden sm:table-cell">Artículo</Th><Th className="hidden md:table-cell">Modelo</Th><Th className="hidden md:table-cell">Medida</Th>
                <Th className="hidden sm:table-cell">Ubicación</Th><Th>Estado</Th><Th className="hidden lg:table-cell">Observación</Th>
              </tr>
            </thead>
            <tbody>
              {datos.map((p) => (
                <Tr key={p.codigo}>
                  <Td><Link href={`/stock/puertas/${encodeURIComponent(p.codigo)}`} className="font-mono text-[13px] text-rauli hover:underline">{p.codigo}</Link></Td>
                  <Td className="hidden sm:table-cell"><Link href={`/stock/${encodeURIComponent(p.articulo)}`}><Placa codigo={p.articulo} className="hover:border-tinta" /></Link></Td>
                  <Td className="hidden capitalize md:table-cell">{p.modelo.toLowerCase()} <Calidad calidad={p.calidad} /></Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave md:table-cell">{medidaPuerta(p)}</Td>
                  <Td className="hidden text-tinta-suave sm:table-cell">{p.ubicacion}</Td>
                  <Td><EstadoPuerta p={p} />{p.apartadaPara && p.apartadaPara !== "Apartada" && <span className="block text-xs text-tinta-tenue">{p.apartadaPara.replace(/^Apartada /, "")}</span>}</Td>
                  <Td className="hidden max-w-xs truncate text-tinta-suave lg:table-cell">{p.observacion ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && <p className="mt-4 text-sm"><Link className="text-rauli hover:underline" href={`/stock/puertas?${params({ desde: siguiente })}`}>Ver más →</Link></p>}
    </>
  );
}
