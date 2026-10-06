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
        antetitulo="Taller · producto terminado"
        titulo="Stock de puertas"
        descripcion="El saldo es la suma de los movimientos: nadie lo edita a mano. Para corregir, registra un ajuste con motivo."
        acciones={tipos.length > 0 && <AccionesMovimiento tipos={[...tipos]} csrf={sesion.csrf} />}
      />

      {alertas.length > 0 && !filtro.bajoMinimo && (
        <Link href="/stock?bajoMinimo=1" role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-ambar/30 bg-ambar-velo px-5 py-3 text-sm text-ambar hover:underline">
          <TriangleAlert className="h-4 w-4" />
          {alertas.length === 1 ? "1 puerta está" : `${alertas.length} puertas están`} bajo su mínimo disponible
          (faltan {alertas.reduce((t, a) => t + a.faltan, 0)} en total). Ver solo esas →
        </Link>
      )}

      <form className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filtros">
        <input type="search" name="q" defaultValue={filtro.q} placeholder="Código o modelo" aria-label="Buscar" className={`${campo} w-56`} />
        <select name="madera" defaultValue={filtro.madera ?? ""} className={campo} aria-label="Madera">
          <option value="">Todas las maderas</option>{MADERAS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <select name="tipo" defaultValue={filtro.tipo ?? ""} className={campo} aria-label="Tipo">
          <option value="">Todos los tipos</option><option value="BLOQUE">Bloque</option><option value="PANEL">Panel</option><option value="ESPECIAL">Especial</option>
        </select>
        <label className="inline-flex items-center gap-2 px-2 text-sm text-tinta-suave">
          <input type="checkbox" name="bajoMinimo" value="1" defaultChecked={filtro.bajoMinimo} className="accent-[var(--rauli)]" /> Solo bajo mínimo
        </label>
        <button className="h-9 rounded-md border border-linea-fuerte px-3 text-sm hover:border-tinta">Filtrar</button>
      </form>

      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={filtro.q || filtro.bajoMinimo ? "Sin resultados" : "Aún no hay puertas en stock"}>
            {filtro.q || filtro.bajoMinimo ? "Prueba con otros filtros." : "Registra una entrada por producción o busca un código del catálogo."}
          </Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th><Th>Modelo</Th><Th>Madera</Th><Th>Medida</Th><Th>Tipo</Th>
                <Th alinear="der">Existencia</Th><Th alinear="der">Reservado</Th><Th alinear="der">Disponible</Th><Th>Nivel</Th>
              </tr>
            </thead>
            <tbody>
              {datos.map((a) => {
                const bajo = a.minimo !== null && a.disponible < a.minimo;
                return (
                  <Tr key={a.codigo}>
                    <Td><Link href={`/stock/${encodeURIComponent(a.codigo)}`}><Placa codigo={a.codigo} className="hover:border-tinta" /></Link></Td>
                    <Td className="font-medium capitalize">{a.modelo.toLowerCase()}</Td>
                    <Td><span className="inline-flex items-center gap-1.5 text-sm capitalize text-tinta-suave">
                      <span aria-hidden className="swatch h-3.5 w-5 rounded-[2px] ring-1 ring-black/10" style={{ backgroundColor: COLOR[a.maderaCodigo] }} />
                      {a.madera.toLowerCase()}</span></Td>
                    <Td className="text-tinta-suave">{a.ancho} × {metros(Number(a.altoM))}</Td>
                    <Td className="capitalize text-tinta-suave">{a.tipo?.toLowerCase() ?? "accesorio"}</Td>
                    <Td alinear="der">{a.existencia}</Td>
                    <Td alinear="der" className="text-tinta-suave">{a.reservado || "—"}</Td>
                    <Td alinear="der" className={cn("font-semibold", bajo && "text-ambar")}>
                      {a.disponible}{bajo && <span className="ml-1 text-[10px] font-medium uppercase tracking-wide">bajo mín.</span>}
                    </Td>
                    <Td><NivelStock existencia={a.existencia} reservado={a.reservado} minimo={a.minimo} /></Td>
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
