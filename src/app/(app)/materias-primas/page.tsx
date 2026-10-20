import type { Metadata } from "next";
import Link from "next/link";
import { Boton, BotonLink, Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { materiasParaReponer } from "@/domain/alertas";
import { requerirSesion } from "@/domain/auth/servidor";
import { materiasDesdeChipax } from "@/domain/compras/consulta";
import { listarMateriasPrimas, listarUnidades } from "@/domain/materias-primas";
import { cn, fecha, numero } from "@/lib/formato";
import { ConteoExistencias } from "./conteo";
import { EditarMinimoMp } from "./editar-minimo-mp";
import { FormularioAjusteMp, FormularioNuevaMp, FormularioRecepcion } from "./formularios-mp";

export const metadata: Metadata = { title: "Materias primas" };

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none pointer-coarse:h-11";
const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default async function MateriasPrimasPage({ searchParams }: PageProps<"/materias-primas">) {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const soloBajo = sp.bajoMinimo === "1";
  const recibir = typeof sp.recibir === "string" ? sp.recibir : undefined;
  const [todas, unidades, reponer, desdeChipax] = await Promise.all([listarMateriasPrimas(bd()), listarUnidades(bd()), materiasParaReponer(bd()), materiasDesdeChipax(bd())]);
  const faltan = new Map(reponer.map((m) => [m.id, m.faltan]));
  const materias = todas.filter((m) => (!q || sinTildes(m.nombre).includes(sinTildes(q))) && (!soloBajo || faltan.has(m.id)));
  const recibe = sesion.permisos.has("mp.mover");
  const editaMinimo = sesion.permisos.has("config.editar");
  const activas = todas.filter((m) => m.activo);
  const opciones = activas.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }));

  return (
    <>
      <Encabezado
        titulo="Materias primas"
        descripcion="Madera, tableros, colas y barnices. Las recepciones suman stock y el cierre de cada orden de producción lo descuenta según el BOM."
        acciones={<>
          <BotonLink href="/materias-primas/compras">Compras (Chipax)</BotonLink>
          {sesion.permisos.has("mp.editar") && <FormularioNuevaMp unidades={unidades} csrf={sesion.csrf} />}
        </>}
      />
      {activas.length > 0 && (sesion.permisos.has("stock.ajustar") || editaMinimo) && (
        <ConteoExistencias csrf={sesion.csrf} puedeAjustar={sesion.permisos.has("stock.ajustar")} puedeMinimo={editaMinimo}
          filas={activas.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad, existencia: m.existencia, minimo: m.stockMinimo }))} />
      )}
      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1fr_340px]">
        <Panel titulo="Existencias" accion={reponer.length > 0 && <Link href="/materias-primas?bajoMinimo=1"><Etiqueta tono="ambar">{reponer.length} bajo el mínimo</Etiqueta></Link>} sinRelleno>
          {todas.length > 0 && (
            <form method="get" role="search" aria-label="Filtrar materias primas" className="flex flex-wrap items-center gap-2 border-b border-linea px-5 py-3">
              <input type="search" name="q" defaultValue={q} maxLength={80} placeholder="Buscar materia prima" aria-label="Buscar materia prima" className={`${campo} w-full max-w-64`} />
              <label className="flex items-center gap-2 text-sm text-tinta-suave"><input type="checkbox" name="bajoMinimo" value="1" defaultChecked={soloBajo} className="accent-[var(--rauli)]" /> Solo bajo el mínimo</label>
              <Boton type="submit">Filtrar</Boton>
              {(q || soloBajo) && <Link href="/materias-primas" className="text-sm text-tinta-suave hover:text-tinta">Limpiar</Link>}
              <span className="ml-auto text-sm text-tinta-tenue">{q || soloBajo ? `${materias.length} de ${todas.length}` : `${todas.length} materias primas`}</span>
            </form>
          )}
          {todas.length === 0 ? (
            <Vacio titulo="Aún no hay materias primas">Crea la primera con «Nueva materia prima».</Vacio>
          ) : materias.length === 0 ? (
            <Vacio titulo="Sin resultados">Ninguna materia prima coincide con el filtro.</Vacio>
          ) : (
            <Tabla etiqueta="Existencias de materias primas">
              <thead><tr><Th>Materia prima</Th><Th>Unidad</Th><Th alinear="der">Existencia</Th><Th alinear="der">Mínimo</Th><Th className="hidden md:table-cell">Última recepción</Th>{recibe && <Th><span className="sr-only">Acciones</span></Th>}</tr></thead>
              <tbody>
                {materias.map((m) => {
                  const baja = m.stockMinimo !== null && m.existencia < m.stockMinimo;
                  return (
                    <Tr key={m.id} className={cn(!m.activo && "opacity-50")}>
                      <Td className="font-medium">{m.nombre}{!m.activo && <span className="ml-2 text-xs text-tinta-tenue">(inactiva)</span>}</Td>
                      <Td className="font-mono text-xs text-tinta-suave">{m.unidad}</Td>
                      <Td alinear="der" className={cn("font-semibold", baja && "text-ambar")}>
                        {numero(m.existencia)}
                        {baja && <span className="block whitespace-nowrap text-xs font-normal">faltan {numero(faltan.get(m.id) ?? m.stockMinimo! - m.existencia)}</span>}
                      </Td>
                      <Td alinear="der" className="text-tinta-suave">
                        {editaMinimo ? <EditarMinimoMp id={m.id} nombre={m.nombre} minimo={m.stockMinimo} csrf={sesion.csrf} /> : m.stockMinimo === null ? "—" : numero(m.stockMinimo)}
                      </Td>
                      <Td className="hidden whitespace-nowrap text-tinta-suave md:table-cell">{m.ultimaRecepcion ? fecha(new Date(m.ultimaRecepcion).toISOString()) : "—"}</Td>
                      {recibe && (
                        <Td className="text-right">
                          {m.activo && <Link href={`/materias-primas?${new URLSearchParams({ ...(q ? { q } : {}), ...(soloBajo ? { bajoMinimo: "1" } : {}), recibir: m.id })}#recepcion`} scroll={false}
                            className="-my-2 inline-block py-2 text-sm font-medium text-rauli hover:underline">Recibir<span className="sr-only"> {m.nombre}</span></Link>}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
        </Panel>
        <div className="space-y-8 self-start">
          {recibe && activas.length > 0 && (
            <div id="recepcion" className="scroll-mt-20">
              <Panel titulo="Registrar recepción">
                <FormularioRecepcion key={recibir} materias={opciones} inicial={recibir} csrf={sesion.csrf} desdeChipax={desdeChipax} />
              </Panel>
            </div>
          )}
          {sesion.permisos.has("stock.ajustar") && activas.length > 0 && (
            <Panel titulo="Ajuste con motivo">
              <FormularioAjusteMp materias={opciones} csrf={sesion.csrf} />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
