"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import { pedir } from "@/lib/api-cliente";
import { DialogoClave } from "./dialogo-clave";

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function UsuarioActual({ nombre, rol, csrf }: { nombre: string; rol: string; csrf: string }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);

  async function salir() {
    setSaliendo(true);
    try {
      await pedir("DELETE", "/api/v1/sesion", { csrf });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="m-3 flex items-center gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--lenga)] font-display text-sm text-bosque">{iniciales(nombre)}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm text-white">{nombre}</span>
        <span className="block text-xs capitalize text-bosque-tinta/70">{rol}</span>
      </span>
      <button onClick={() => setCambiandoClave(true)} aria-label="Cambiar mi contraseña" title="Cambiar mi contraseña" className="grid h-9 w-9 place-items-center rounded text-bosque-tinta/60 pointer-coarse:h-11 pointer-coarse:w-11 hover:text-white">
        <KeyRound className="h-4 w-4" />
      </button>
      <DialogoClave modo="propia" csrf={csrf} abierto={cambiandoClave} alCerrar={() => setCambiandoClave(false)} />
      <button onClick={salir} disabled={saliendo} aria-label="Cerrar sesión" className="grid h-9 w-9 place-items-center rounded text-bosque-tinta/60 pointer-coarse:h-11 pointer-coarse:w-11 hover:text-white disabled:opacity-40">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
