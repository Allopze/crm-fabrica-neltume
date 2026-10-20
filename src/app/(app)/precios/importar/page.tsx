import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Encabezado } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { requerirSesion } from "@/domain/auth/servidor";
import { SubirExcel } from "./subir-excel";

export const metadata: Metadata = { title: "Importar Excel" };

export default async function ImportarPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("catalogo.editar") || !sesion.permisos.has("precios.editar")) {
    return <SinPermiso permiso={["catalogo.editar", "precios.editar"]} />;
  }
  return (
    <>
      <nav aria-label="Ruta" className="mb-4 flex items-center gap-1 text-sm text-tinta-tenue">
        <Link href="/precios" className="hover:text-tinta">Lista de precios</Link><ChevronRight className="h-3.5 w-3.5" />
        <span className="text-tinta">Importar Excel</span>
      </nav>
      <Encabezado
        titulo="Importar el Excel"
        descripcion="Crea o actualiza artículos por código y, si cambió algún precio, una versión nueva de la lista. Las cotizaciones ya aprobadas no cambian. Importar dos veces el mismo archivo no duplica nada."
      />
      <SubirExcel csrf={sesion.csrf} />
    </>
  );
}
