"use client";

import { useState, type ReactNode, type Ref } from "react";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/formato";

/** Selector de archivo en español: el control nativo dice «Choose File» según el idioma del navegador. */
export function CampoArchivo({ entrada, accept, etiqueta, boton = "Elegir archivo", onCambio, arrastrable }: {
  entrada: Ref<HTMLInputElement>; accept: string; etiqueta: string; boton?: string; onCambio?: () => void;
  /** Dentro de una ZonaArchivo: lo dice junto al nombre del archivo. */
  arrastrable?: boolean;
}) {
  const [nombre, setNombre] = useState<string | null>(null);
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-3">
      <input ref={entrada} type="file" accept={accept} aria-label={etiqueta} className="peer sr-only"
        onChange={(e) => { setNombre(e.target.files?.[0]?.name ?? null); onCambio?.(); }} />
      <span aria-hidden className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-linea-fuerte bg-lamina px-3.5 text-sm font-medium text-tinta hover:border-tinta peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rauli pointer-coarse:h-11">
        <Paperclip className="h-4 w-4" /> {boton}
      </span>
      <span className="min-w-0 truncate text-sm text-tinta-tenue">{nombre ?? (arrastrable ? "Ningún archivo elegido · también puedes arrastrarlo aquí" : "Ningún archivo elegido")}</span>
    </span>
  );
}

/** Recuadro que acepta soltar el archivo encima (lo que promete su borde punteado) y lo pasa al campo de archivo. */
export function ZonaArchivo({ accept, className, children }: { accept: string; className?: string; children: ReactNode }) {
  const [encima, setEncima] = useState(false);
  const aceptado = (f: File) => accept.split(",").some((a) => (a.startsWith(".") ? f.name.toLowerCase().endsWith(a.trim().toLowerCase()) : f.type === a.trim()));
  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setEncima(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setEncima(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const archivo = [...e.dataTransfer.files].find(aceptado);
        const input = e.currentTarget.querySelector<HTMLInputElement>("input[type=file]");
        if (!archivo || !input) return;
        const dt = new DataTransfer();
        dt.items.add(archivo);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }}
      className={cn("rounded-lg border border-dashed transition-colors", encima ? "border-rauli bg-rauli-velo/40" : "border-linea-fuerte bg-lamina", className)}>
      {children}
    </div>
  );
}
