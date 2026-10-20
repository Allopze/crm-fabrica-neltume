import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Encabezado, Etiqueta, Panel, Vacio } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { bd } from "@/db/conexion";
import { modelo } from "@/db/esquema/catalogo";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarAlias } from "@/domain/cotizaciones/alias";
import { NuevoAlias, QuitarAlias } from "./formulario-alias";

export const metadata: Metadata = { title: "Alias de modelos" };

export default async function AliasPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("stock.ver")) return <SinPermiso permiso="stock.ver" />;
  const edita = sesion.permisos.has("catalogo.editar");
  const [alias, modelos] = await Promise.all([listarAlias(bd()), bd().select({ n: modelo.nombre }).from(modelo).where(eq(modelo.activo, true)).orderBy(modelo.nombre)]);
  return (
    <>
      <Encabezado titulo="Alias de modelos"
        descripcion="Cómo se dicen o dictan los modelos («coscos» por Coz Coz). Un alias seguro se aplica; uno dudoso deja el ítem por confirmar con la sugerencia. Un modelo real siempre gana."
        acciones={edita && <NuevoAlias modelos={modelos.map((m) => m.n)} csrf={sesion.csrf} />} />
      <Panel sinRelleno>
        {alias.length === 0 ? (
          <Vacio titulo="Aún no hay alias">
            {edita ? "Agrega el primero con el formulario de arriba; por ejemplo, «coscos» por Coz Coz." : "Todavía no se ha definido ninguno."}
          </Vacio>
        ) : (
          <Tabla etiqueta="Alias de modelos">
            <thead><tr><Th>Alias</Th><Th>Modelo</Th><Th>Tipo</Th><Th><span className="sr-only">Acciones</span></Th></tr></thead>
            <tbody>
              {alias.map((a) => (
                <Tr key={a.alias}>
                  <Td className="font-mono text-sm">{a.alias}</Td><Td>{a.modelo}</Td>
                  <Td>{a.tipo === "seguro" ? <Etiqueta tono="musgo">seguro</Etiqueta> : <Etiqueta tono="ambar">dudoso</Etiqueta>}</Td>
                  <Td>{edita && <QuitarAlias alias={a.alias} csrf={sesion.csrf} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>
    </>
  );
}
