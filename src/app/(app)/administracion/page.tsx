import type { Metadata } from "next";
import { Encabezado, Panel } from "@/components/ui/base";
import { SinPermiso } from "@/components/ui/sin-permiso";
import { bd } from "@/db/conexion";
import { PERMISOS } from "@/domain/auth/permisos";
import { requerirSesion } from "@/domain/auth/servidor";
import { listarRoles } from "@/domain/roles";
import { listarUsuarios } from "@/domain/usuarios";
import { RolesCliente } from "./roles-cliente";
import { UsuariosCliente } from "./usuarios-cliente";

export const metadata: Metadata = { title: "Usuarios y permisos" };

export default async function AdministracionPage() {
  const sesion = await requerirSesion();
  if (!sesion.permisos.has("usuarios.gestionar")) return <SinPermiso permiso="usuarios.gestionar" />;
  const [usuarios, roles] = await Promise.all([listarUsuarios(bd()), listarRoles(bd())]);

  return (
    <>
      <Encabezado
        titulo="Usuarios y permisos"
        descripcion="Hoy hay un solo rol con todos los permisos. Un perfil nuevo (por ejemplo, Bodega) se crea eligiendo permisos, sin tocar el sistema. Siempre debe quedar al menos un usuario activo que pueda gestionar usuarios."
      />
      <div className="grid grid-cols-1 items-start gap-8 [&>*]:min-w-0 2xl:grid-cols-[1.3fr_1fr]">
        <UsuariosCliente
          usuarios={usuarios.map((u) => ({ ...u, ultimoIngreso: u.ultimoIngreso ? String(u.ultimoIngreso) : null }))}
          roles={roles}
          csrf={sesion.csrf}
          yo={sesion.usuario.id}
        />
        <Panel titulo="Roles y permisos">
          <RolesCliente roles={roles} catalogo={Object.entries(PERMISOS)} csrf={sesion.csrf} />
        </Panel>
      </div>
    </>
  );
}
