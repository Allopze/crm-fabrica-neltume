import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { BotonLink, Encabezado, Panel } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { cliente } from "@/db/esquema/comercial";
import { requerirSesion } from "@/domain/auth/servidor";
import { CargarNota } from "./cargar-nota";

export const metadata: Metadata = { title: "Pedido desde nota de la tienda" };

export default async function NotaTiendaPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("pedidos.gestionar")) return <SinPermiso permiso="pedidos.gestionar" />;
  if (!sesion.permisos.has("clientes.ver")) return <SinPermiso permiso="clientes.ver" />;
  const tiendas = await bd().select({ id: cliente.id, nombre: cliente.nombre }).from(cliente).where(eq(cliente.tipo, "tienda")).orderBy(cliente.nombre);
  return (
    <>
      <Encabezado titulo="Pedido desde nota de la tienda"
        descripcion="Sube el PDF de la nota de pedido que envía la tienda: se leen los códigos, cantidades y despacho; revisas y confirmas." />
      {tiendas.length === 0 ? (
        <Panel><p className="text-sm text-tinta-suave">No hay clientes de tipo «tienda». Crea la tienda en Clientes (tipo: Tienda) para cargar sus notas.</p>
          <BotonLink href="/clientes" className="mt-4">Ir a clientes</BotonLink></Panel>
      ) : <CargarNota tiendas={tiendas} csrf={sesion.csrf} />}
    </>
  );
}
