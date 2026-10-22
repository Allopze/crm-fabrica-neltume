import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";
import { Encabezado, Panel, Placa, Vacio } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { FilaEnlazada } from "@/components/ui/fila-enlazada";
import { Filtros } from "@/components/ui/filtros";
import { maderas, type MaderaId } from "@/components/ui/maderas";
import { NivelStock } from "@/components/ui/nivel-stock";
import { Paginacion } from "@/components/ui/paginacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { puertasBajoMinimo } from "@/domain/alertas";
import { requerirSesion } from "@/domain/auth/servidor";
import { ubicaciones } from "@/domain/puertas/consulta";
import { listarStock, ORDENES_STOCK, type OrdenStock } from "@/domain/stock";
import { cn, metros, nombreMadera, titulo } from "@/lib/formato";
import { AccionesMovimiento } from "./formulario-movimiento";
import { PestanasStock } from "./pestanas";

export const metadata: Metadata = { title: "Stock de puertas" };

/** Encabezado que ordena: un clic ordena por esa columna; otro, al revés. Las cifras empiezan por la mayor. */
function Orden({ columna, children, der, orden, dir, enlace }: {
  columna: OrdenStock; children: string; der?: boolean; orden?: OrdenStock; dir?: "desc";
  enlace: (extra: Record<string, string | undefined>) => string;
}) {
  const actual = (orden ?? "codigo") === columna;
  const bajando = actual && dir === "desc";
  const primero = columna === "codigo" || columna === "modelo" ? undefined : "desc";
  const siguienteDir = actual ? (bajando ? undefined : "desc") : primero;
  return (
    <Link href={enlace({ orden: columna === "codigo" && !siguienteDir ? undefined : columna, dir: siguienteDir })}
      aria-label={`Ordenar por ${children.toLowerCase()}`} aria-current={actual ? "true" : undefined}
      className={cn("inline-flex items-center gap-1 hover:text-tinta", der && "flex-row-reverse", actual && "text-tinta")}>
      {children}{actual && (bajando ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
    </Link>
  );
}

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const sp = await searchParams;
  const texto = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const orden = (ORDENES_STOCK as readonly string[]).includes(texto("orden") ?? "") ? texto("orden") as OrdenStock : undefined;
  const dir = texto("dir") === "desc" ? "desc" as const : undefined;
  const filtro = { q: texto("q"), madera: texto("madera"), tipo: texto("tipo"), bajoMinimo: texto("bajoMinimo") === "1", cursor: texto("desde"), orden, dir, pagina: Number(texto("pagina")) || undefined };
  const [{ datos, total, siguiente, paginaSiguiente }, alertas, lugares] = await Promise.all([listarStock(bd(), filtro), puertasBajoMinimo(bd()), ubicaciones(bd())]);
  const tipos = [...(sesion.permisos.has("stock.mover") ? (["entrada", "salida"] as const) : []), ...(sesion.permisos.has("stock.ajustar") ? (["ajuste"] as const) : [])];
  const enlace = (extra: Record<string, string | undefined>) => {
    const p = { q: filtro.q, madera: filtro.madera, tipo: filtro.tipo, bajoMinimo: filtro.bajoMinimo ? "1" : undefined, orden, dir, ...extra };
    return `/stock?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`;
  };
  const ordenAria = (columna: OrdenStock) => ((orden ?? "codigo") === columna ? (dir === "desc" ? "descending" : "ascending") : undefined);

  return (
    <>
      <Encabezado
        titulo="Artículos en stock"
        descripcion="Cada puerta tiene su código y el saldo es la suma de sus movimientos: nadie lo edita a mano. Para corregir, registra un ajuste con motivo."
        acciones={tipos.length > 0 && <AccionesMovimiento tipos={[...tipos]} csrf={sesion.csrf} ubicaciones={lugares} />}
      />
      <PestanasStock actual="articulos" />

      {alertas.length > 0 && !filtro.bajoMinimo && (
        <Link href="/stock?bajoMinimo=1" className="mb-5 flex items-center gap-2 rounded-lg border border-ambar/30 bg-ambar-velo px-5 py-3 text-sm text-ambar hover:underline">
          <TriangleAlert className="h-4 w-4" />
          {alertas.length === 1 ? "1 puerta está" : `${alertas.length} puertas están`} bajo su mínimo disponible
          (faltan {alertas.reduce((t, a) => t + a.faltan, 0)} en total). Ver solo esas →
        </Link>
      )}

      <Filtros>
        <input type="search" name="q" defaultValue={filtro.q} placeholder="Código o modelo" aria-label="Buscar" className={`${campo} w-full sm:w-56`} />
        <Dropdown name="madera" defaultValue={filtro.madera ?? ""} aria-label="Madera">
          <option value="">Todas las maderas</option>{Object.entries(maderas).map(([c, m]) => <option key={c} value={c}>{m.nombre}</option>)}
        </Dropdown>
        <Dropdown name="tipo" defaultValue={filtro.tipo ?? ""} aria-label="Tipo">
          <option value="">Todos los tipos</option><option value="BLOQUE">Bloque</option><option value="PANEL">Panel</option><option value="ESPECIAL">Especial</option>
        </Dropdown>
        <label className="inline-flex min-h-9 items-center gap-2 px-2 text-sm text-tinta-suave pointer-coarse:min-h-11">
          <input type="checkbox" name="bajoMinimo" value="1" defaultChecked={filtro.bajoMinimo} /> Solo bajo mínimo
        </label>
        {orden && <input type="hidden" name="orden" value={orden} />}
        {dir && <input type="hidden" name="dir" value={dir} />}
      </Filtros>

      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={filtro.q || filtro.bajoMinimo ? "Sin resultados" : "Aún no hay puertas en stock"}>
            {filtro.q || filtro.bajoMinimo ? "Prueba con otros filtros." : "Registra una entrada por producción o busca un código del catálogo."}
          </Vacio>
        ) : (
          <Tabla etiqueta="Stock de puertas" fija>
            <thead>
              <tr>
                <Th aria-sort={ordenAria("codigo")}><Orden columna="codigo" orden={orden} dir={dir} enlace={enlace}>Código</Orden></Th>
                <Th aria-sort={ordenAria("modelo")} className="hidden sm:table-cell"><Orden columna="modelo" orden={orden} dir={dir} enlace={enlace}>Modelo</Orden></Th>
                <Th className="hidden md:table-cell">Medida (m)</Th>
                <Th aria-sort={ordenAria("existencia")} alinear="der" className="hidden sm:table-cell"><Orden columna="existencia" der orden={orden} dir={dir} enlace={enlace}>Existencia</Orden></Th>
                <Th aria-sort={ordenAria("reservado")} alinear="der" className="hidden sm:table-cell"><Orden columna="reservado" der orden={orden} dir={dir} enlace={enlace}>Reservado</Orden></Th>
                <Th aria-sort={ordenAria("disponible")} alinear="der"><Orden columna="disponible" der orden={orden} dir={dir} enlace={enlace}>Disponible</Orden></Th>
                <Th className="hidden lg:table-cell">Nivel</Th>
              </tr>
            </thead>
            <tbody>
              {datos.map((a) => {
                const bajo = a.minimo !== null && a.disponible < a.minimo;
                const madera = maderas[a.maderaCodigo as MaderaId];
                const medida = `${a.ancho} × ${metros(Number(a.altoM))}`;
                return (
                  <FilaEnlazada key={a.codigo} href={`/stock/${encodeURIComponent(a.codigo)}`}>
                    <Td>
                      <Link href={`/stock/${encodeURIComponent(a.codigo)}`}><Placa codigo={a.codigo} partible className="hover:border-tinta" /></Link>
                      {/* En el celular las columnas secundarias se esconden: el modelo y la medida van bajo el código. */}
                      <span className="mt-1 block text-xs text-tinta-tenue sm:hidden">{titulo(a.modelo)} · {madera?.nombre ?? nombreMadera(a.madera)} · <span className="whitespace-nowrap">{medida}</span></span>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="block font-medium">{titulo(a.modelo)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tinta-tenue">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span aria-hidden className="swatch h-3 w-4 rounded-[2px] ring-1 ring-black/10" style={{ backgroundColor: madera?.css }} />
                          {madera?.nombre ?? nombreMadera(a.madera)}
                        </span>
                        <span>· {a.tipo ? titulo(a.tipo) : "Accesorio"}</span>
                        {a.fueraCatalogo && <span className="whitespace-nowrap rounded-full bg-pizarra-velo px-1.5 text-pizarra">fuera de catálogo</span>}
                      </span>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-tinta-suave tabular-nums md:table-cell">{medida}</Td>
                    <Td alinear="der" className="hidden sm:table-cell">{a.existencia}</Td>
                    <Td alinear="der" className="hidden text-tinta-suave sm:table-cell">{a.reservado || "—"}</Td>
                    <Td alinear="der" className={cn("whitespace-nowrap font-semibold", bajo && "text-ambar")}>
                      {a.disponible}{bajo && <span className="ml-1 text-xs font-medium">bajo mín.</span>}
                    </Td>
                    <Td className="hidden whitespace-nowrap lg:table-cell"><NivelStock existencia={a.existencia} reservado={a.reservado} minimo={a.minimo} /></Td>
                  </FilaEnlazada>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Panel>
      <Paginacion total={total} singular="artículo" plural="artículos"
        inicio={filtro.cursor || (filtro.pagina ?? 1) > 1 ? enlace({}) : undefined}
        siguiente={siguiente ? enlace({ desde: siguiente }) : paginaSiguiente ? enlace({ pagina: String(paginaSiguiente) }) : null} />
    </>
  );
}
