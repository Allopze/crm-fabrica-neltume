"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { ConfirmarAccion } from "@/components/ui/confirmar-accion";
import { pedir } from "@/lib/api-cliente";

export function NuevoFeriado({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form aria-label="Feriado adicional" className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      iniciar(async () => {
        try {
          await pedir("POST", "/api/v1/feriados", { csrf, cuerpo: { fecha: f.get("fecha"), nombre: f.get("nombre") } });
          setError(null);
          form.reset();
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
      });
    }}>
      <input type="date" name="fecha" required aria-label="Fecha" className={campo} />
      <input name="nombre" required minLength={3} maxLength={120} placeholder="Motivo (p. ej. Elecciones presidenciales)" aria-label="Motivo" className={`${campo} w-72`} />
      <Boton type="submit" disabled={pendiente}><Plus className="h-4 w-4" /> {pendiente ? "Agregando…" : "Agregar"}</Boton>
      {error && <p role="alert" className="w-full text-sm text-error">{error}</p>}
    </form>
  );
}

export function QuitarFeriado({ fecha, csrf }: { fecha: string; csrf: string }) {
  const router = useRouter();
  return (
    <ConfirmarAccion
      etiqueta={`Quitar feriado ${fecha}`}
      titulo={`¿Quitar el feriado ${fecha}?`}
      onConfirmar={async () => { await pedir("DELETE", `/api/v1/feriados/${fecha}`, { csrf }); router.refresh(); }}
    />
  );
}
