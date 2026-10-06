import type { Metadata } from "next";
import { Check, Plus } from "lucide-react";
import { Boton, Encabezado, Etiqueta, Panel } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { usuarios } from "@/mock/operacion";
import { fechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Usuarios y permisos" };

const permisos = [
  ["usuarios.gestionar", "Usuarios y roles"], ["auditoria.ver", "Ver auditoría"], ["catalogo.editar", "Catálogo e importación"],
  ["stock.ver", "Ver stock"], ["stock.mover", "Entradas y salidas"], ["stock.ajustar", "Ajustes con motivo"],
  ["mp.editar", "Materias primas y BOM"], ["mp.mover", "Recepciones"], ["produccion.gestionar", "Órdenes de producción"],
  ["precios.editar", "Lista de precios"], ["costos.ver", "Ver costos y márgenes"], ["cotizaciones.crear", "Crear y editar cotizaciones"],
  ["cotizaciones.aprobar", "Aprobar y PDF"], ["descuentos.aplicar", "Aplicar descuentos"], ["pedidos.gestionar", "Notas de pedido"],
  ["clientes.ver", "Ver clientes"], ["clientes.editar", "Editar clientes"], ["config.editar", "Parámetros"],
];

export default function AdministracionPage() {
  return (
    <>
      <Encabezado
        antetitulo="Configuración · acceso"
        titulo="Usuarios y permisos"
        descripcion="Hoy hay un solo rol con todos los permisos. Un perfil nuevo (por ejemplo, Bodega) se crea eligiendo permisos, sin tocar el sistema."
        acciones={<Boton variante="primario"><Plus className="h-4 w-4" /> Invitar usuario</Boton>}
      />
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <Panel titulo="Usuarios" sinRelleno>
          <Tabla>
            <thead><tr><Th>Nombre</Th><Th>Correo</Th><Th>Rol</Th><Th>Último ingreso</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <Tr key={u.email}>
                  <Td className="font-medium">{u.nombre}</Td>
                  <Td className="text-tinta-suave">{u.email}</Td>
                  <Td>{u.rol}</Td>
                  <Td className="text-tinta-suave">{fechaHora(u.ultimoIngreso)}</Td>
                  <Td><Etiqueta tono="musgo">Activo</Etiqueta></Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
          <p className="border-t border-linea px-5 py-3 text-xs text-tinta-tenue">Siempre debe quedar al menos un usuario activo con permiso para gestionar usuarios.</p>
        </Panel>

        <Panel titulo="Rol · Administrador" accion={<Etiqueta>{permisos.length} de {permisos.length}</Etiqueta>}>
          <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {permisos.map(([codigo, texto]) => (
              <li key={codigo} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-musgo text-lamina"><Check className="h-3 w-3" strokeWidth={3} /></span>
                <span><span className="block">{texto}</span><span className="font-mono text-[10px] text-tinta-tenue">{codigo}</span></span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
