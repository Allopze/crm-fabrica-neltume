import type { Metadata } from "next";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarMateriasPrimas, listarUnidades } from "@/domain/materias-primas";
import { cn, fecha, numero } from "@/lib/formato";
import { FormularioNuevaMp, FormularioRecepcion } from "./formularios-mp";

export const metadata: Metadata = { title: "Materias primas" };

export default async function MateriasPrimasPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const [materias, unidades] = await Promise.all([listarMateriasPrimas(bd()), listarUnidades(bd())]);
  const activas = materias.filter((m) => m.activo);
  const bajas = activas.filter((m) => m.stockMinimo !== null && m.existencia < m.stockMinimo).length;

  return (
    <>
      <Encabezado
        antetitulo="Taller · insumos"
        titulo="Materias primas"
        descripcion="Madera, tableros, colas y barnices. Las recepciones suman stock y el cierre de cada orden de producción lo descuenta según el BOM."
        acciones={sesion.permisos.has("mp.editar") && <FormularioNuevaMp unidades={unidades} csrf={sesion.csrf} />}
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <Panel titulo="Existencias" accion={bajas > 0 && <Etiqueta tono="ambar">{bajas} bajo el mínimo</Etiqueta>} sinRelleno>
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
                      <Td alinear="der" className="text-tinta-suave">{m.stockMinimo === null ? "—" : numero(m.stockMinimo)}</Td>
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
        {sesion.permisos.has("mp.mover") && activas.length > 0 && (
          <Panel titulo="Registrar recepción" className="self-start">
            <FormularioRecepcion materias={activas.map((m) => ({ id: m.id, nombre: m.nombre, unidad: m.unidad }))} csrf={sesion.csrf} />
          </Panel>
        )}
      </div>
    </>
  );
}
