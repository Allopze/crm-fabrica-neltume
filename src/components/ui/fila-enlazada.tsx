"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/formato";
import { claseFila } from "./tabla";

const INTERACTIVOS = "a, button, input, select, textarea, label, summary, [role=combobox], [role=button]";

/**
 * Fila que se abre con un clic en cualquier celda, como sugiere su resaltado. El enlace de la primera celda sigue
 * siendo el acceso por teclado y para lectores de pantalla; Ctrl/⌘ + clic o el botón del medio la abren en otra pestaña.
 */
export function FilaEnlazada({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  function abrir(e: MouseEvent<HTMLTableRowElement>, otraPestana: boolean) {
    if ((e.target as HTMLElement).closest(INTERACTIVOS) || window.getSelection()?.toString()) return;
    if (otraPestana || e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
    else router.push(href);
  }
  return (
    <tr className={cn(claseFila, "cursor-pointer", className)}
      onClick={(e) => abrir(e, false)} onAuxClick={(e) => { if (e.button === 1) abrir(e, true); }}>
      {children}
    </tr>
  );
}
