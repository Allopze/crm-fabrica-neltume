import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { BotonLink, Encabezado, Panel } from "@/components/ui/base";
import { EstadoCotizacionEtiqueta } from "@/components/ui/estado-cotizacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarCotizaciones } from "@/domain/cotizaciones/consulta";
import { clp, cn, fecha, fechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Cotizaciones" };

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

const filtros = [
  { valor: "", texto: "Todas" }, { valor: "borrador", texto: "Borradores" }, { valor: "aprobada", texto: "Aprobadas" },
  { valor: "aceptada", texto: "Aceptadas" }, { valor: "vencida", texto: "Vencidas" }, { valor: "ia_fallida", texto: "IA fallida" },
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
        antetitulo="Ventas · cotizaciones"
        titulo="Cotizaciones"
        descripcion="Cada cotización guarda el texto original, lo que entendió la IA, la versión de lista usada y quién la aprobó."
        acciones={
          <>
            <BotonLink href="/cotizaciones/manual">Cotizar a mano</BotonLink>
            <BotonLink href="/cotizaciones/nueva" variante="primario"><Plus className="h-4 w-4" /> Desde texto</BotonLink>
          </>
        }
      />

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
        {filtros.map((f) => (
          <Link key={f.valor} href={conFiltros({ estado: f.valor })} aria-current={estado === f.valor ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-sm", estado === f.valor ? "bg-tinta text-lamina" : "border border-linea text-tinta-suave hover:border-tinta hover:text-tinta")}>
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
        <button className="h-9 rounded-md border border-linea-fuerte px-3 text-sm hover:border-tinta">Buscar</button>
        {filtrando && <Link href={conFiltros({ q: "", desde: "", hasta: "" })} className="text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
      </form>

      <Panel sinRelleno>
        {datos.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-tinta-tenue">No hay cotizaciones {filtrando || estado ? "con estos filtros" : "todavía"}. Empieza pegando el pedido de un cliente.</p>
        ) : (
          <Tabla>
            <thead>
              <tr><Th>N.º</Th><Th>Cliente</Th><Th>Creada</Th><Th>Origen</Th><Th>Estado</Th><Th>Vigencia</Th><Th alinear="der">Total</Th></tr>
            </thead>
            <tbody>
              {datos.map((c) => (
                <Tr key={c.id}>
                  <Td><Link href={`/cotizaciones/${c.id}`} className="font-mono font-medium text-rauli hover:underline">#{c.numero}</Link></Td>
                  <Td className="font-medium">{c.cliente ?? <span className="text-tinta-tenue">sin cliente</span>}</Td>
                  <Td className="text-tinta-suave">{fechaHora(new Date(c.creadoEn).toISOString())}</Td>
                  <Td className="text-tinta-suave">{c.origen === "ia" ? "Texto + IA" : "Manual"}</Td>
                  <Td>
                    <EstadoCotizacionEtiqueta estado={(c.vencida ? "vencida" : c.estado) as never} />
                    {c.estado === "borrador" && c.pendientes > 0 && <span className="ml-2 text-xs text-ambar">{c.pendientes} por resolver</span>}
                  </Td>
                  <Td className="text-tinta-suave">{c.vigenciaHasta ? `hasta ${fecha(c.vigenciaHasta)}` : "—"}</Td>
                  <Td alinear="der" className="font-medium">{c.total !== null && Number(c.total) > 0 ? clp(Number(c.total)) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && <p className="mt-4 text-sm"><Link href={conFiltros({ antes: String(siguiente) })} className="text-rauli hover:underline">Ver más antiguas</Link></p>}
    </>
  );
}
