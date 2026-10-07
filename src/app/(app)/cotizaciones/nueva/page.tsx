import type { Metadata } from "next";
import { Encabezado } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { requerirSesion } from "@/domain/auth/servidor";
import { buscarClientes } from "@/domain/clientes";
import { EntradaPedido } from "./entrada-pedido";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("cotizaciones.crear")) return <SinPermiso permiso="cotizaciones.crear" />;
  const clientes = sesion.permisos.has("clientes.ver")
    ? (await buscarClientes(bd(), { limite: 200 })).datos.map((x) => ({ id: x.id, nombre: x.nombre }))
    : null;
  return (
    <>
      <Encabezado
        titulo="¿Qué pidió el cliente?"
        descripcion="Pega el correo o el mensaje completo. No hace falta ordenarlo ni corregirlo."
      />
      <EntradaPedido csrf={sesion.csrf} clientes={clientes} />
    </>
  );
}
