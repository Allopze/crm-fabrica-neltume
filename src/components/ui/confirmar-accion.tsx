"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/formato";
import { ErrorAccion } from "./error-accion";

/** Acción destructiva en línea: primero pregunta, nunca borra al primer clic. */
export function ConfirmarAccion({ etiqueta, titulo = "¿Quitar?", onConfirmar, className }: {
  etiqueta: string;
  titulo?: string;
  onConfirmar: () => Promise<unknown>;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  // El foco entra al botón de confirmar y vuelve al disparador al terminar (UX §2).
  const disparador = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  useEffect(() => {
    if (abierto) confirmarRef.current?.focus();
    else if (devolverFoco.current) {
      devolverFoco.current = false;
      disparador.current?.focus();
    }
  }, [abierto]);

  function cerrar() {
    devolverFoco.current = true;
    setAbierto(false);
  }

  function confirmar() {
    setError(null);
    iniciar(async () => {
      try {
        await onConfirmar();
        cerrar();
      } catch (e) {
        setError(e);
      }
    });
  }

  if (!abierto) {
    return (
      <button ref={disparador} type="button" aria-label={etiqueta} title={etiqueta} onClick={() => { setError(null); setAbierto(true); }}
        className={cn("grid h-9 w-9 place-items-center rounded text-tinta-tenue hover:bg-error-velo hover:text-error pointer-coarse:h-11 pointer-coarse:w-11", className)}>
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-tinta-suave">{titulo}</span>
      <button ref={confirmarRef} type="button" disabled={pendiente} onClick={confirmar}
        className="inline-flex min-h-9 items-center rounded px-1.5 text-xs font-medium text-error hover:bg-error-velo disabled:opacity-60 pointer-coarse:min-h-11">
        {pendiente ? "Quitando…" : "Sí, quitar"}
      </button>
      <button type="button" disabled={pendiente} onClick={cerrar}
        className="inline-flex min-h-9 items-center rounded px-1.5 text-xs text-tinta-suave hover:bg-papel-hundido disabled:opacity-60 pointer-coarse:min-h-11">
        Cancelar
      </button>
      {error ? <ErrorAccion error={error} className="basis-full px-2 py-1 text-xs" /> : null}
    </div>
  );
}
