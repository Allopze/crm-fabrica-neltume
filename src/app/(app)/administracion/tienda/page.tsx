import type { Metadata } from "next";
import { Encabezado } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { estadoConexion } from "@/domain/integracion-tienda/conexion-datos";
import { ConexionTienda } from "./conexion-tienda";

export const metadata: Metadata = { title: "Conexión con la tienda" };

export default async function ConexionTiendaPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("config.editar")) return <SinPermiso permiso="config.editar" />;
  return <>
    <Encabezado titulo="Conexión con la tienda"
      descripcion="Comprueba que la fábrica y la tienda se hablan: cada lado envía un PDF de prueba firmado y el otro lo muestra en su pantalla. Una prueba no crea pedidos ni mueve stock." />
    <ConexionTienda csrf={sesion.csrf} inicial={await estadoConexion(bd())} />
  </>;
}
