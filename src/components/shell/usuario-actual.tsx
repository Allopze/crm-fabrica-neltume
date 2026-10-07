"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { pedir } from "@/lib/api-cliente";

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function UsuarioActual({ nombre, rol, csrf }: { nombre: string; rol: string; csrf: string }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

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
        <span className="block text-[11px] capitalize text-bosque-tinta/50">{rol}</span>
      </span>
      <button onClick={salir} disabled={saliendo} aria-label="Cerrar sesión" className="grid h-9 w-9 place-items-center rounded text-bosque-tinta/60 pointer-coarse:h-11 pointer-coarse:w-11 hover:text-white disabled:opacity-40">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
