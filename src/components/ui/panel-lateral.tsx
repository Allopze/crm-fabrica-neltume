"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Panel que entra desde la derecha para un formulario, sin mover la página de atrás (UX §1). Es un <dialog> modal:
 * atrapa el foco, Esc lo cierra y al cerrarse el foco vuelve al botón que lo abrió.
 */
export function PanelLateral({ abierto, alCerrar, titulo, descripcion, children }: {
  abierto: boolean; alCerrar: () => void; titulo: string; descripcion?: ReactNode; children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      // El diálogo enfocaría el botón Cerrar: se empieza por el primer campo del formulario.
      d.querySelector<HTMLElement>("form input:not([type=hidden]), form [role=combobox], form textarea")?.focus();
    }
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog ref={dialogo} aria-labelledby={tituloId} onClose={alCerrar}
      onClick={(e) => { if (e.target === e.currentTarget) alCerrar(); }}
      className="panel-lateral fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(30rem,100vw)] max-w-none border-l border-linea bg-lamina p-0 text-left text-tinta shadow-[-18px_0_40px_-24px_rgb(30_40_30/0.45)]">
      {abierto && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-linea px-5 py-4">
            <div className="min-w-0">
              <h2 id={tituloId} className="font-display text-xl font-medium tracking-tight">{titulo}</h2>
              {descripcion && <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>}
            </div>
            <button type="button" aria-label="Cerrar" onClick={alCerrar}
              className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded text-tinta-tenue hover:bg-papel-hundido hover:text-tinta pointer-coarse:h-11 pointer-coarse:w-11">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
