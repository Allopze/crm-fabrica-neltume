import type { Metadata } from "next";
import { Encabezado } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { requerirSesion } from "@/domain/auth/servidor";
import { AjustesIA } from "./ajustes-ia";

export const metadata: Metadata = { title: "Ajustes de IA" };

export default async function AjustesIAPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("config.editar")) return <SinPermiso permiso="config.editar" />;
  return <>
    <Encabezado antetitulo="Configuración · cotizador" titulo="Ajustes de IA"
      descripcion="Elige el proveedor y el modelo que interpretarán los pedidos. Las API keys se configuran en el entorno privado del worker." />
    <AjustesIA csrf={sesion.csrf} />
  </>;
}
