import type { Metadata } from "next";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { materiasParaReponer } from "@/domain/alertas";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarMateriasPrimas, listarUnidades } from "@/domain/materias-primas";
import { cn, fecha, numero } from "@/lib/formato";
import { ConteoExistencias } from "./conteo";
import { EditarMinimoMp } from "./editar-minimo-mp";
import { FormularioAjusteMp, FormularioNuevaMp, FormularioRecepcion } from "./formularios-mp";

export const metadata: Metadata = { title: "Materias primas" };

export default async function MateriasPrimasPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const [materias, unidades, reponer] = await Promise.all([listarMateriasPrimas(bd()), listarUnidades(bd()), materiasParaReponer(bd())]);
  const editaMinimo = sesion.permisos.has("config.editar");
  const activas = materias.filter((m) => m.activo);
  const opciones = activas.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }));

  return (
    <>
      <Encabezado
        antetitulo="Taller · insumos"
        titulo="Materias primas"
        descripcion="Madera, tableros, colas y barnices. Las recepciones suman stock y el cierre de cada orden de producción lo descuenta según el BOM."
        acciones={sesion.permisos.has("mp.editar") && <FormularioNuevaMp unidades={unidades} csrf={sesion.csrf} />}
      />
      {activas.length > 0 && (sesion.permisos.has("stock.ajustar") || editaMinimo) && (
        <ConteoExistencias csrf={sesion.csrf} puedeAjustar={sesion.permisos.has("stock.ajustar")} puedeMinimo={editaMinimo}
          filas={activas.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad, existencia: m.existencia, minimo: m.stockMinimo }))} />
      )}
      <div className="grid grid-cols-1 gap-8 [&>*]:min-w-0 lg:grid-cols-[1fr_340px]">
        <Panel titulo="Existencias" accion={reponer.length > 0 && <Etiqueta tono="ambar">{reponer.length} bajo el mínimo</Etiqueta>} sinRelleno>
          {materias.length === 0 ? (
            <Vacio titulo="Aún no hay materias primas">Crea la primera con «Nueva materia prima».</Vacio>
          ) : (
            <Tabla>
              <thead><tr><Th>Materia prima</Th><Th>Unidad</Th><Th alinear="der">Existencia</Th><Th alinear="der">Mínimo</Th><Th>Última recepción</Th></tr></thead>
              <tbody>
                {materias.map((m) => {
                  const baja = m.stockMinimo !== null && m.existencia < m.stockMinimo;
                  return (
                    <Tr key={m.id} className={cn(!m.activo && "opacity-50")}>
                      <Td className="font-medium">{m.nombre}{!m.activo && <span className="ml-2 text-xs text-tinta-tenue">(inactiva)</span>}</Td>
                      <Td className="font-mono text-xs text-tinta-suave">{m.unidad}</Td>
                      <Td alinear="der" className={cn("font-semibold", baja && "text-ambar")}>{numero(m.existencia)}</Td>
                      <Td alinear="der" className="text-tinta-suave">
                        {editaMinimo ? <EditarMinimoMp id={m.id} nombre={m.nombre} minimo={m.stockMinimo} csrf={sesion.csrf} /> : m.stockMinimo === null ? "—" : numero(m.stockMinimo)}
                      </Td>
                      <Td className="text-tinta-suave">
                        {m.ultimaRecepcion ? fecha(new Date(m.ultimaRecepcion).toISOString()) : "—"}
                        {baja && <Etiqueta tono="ambar" className="ml-2">reponer</Etiqueta>}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
        </Panel>
        <div className="space-y-8 self-start">
          {reponer.length > 0 && (
            <Panel titulo="Para reponer">
              <ul className="space-y-3 text-sm">
                {reponer.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3">
                    <span>{m.nombre}</span>
                    <span className="tabular-nums text-ambar">faltan {numero(m.faltan)} {m.unidad}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {sesion.permisos.has("mp.mover") && activas.length > 0 && (
            <Panel titulo="Registrar recepción">
              <FormularioRecepcion materias={opciones} csrf={sesion.csrf} />
            </Panel>
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
