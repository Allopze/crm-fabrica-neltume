"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Boton, Etiqueta } from "@/components/ui/base";
import { LARGO_MINIMO_CLAVE } from "@/domain/auth/reglas";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { pedir } from "@/lib/api-cliente";
import { fechaHora } from "@/lib/formato";

interface UsuarioFila { id: string; email: string; nombre: string; activo: boolean; rol: string; ultimoIngreso: string | null }
interface Rol { id: string; nombre: string }
const campo = "h-10 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

export function UsuariosCliente({ usuarios, roles, csrf, yo }: { usuarios: UsuarioFila[]; roles: Rol[]; csrf: string; yo: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function accion(fn: () => Promise<unknown>) {
    setError(null);
    iniciar(async () => {
      try {
        await fn();
        setAbierto(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function crear(form: FormData) {
    accion(() => pedir("POST", "/api/v1/usuarios", {
      csrf, cuerpo: { email: form.get("email"), nombre: form.get("nombre"), clave: form.get("clave"), rolId: form.get("rolId") },
    }));
  }

  return (
    <div>
      {error && <p role="alert" className="mx-5 mt-4 rounded-md border border-error/25 bg-error-velo px-3 py-2 text-sm text-error">{error}</p>}
      {abierto ? (
        <form action={crear} className="grid gap-3 border-b border-linea p-5 md:grid-cols-2">
          <input name="nombre" required placeholder="Nombre" className={campo} aria-label="Nombre" />
          <input name="email" type="email" required placeholder="correo@neltume.cl" className={campo} aria-label="Correo" />
          <input name="clave" type="password" required minLength={LARGO_MINIMO_CLAVE} placeholder={`Contraseña inicial (mín. ${LARGO_MINIMO_CLAVE})`} className={campo} aria-label="Contraseña inicial" autoComplete="new-password" />
          <select name="rolId" className={campo} aria-label="Rol" defaultValue={roles.find((r) => r.nombre === "administrador")?.id}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <div className="flex gap-2 md:col-span-2">
            <Boton variante="primario" disabled={pendiente} type="submit">{pendiente ? "Creando…" : "Crear usuario"}</Boton>
            <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}><X className="h-4 w-4" /> Cancelar</Boton>
          </div>
        </form>
      ) : (
        <div className="flex justify-end border-b border-linea px-5 py-3">
          <Boton variante="primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nuevo usuario</Boton>
        </div>
      )}
      <Tabla>
        <thead><tr><Th>Nombre</Th><Th>Correo</Th><Th>Rol</Th><Th>Último ingreso</Th><Th>Estado</Th><Th><span className="sr-only">Acciones</span></Th></tr></thead>
        <tbody>
          {usuarios.map((u) => (
            <Tr key={u.id}>
              <Td className="font-medium">{u.nombre}{u.id === yo && <span className="ml-2 text-xs text-tinta-tenue">(tú)</span>}</Td>
              <Td className="text-tinta-suave">{u.email}</Td>
              <Td>{u.rol}</Td>
              <Td className="text-tinta-suave">{u.ultimoIngreso ? fechaHora(new Date(u.ultimoIngreso).toISOString()) : "—"}</Td>
              <Td>{u.activo ? <Etiqueta tono="musgo">Activo</Etiqueta> : <Etiqueta>Inactivo</Etiqueta>}</Td>
              <Td className="text-right">
                <Boton variante="fantasma" className="h-8" disabled={pendiente}
                  onClick={() => accion(() => pedir("PATCH", `/api/v1/usuarios/${u.id}`, { csrf, cuerpo: { activo: !u.activo } }))}>
                  {u.activo ? "Desactivar" : "Activar"}
                </Boton>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>
    </div>
  );
}
