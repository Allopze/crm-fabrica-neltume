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
    <Encabezado titulo="Ajustes de IA"
      descripcion="Elige el modelo de Command Code que interpreta los pedidos. El cambio rige desde el siguiente pedido; los precios siempre los calcula el sistema." />
    <AjustesIA csrf={sesion.csrf} />
  </>;
}
