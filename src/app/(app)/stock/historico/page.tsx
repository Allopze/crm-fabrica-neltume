import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Panel, Vacio } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarHistorico } from "@/domain/puertas/consulta";
import { fecha } from "@/lib/formato";
import { PestanasStock } from "../pestanas";

export const metadata: Metadata = { title: "Despachos anteriores" };

/** Despachos de la planilla de la fábrica anteriores a la app, de solo lectura (REQ-STK-10.2). */
export default async function HistoricoPage({ searchParams }: PageProps<"/stock/historico">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const verClientes = sesion.permisos.has("clientes.ver");
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : undefined;
  const desde = typeof sp.desde === "string" ? sp.desde : undefined;
  const { datos, siguiente } = await listarHistorico(bd(), { q, cursor: desde }, verClientes);

  return (
    <>
      <Encabezado titulo="Despachos anteriores" descripcion="Lo que la fábrica despachó antes de usar la app, tal como quedó en su planilla. Es de solo lectura." />
      <PestanasStock actual="historico" />
      <form className="mb-5 flex flex-wrap items-center gap-2" aria-label="Buscar despachos">
        <input type="search" name="q" defaultValue={q} placeholder={verClientes ? "Código, documento, modelo o cliente" : "Código, documento o modelo"} aria-label="Buscar" className={`${campo} w-full sm:w-72`} />
        <button className="h-9 rounded-md border border-linea-fuerte px-3 text-sm hover:border-tinta pointer-coarse:h-11">Buscar</button>
      </form>
      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={q ? "Sin resultados" : "Sin despachos anteriores"}>{q ? "Prueba con otro código o documento." : "El historial se carga junto con la planilla de inventario."}</Vacio>
        ) : (
          <Tabla etiqueta="Despachos anteriores">
            <thead>
              <tr>
                <Th>Código</Th><Th className="hidden md:table-cell">Modelo</Th><Th className="hidden md:table-cell">Medida</Th><Th className="hidden lg:table-cell">Madera</Th>
                <Th className="hidden lg:table-cell">Producción</Th><Th>Estado</Th>{verClientes && <Th className="hidden sm:table-cell">Cliente</Th>}<Th>Documento</Th>
              </tr>
            </thead>
            <tbody>
              {datos.map((h) => (
                <Tr key={h.id}>
                  <Td className="font-mono text-[13px]">
                    {h.codigo ?? "—"}
                    {h.dudas.length > 0 && <span className="block font-sans text-xs text-ambar" title={h.dudas.join(", ")}>dato dudoso: {h.dudas.join(", ")}</span>}
                  </Td>
                  <Td className="hidden capitalize md:table-cell">{h.modelo?.toLowerCase() ?? "—"}</Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave md:table-cell">{h.medida ?? "—"}</Td>
                  <Td className="hidden capitalize text-tinta-suave lg:table-cell">{h.madera?.toLowerCase() ?? "—"}</Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave lg:table-cell">{h.fechaProduccion ? fecha(h.fechaProduccion) : h.fechaTexto ?? "—"}</Td>
                  <Td>{h.estado ?? "—"}</Td>
                  {verClientes && <Td className="hidden sm:table-cell">{h.cliente ?? "—"}</Td>}
                  <Td className="whitespace-nowrap">{h.documento ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      {siguiente && (
        <p className="mt-4 text-sm">
          <Link className="text-rauli hover:underline" href={`/stock/historico?${new URLSearchParams({ ...(q ? { q } : {}), desde: siguiente })}`} aria-label="Ver más despachos anteriores">Ver más</Link>
        </p>
      )}
    </>
  );
}
