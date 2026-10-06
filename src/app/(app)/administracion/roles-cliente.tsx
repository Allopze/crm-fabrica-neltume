"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Etiqueta } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";
import { cn } from "@/lib/formato";

interface Rol { id: string; nombre: string; permisos: string[] }

export function RolesCliente({ roles, catalogo, csrf }: { roles: Rol[]; catalogo: [string, string][]; csrf: string }) {
  const router = useRouter();
  const [rolId, setRolId] = useState(roles[0]?.id);
  const rol = roles.find((r) => r.id === rolId);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(rol?.permisos));
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function elegir(id: string) {
    setRolId(id);
    setMarcados(new Set(roles.find((r) => r.id === id)?.permisos));
    setMensaje(null);
  }

  function guardar() {
    iniciar(async () => {
      try {
        await pedir("PUT", `/api/v1/roles/${rolId}/permisos`, { csrf, cuerpo: { permisos: [...marcados] } });
        setMensaje({ tono: "ok", texto: "Permisos guardados." });
        router.refresh();
      } catch (e) {
        setMensaje({ tono: "error", texto: (e as Error).message });
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Roles">
        {roles.map((r) => (
          <button key={r.id} role="tab" aria-selected={r.id === rolId} onClick={() => elegir(r.id)}
            className={cn("rounded-full px-3 py-1 text-sm", r.id === rolId ? "bg-tinta text-lamina" : "border border-linea text-tinta-suave hover:border-tinta")}>
            {r.nombre} <span className="opacity-60">· {r.permisos.length}</span>
          </button>
        ))}
      </div>
      <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {catalogo.map(([codigo, texto]) => (
          <li key={codigo}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-[var(--musgo)]" checked={marcados.has(codigo)}
                onChange={(e) => {
                  const s = new Set(marcados);
                  if (e.target.checked) s.add(codigo); else s.delete(codigo);
                  setMarcados(s);
                }} />
              <span><span className="block">{texto}</span><span className="font-mono text-[10px] text-tinta-tenue">{codigo}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center gap-3">
        <Boton variante="primario" onClick={guardar} disabled={pendiente}>Guardar permisos</Boton>
        {mensaje && <Etiqueta tono={mensaje.tono === "ok" ? "musgo" : "error"}>{mensaje.texto}</Etiqueta>}
      </div>
    </div>
  );
}
