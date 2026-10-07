import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Panel, Placa, Vacio } from "@/components/ui/base";
import { NivelStock } from "@/components/ui/nivel-stock";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { TriangleAlert } from "lucide-react";
import { puertasBajoMinimo } from "@/domain/alertas";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarStock } from "@/domain/stock";
import { cn, metros } from "@/lib/formato";
import { AccionesMovimiento } from "./formulario-movimiento";

export const metadata: Metadata = { title: "Stock de puertas" };

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";
const MADERAS = [["O", "Pino Oregón"], ["L", "Lenga"], ["M", "Mara"], ["R", "Raulí"]];
const COLOR: Record<string, string> = { O: "var(--pino-oregon)", L: "var(--lenga)", M: "var(--mara)", R: "var(--rauli-madera)" };

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const sp = await searchParams;
  const texto = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filtro = { q: texto("q"), madera: texto("madera"), tipo: texto("tipo"), bajoMinimo: texto("bajoMinimo") === "1", cursor: texto("desde") };
  const [{ datos, siguiente }, alertas] = await Promise.all([listarStock(bd(), filtro), puertasBajoMinimo(bd())]);
  const tipos = [...(sesion.permisos.has("stock.mover") ? (["entrada", "salida"] as const) : []), ...(sesion.permisos.has("stock.ajustar") ? (["ajuste"] as const) : [])];

  return (
    <>
      <Encabezado
        titulo="Stock de puertas"
        descripcion="El saldo es la suma de los movimientos: nadie lo edita a mano. Para corregir, registra un ajuste con motivo."
        acciones={tipos.length > 0 && <AccionesMovimiento tipos={[...tipos]} csrf={sesion.csrf} />}
      />

      {alertas.length > 0 && !filtro.bajoMinimo && (
        <Link href="/stock?bajoMinimo=1" className="mb-5 flex items-center gap-2 rounded-lg border border-ambar/30 bg-ambar-velo px-5 py-3 text-sm text-ambar hover:underline">
          <TriangleAlert className="h-4 w-4" />
          {alertas.length === 1 ? "1 puerta está" : `${alertas.length} puertas están`} bajo su mínimo disponible
          (faltan {alertas.reduce((t, a) => t + a.faltan, 0)} en total). Ver solo esas →
        </Link>
      )}

      <form className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filtros">
        <input type="search" name="q" defaultValue={filtro.q} placeholder="Código o modelo" aria-label="Buscar" className={`${campo} w-full sm:w-56`} />
        <select name="madera" defaultValue={filtro.madera ?? ""} className={campo} aria-label="Madera">
          <option value="">Todas las maderas</option>{MADERAS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <select name="tipo" defaultValue={filtro.tipo ?? ""} className={campo} aria-label="Tipo">
          <option value="">Todos los tipos</option><option value="BLOQUE">Bloque</option><option value="PANEL">Panel</option><option value="ESPECIAL">Especial</option>
        </select>
        <label className="inline-flex items-center gap-2 px-2 text-sm text-tinta-suave">
          <input type="checkbox" name="bajoMinimo" value="1" defaultChecked={filtro.bajoMinimo} className="accent-[var(--rauli)]" /> Solo bajo mínimo
        </label>
        <button className="h-9 rounded-md border border-linea-fuerte px-3 text-sm hover:border-tinta pointer-coarse:h-11">Filtrar</button>
      </form>

      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={filtro.q || filtro.bajoMinimo ? "Sin resultados" : "Aún no hay puertas en stock"}>
            {filtro.q || filtro.bajoMinimo ? "Prueba con otros filtros." : "Registra una entrada por producción o busca un código del catálogo."}
          </Vacio>
        ) : (
          <Tabla etiqueta="Stock de puertas">
            <thead>
              <tr>
                <Th>Código</Th><Th className="hidden sm:table-cell">Modelo</Th><Th className="hidden md:table-cell">Madera</Th><Th className="hidden md:table-cell">Medida</Th><Th className="hidden lg:table-cell">Tipo</Th>
                <Th alinear="der" className="hidden sm:table-cell">Existencia</Th><Th alinear="der" className="hidden sm:table-cell">Reservado</Th><Th alinear="der">Disponible</Th><Th className="hidden md:table-cell">Nivel</Th>
              </tr>
            </thead>
            <tbody>
              {datos.map((a) => {
                const bajo = a.minimo !== null && a.disponible < a.minimo;
                return (
                  <Tr key={a.codigo}>
                    <Td><Link href={`/stock/${encodeURIComponent(a.codigo)}`}><Placa codigo={a.codigo} className="hover:border-tinta" /></Link></Td>
                    <Td className="hidden font-medium capitalize sm:table-cell">{a.modelo.toLowerCase()}</Td>
                    <Td className="hidden md:table-cell"><span className="inline-flex items-center gap-1.5 text-sm capitalize text-tinta-suave">
                      <span aria-hidden className="swatch h-3.5 w-5 rounded-[2px] ring-1 ring-black/10" style={{ backgroundColor: COLOR[a.maderaCodigo] }} />
                      {MADERAS.find(([c]) => c === a.maderaCodigo)?.[1] ?? a.madera.toLowerCase()}</span></Td>
                    <Td className="hidden whitespace-nowrap text-tinta-suave md:table-cell">{a.ancho} × {metros(Number(a.altoM))}</Td>
                    <Td className="hidden capitalize text-tinta-suave lg:table-cell">{a.tipo?.toLowerCase() ?? "accesorio"}</Td>
                    <Td alinear="der" className="hidden sm:table-cell">{a.existencia}</Td>
                    <Td alinear="der" className="hidden text-tinta-suave sm:table-cell">{a.reservado || "—"}</Td>
                    <Td alinear="der" className={cn("font-semibold", bajo && "text-ambar")}>
                      {a.disponible}{bajo && <span className="ml-1 text-xs font-medium">bajo mín.</span>}
                    </Td>
                    <Td className="hidden md:table-cell"><NivelStock existencia={a.existencia} reservado={a.reservado} minimo={a.minimo} /></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && (
        <p className="mt-4 text-sm">
          <Link className="text-rauli hover:underline" href={`/stock?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filtro).filter(([k, v]) => v && k !== "cursor").map(([k, v]) => [k, v === true ? "1" : String(v)])), desde: siguiente })}`}>Ver más →</Link>
        </p>
      )}
    </>
  );
}
