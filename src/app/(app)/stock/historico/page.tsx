import type { Metadata } from "next";
import { Encabezado, Panel, Vacio } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { Filtros } from "@/components/ui/filtros";
import { Paginacion } from "@/components/ui/paginacion";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarHistorico } from "@/domain/puertas/consulta";
import { fecha, nombreMadera, nombrePropio, titulo } from "@/lib/formato";
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
  const { datos, total, siguiente } = await listarHistorico(bd(), { q, cursor: desde }, verClientes);

  return (
    <>
      <Encabezado titulo="Despachos anteriores" descripcion="Lo que la fábrica despachó antes de usar la app, tal como quedó en su planilla. Es de solo lectura." />
      <PestanasStock actual="historico" />
      <Filtros etiqueta="Buscar despachos">
        <input type="search" name="q" defaultValue={q} placeholder={verClientes ? "Código, documento, modelo o cliente" : "Código, documento o modelo"} aria-label="Buscar" className={`${campo} w-full sm:w-72`} />
      </Filtros>
      <Panel sinRelleno>
        {datos.length === 0 ? (
          <Vacio titulo={q ? "Sin resultados" : "Sin despachos anteriores"}>{q ? "Prueba con otro código o documento." : "El historial se carga junto con la planilla de inventario."}</Vacio>
        ) : (
          <Tabla etiqueta="Despachos anteriores" fija>
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
                  <Td className="hidden md:table-cell">{h.modelo ? titulo(h.modelo) : "—"}</Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave md:table-cell">{h.medida ?? "—"}</Td>
                  <Td className="hidden text-tinta-suave lg:table-cell">{h.madera ? nombreMadera(h.madera) : "—"}</Td>
                  <Td className="hidden whitespace-nowrap text-tinta-suave lg:table-cell">{h.fechaProduccion ? fecha(h.fechaProduccion) : h.fechaTexto ?? "—"}</Td>
                  <Td>{h.estado ? nombrePropio(h.estado) : "—"}</Td>
                  {verClientes && <Td className="hidden sm:table-cell">{h.cliente ? nombrePropio(h.cliente) : "—"}</Td>}
                  <Td className="whitespace-nowrap">{h.documento ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
      <Paginacion total={total} singular="despacho" plural="despachos" etiquetaSiguiente="Más antiguos"
        inicio={desde ? `/stock/historico${q ? `?${new URLSearchParams({ q })}` : ""}` : undefined}
        siguiente={siguiente ? `/stock/historico?${new URLSearchParams({ ...(q ? { q } : {}), desde: siguiente })}` : null} />
    </>
  );
}
