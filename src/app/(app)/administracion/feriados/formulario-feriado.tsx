"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Boton, Hecho } from "@/components/ui/base";
import { CampoFecha } from "@/components/ui/campo-fecha";
import { campoAlto } from "@/components/ui/campos";
import { ConfirmarAccion } from "@/components/ui/confirmar-accion";
import { ErrorAccion } from "@/components/ui/error-accion";
import { PanelLateral } from "@/components/ui/panel-lateral";
import { pedir } from "@/lib/api-cliente";
import { fecha as fechaCl } from "@/lib/formato";

/** Feriado decretado por única vez (REQ-COT-6.6), en un panel lateral: el encabezado no se mueve. */
export function NuevoFeriado({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      <Boton onClick={() => { setAbierto(true); setHecho(null); setError(null); }}><Plus className="h-4 w-4" /> Agregar feriado</Boton>
      {hecho && <Hecho>{hecho}</Hecho>}
      <PanelLateral abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Feriado adicional"
        descripcion="Para los decretados por única vez, como una elección. Los legales ya se calculan solos.">
        <form aria-label="Feriado adicional" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError(null);
          iniciar(async () => {
            try {
              await pedir("POST", "/api/v1/feriados", { csrf, cuerpo: { fecha: f.get("fecha"), nombre: f.get("nombre") } });
              setHecho(`Feriado del ${fechaCl(String(f.get("fecha")))} agregado.`);
              setAbierto(false);
              router.refresh();
            } catch (err) {
              setError(err);
            }
          });
        }}>
          <div className="block text-sm font-medium">Fecha<CampoFecha name="fecha" required aria-label="Fecha" className="mt-1.5 w-full" /></div>
          <label className="block text-sm font-medium">Motivo
            <input name="nombre" required minLength={3} maxLength={120} placeholder="Ej. Elecciones presidenciales" aria-label="Motivo" className={`mt-1.5 w-full ${campoAlto}`} />
          </label>
          {error ? <ErrorAccion error={error} /> : null}
          <Boton type="submit" variante="primario" disabled={pendiente} className="w-full">{pendiente ? "Agregando…" : "Agregar feriado"}</Boton>
        </form>
      </PanelLateral>
    </div>
  );
}

export function QuitarFeriado({ fecha, csrf }: { fecha: string; csrf: string }) {
  const router = useRouter();
  return (
    <ConfirmarAccion
      etiqueta={`Quitar feriado ${fechaCl(fecha)}`}
      titulo={`¿Quitar el feriado del ${fechaCl(fecha)}?`}
      onConfirmar={async () => { await pedir("DELETE", `/api/v1/feriados/${fecha}`, { csrf }); router.refresh(); }}
    />
  );
}
