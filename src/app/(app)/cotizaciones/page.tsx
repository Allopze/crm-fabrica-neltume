import type { Metadata } from "next";
import Link from "next/link";
import { BotonLink, Encabezado, Panel, Vacio } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { EstadoCotizacionEtiqueta } from "@/components/ui/estado-cotizacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarCotizaciones } from "@/domain/cotizaciones/consulta";
import { clp, cn, fecha, fechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Cotizaciones" };

const filtros = [
  { valor: "", texto: "Todas" }, { valor: "borrador", texto: "Borradores" }, { valor: "aprobada", texto: "Aprobadas" },
  { valor: "aceptada", texto: "Aceptadas" }, { valor: "vencida", texto: "Vencidas" }, { valor: "ia_fallida", texto: "IA no disponible" },
] as const;

export default async function CotizacionesPage({ searchParams }: PageProps<"/cotizaciones">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("cotizaciones.crear")) return <SinPermiso permiso="cotizaciones.crear" />;
  const sp = await searchParams;
  const estado = filtros.some((f) => f.valor === sp.estado) ? String(sp.estado) : "";
  const texto = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string).slice(0, 80) : "");
  const fechaValida = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(texto(k)) ? texto(k) : "");
  const busqueda = { q: texto("q"), desde: fechaValida("desde"), hasta: fechaValida("hasta") };
  const antesDe = Number(sp.antes) > 0 ? Number(sp.antes) : undefined;
  const verCliente = sesion.permisos.has("clientes.ver");
  const { datos, siguiente } = await listarCotizaciones(bd(), { estado: estado || undefined, q: busqueda.q || undefined, desde: busqueda.desde || undefined, hasta: busqueda.hasta || undefined, antesDe, limite: 50 }, verCliente);
  const conFiltros = (extra: Record<string, string>) =>
    `/cotizaciones?${new URLSearchParams(Object.entries({ estado, ...busqueda, ...extra }).filter(([, v]) => v) as [string, string][])}`;
  const filtrando = Boolean(busqueda.q || busqueda.desde || busqueda.hasta);

  return (
    <>
      <Encabezado
        titulo="Cotizaciones"
        descripcion="Cada cotización guarda el texto original, lo que entendió la IA, la versión de lista usada y quién la aprobó."
        acciones={<BotonLink href="/cotizaciones/manual">Cotizar a mano</BotonLink>}
      />

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
        {filtros.map((f) => (
          <Link key={f.valor} href={conFiltros({ estado: f.valor })} aria-current={estado === f.valor ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-sm pointer-coarse:py-2.5", estado === f.valor ? "bg-tinta text-lamina" : "border border-linea text-tinta-suave hover:border-tinta hover:text-tinta")}>
            {f.texto}
          </Link>
        ))}
      </nav>

      <form method="get" className="mb-5 flex flex-wrap items-center gap-2" aria-label="Buscar cotizaciones">
        {estado && <input type="hidden" name="estado" value={estado} />}
        <input type="search" name="q" defaultValue={busqueda.q} maxLength={80} aria-label="Buscar"
          placeholder={verCliente ? "N.º de cotización o cliente" : "N.º de cotización"} className={`${campo} w-64`} />
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">Desde <input type="date" name="desde" defaultValue={busqueda.desde} className={campo} /></label>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">Hasta <input type="date" name="hasta" defaultValue={busqueda.hasta} className={campo} /></label>
        <button className="h-9 rounded-md border border-linea-fuerte px-3 text-sm hover:border-tinta pointer-coarse:h-11">Buscar</button>
        {filtrando && <Link href={conFiltros({ q: "", desde: "", hasta: "" })} className="text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
      </form>

      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={filtrando || estado ? "Sin resultados" : "Aún no hay cotizaciones"}
            accion={!filtrando && !estado ? <BotonLink href="/cotizaciones/nueva" variante="primario">Nueva cotización</BotonLink> : undefined}>
            {filtrando || estado ? "Prueba con otros filtros." : "Pega el pedido de un cliente para empezar."}
          </Vacio>
        ) : (
          <Tabla etiqueta="Cotizaciones">
            <thead>
              <tr><Th>N.º</Th><Th>Cliente</Th><Th className="hidden md:table-cell">Creada</Th><Th className="hidden lg:table-cell">Origen</Th><Th>Estado</Th><Th className="hidden md:table-cell">Vigencia</Th><Th alinear="der">Total</Th></tr>
            </thead>
            <tbody>
              {datos.map((c) => (
                <Tr key={c.id}>
                  <Td><Link href={`/cotizaciones/${c.id}`} aria-label={`Cotización N.º ${c.numero}`} className="-my-2 inline-block py-2 font-medium tabular-nums text-rauli hover:underline">{c.numero}</Link></Td>
                  <Td className="font-medium">{c.cliente ?? <span className="text-tinta-tenue">sin cliente</span>}</Td>
                  <Td className="hidden text-tinta-suave md:table-cell">{fechaHora(new Date(c.creadoEn).toISOString())}</Td>
                  <Td className="hidden text-tinta-suave lg:table-cell">{c.origen === "ia" ? "Texto + IA" : "Manual"}</Td>
                  <Td>
                    <EstadoCotizacionEtiqueta estado={(c.vencida ? "vencida" : c.estado) as never} pedidoEstado={c.pedidoEstado} />
                    {c.estado === "borrador" && c.pendientes > 0 && <span className="ml-2 whitespace-nowrap text-xs text-ambar">{c.pendientes} por confirmar</span>}
                  </Td>
                  <Td className="hidden text-tinta-suave md:table-cell">{c.vigenciaHasta ? `hasta ${fecha(c.vigenciaHasta)}` : "—"}</Td>
                  <Td alinear="der" className="font-medium">{c.total !== null && Number(c.total) > 0 ? clp(Number(c.total)) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && (
        <p className="mt-4 text-sm">
          <Link href={conFiltros({ antes: String(siguiente) })} aria-label="Ver más cotizaciones" className="text-rauli hover:underline">Ver más</Link>
        </p>
      )}
    </>
  );
}
