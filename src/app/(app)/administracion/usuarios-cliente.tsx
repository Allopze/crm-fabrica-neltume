"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Boton, Etiqueta, Hecho, Panel } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { ErrorAccion } from "@/components/ui/error-accion";
import { LARGO_MINIMO_CLAVE } from "@/domain/auth/reglas";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { pedir } from "@/lib/api-cliente";
import { DialogoClave } from "@/components/shell/dialogo-clave";
import { capital, fechaHora } from "@/lib/formato";

interface UsuarioFila { id: string; email: string; nombre: string; activo: boolean; rol: string; ultimoIngreso: string | null }
interface Rol { id: string; nombre: string }
const campo = `w-full ${campoAlto}`;

export function UsuariosCliente({ usuarios, roles, csrf, yo }: { usuarios: UsuarioFila[]; roles: Rol[]; csrf: string; yo: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [restablecer, setRestablecer] = useState<UsuarioFila | null>(null);

  function accion(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setHecho(null);
    iniciar(async () => {
      try {
        await fn();
        setAbierto(false);
        setHecho(ok);
        router.refresh();
      } catch (e) {
        setError(e);
      }
    });
  }

  function crear(form: FormData) {
    accion(() => pedir("POST", "/api/v1/usuarios", {
      csrf, cuerpo: { email: form.get("email"), nombre: form.get("nombre"), clave: form.get("clave"), rolId: form.get("rolId") },
    }), `Usuario ${String(form.get("nombre") ?? "").trim()} creado. Entrégale su contraseña por un canal privado.`);
  }

  return (
    <Panel titulo="Usuarios" sinRelleno
      accion={!abierto && <Boton variante="primario" onClick={() => { setAbierto(true); setHecho(null); }}><Plus className="h-4 w-4" /> Nuevo usuario</Boton>}>
      {error ? <ErrorAccion error={error} className="mx-5 mt-4 px-3 py-2" /> : null}
      {hecho && <Hecho className="mx-5 mt-4">{hecho}</Hecho>}
      {abierto ? (
        <form action={crear} className="grid gap-3 border-b border-linea p-5 md:grid-cols-2">
          <input name="nombre" required placeholder="Nombre" className={campo} aria-label="Nombre" />
          <input name="email" type="email" required placeholder="correo@neltume.cl" className={campo} aria-label="Correo" />
          <input name="clave" type="password" required minLength={LARGO_MINIMO_CLAVE} placeholder={`Contraseña inicial (mín. ${LARGO_MINIMO_CLAVE})`} className={campo} aria-label="Contraseña inicial" autoComplete="new-password" />
          <Dropdown name="rolId" className="w-full" aria-label="Rol" defaultValue={roles.find((r) => r.nombre === "administrador")?.id}>
            {roles.map((r) => <option key={r.id} value={r.id}>{capital(r.nombre)}</option>)}
          </Dropdown>
          <div className="flex gap-2 md:col-span-2">
            <Boton variante="primario" disabled={pendiente} type="submit">{pendiente ? "Creando…" : "Crear usuario"}</Boton>
            <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}><X className="h-4 w-4" /> Cancelar</Boton>
          </div>
        </form>
      ) : null}
      <Tabla etiqueta="Usuarios">
        <thead><tr><Th>Nombre</Th><Th>Correo</Th><Th>Rol</Th><Th>Último ingreso</Th><Th>Estado</Th><Th><span className="sr-only">Acciones</span></Th></tr></thead>
        <tbody>
          {usuarios.map((u) => (
            <Tr key={u.id}>
              <Td className="font-medium">{u.nombre}{u.id === yo && <span className="ml-2 text-xs text-tinta-tenue">(tú)</span>}</Td>
              <Td className="text-tinta-suave">{u.email}</Td>
              <Td>{capital(u.rol)}</Td>
              <Td className="whitespace-nowrap text-tinta-suave">{u.ultimoIngreso ? fechaHora(new Date(u.ultimoIngreso).toISOString()) : "—"}</Td>
              <Td>{u.activo ? <Etiqueta tono="musgo">Activo</Etiqueta> : <Etiqueta>Inactivo</Etiqueta>}</Td>
              <Td className="whitespace-nowrap text-right">
                {u.id !== yo && <Boton variante="fantasma" className="h-8" disabled={pendiente} onClick={() => setRestablecer(u)}>Restablecer clave</Boton>}
                <Boton variante={u.activo ? "peligroSuave" : "fantasma"} className="h-8" disabled={pendiente}
                  onClick={() => accion(() => pedir("PATCH", `/api/v1/usuarios/${u.id}`, { csrf, cuerpo: { activo: !u.activo } }), `${u.nombre}: ${u.activo ? "desactivado" : "activado"}.`)}>
                  {u.activo ? "Desactivar" : "Activar"}
                </Boton>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>
      <DialogoClave modo="restablecer" usuario={restablecer ?? undefined} csrf={csrf} abierto={restablecer !== null} alCerrar={() => setRestablecer(null)} />
    </Panel>
  );
}
