import type { Metadata } from "next";
import { Encabezado } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { buscarClientes } from "@/domain/clientes";
import { listaVigente } from "@/domain/precios/listas";
import { FormularioManual } from "./formulario-manual";

export const metadata: Metadata = { title: "Cotización manual" };

export default async function ManualPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("cotizaciones.crear")) return <SinPermiso permiso="cotizaciones.crear" />;
  const lista = await listaVigente();
  const clientes = sesion.permisos.has("clientes.ver")
    ? (await buscarClientes(bd(), { limite: 200 })).datos.map((x) => ({ id: x.id, nombre: x.nombre }))
    : null;
  return (
    <>
      <Encabezado
        titulo="Cotización manual"
        descripcion="Mismo cálculo que la cotización desde texto: lista vigente, recargo por tipo y redondeo al peso."
      />
      <FormularioManual csrf={sesion.csrf} version={lista?.version ?? null} clientes={clientes} />
    </>
  );
}
