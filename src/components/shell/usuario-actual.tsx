"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, KeyRound, LogOut } from "lucide-react";
import { pedir } from "@/lib/api-cliente";
import { capital, cn } from "@/lib/formato";
import { DialogoClave } from "./dialogo-clave";

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

const opcion = "flex min-h-10 w-full items-center gap-2.5 rounded px-3 text-left text-sm text-bosque-tinta/85 hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] pointer-coarse:min-h-11";

/** Quien usa la app y su menú (cambiar contraseña, cerrar sesión): el nombre se lee completo, sin íconos que lo corten. */
export function UsuarioActual({ nombre, rol, csrf }: { nombre: string; rol: string; csrf: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!abierto) return;
    raiz.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setAbierto(false); boton.current?.focus(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(raiz.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    };
    document.addEventListener("pointerdown", fuera);
    raiz.current?.addEventListener("keydown", tecla);
    const nodo = raiz.current;
    return () => { document.removeEventListener("pointerdown", fuera); nodo?.removeEventListener("keydown", tecla); };
  }, [abierto]);

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
    <div ref={raiz} className="relative m-3">
      {abierto && (
        <div id={menuId} role="menu" aria-label={`Menú de ${nombre}`}
          className="absolute inset-x-0 bottom-full mb-2 rounded-md border border-white/10 bg-bosque-2 p-1 shadow-[0_-12px_30px_-14px_rgb(0_0_0/0.6)]">
          <button type="button" role="menuitem" className={opcion} onClick={() => { setAbierto(false); setCambiandoClave(true); }}>
            <KeyRound className="h-4 w-4 opacity-80" /> Cambiar mi contraseña
          </button>
          <button type="button" role="menuitem" className={opcion} disabled={saliendo} onClick={salir}>
            <LogOut className="h-4 w-4 opacity-80" /> {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      )}
      <button ref={boton} type="button" aria-haspopup="menu" aria-expanded={abierto} aria-controls={abierto ? menuId : undefined}
        onClick={() => setAbierto((a) => !a)}
        className={cn("flex w-full items-center gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-left hover:bg-black/30 pointer-coarse:py-3", abierto && "bg-black/30")}>
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--lenga)] font-display text-sm text-bosque">{iniciales(nombre)}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block break-words text-sm text-white">{nombre}</span>
          <span className="block text-xs text-bosque-tinta/70">{capital(rol)}</span>
        </span>
        <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-bosque-tinta/60" />
      </button>
      <DialogoClave modo="propia" csrf={csrf} abierto={cambiandoClave} alCerrar={() => setCambiandoClave(false)} />
    </div>
  );
}
