"use client";

import { useState, type Ref } from "react";
import { Paperclip } from "lucide-react";

/** Selector de archivo en español: el control nativo dice «Choose File» según el idioma del navegador. */
export function CampoArchivo({ entrada, accept, etiqueta, boton = "Elegir archivo", onCambio }: {
  entrada: Ref<HTMLInputElement>; accept: string; etiqueta: string; boton?: string; onCambio?: () => void;
}) {
  const [nombre, setNombre] = useState<string | null>(null);
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-3">
      <input ref={entrada} type="file" accept={accept} aria-label={etiqueta} className="peer sr-only"
        onChange={(e) => { setNombre(e.target.files?.[0]?.name ?? null); onCambio?.(); }} />
      <span aria-hidden className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-linea-fuerte bg-lamina px-3.5 text-sm font-medium text-tinta hover:border-tinta peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rauli pointer-coarse:h-11">
        <Paperclip className="h-4 w-4" /> {boton}
      </span>
      <span className="min-w-0 truncate text-sm text-tinta-tenue">{nombre ?? "Ningún archivo elegido"}</span>
    </span>
  );
}
