"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Boton, Hecho } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { ErrorAccion } from "@/components/ui/error-accion";
import { PanelLateral } from "@/components/ui/panel-lateral";
import { pedir } from "@/lib/api-cliente";

const campo = `w-full ${campoAlto}`;
const CAMPOS: [string, string, boolean][] = [
  ["nombre", "Nombre o razón social", true], ["rut", "RUT", true], ["giro", "Giro", false], ["contacto", "Contacto", false],
  ["email", "Correo", false], ["telefono", "Teléfono", false], ["direccion", "Dirección", false], ["comuna", "Comuna", false],
  ["direccionDespacho", "Dirección de despacho", false],
];

/** Alta de cliente (REQ-COT-9.1): solo datos necesarios para cotizar y despachar, en un panel lateral. `rutInicial`: el
 * RUT detectado en el texto de una cotización (REQ-COT-2.18) abre el formulario con él. */
export function NuevoCliente({ csrf, rutInicial }: { csrf: string; rutInicial?: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(Boolean(rutInicial));
  const [error, setError] = useState<unknown>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <Boton variante="primario" onClick={() => { setAbierto(true); setHecho(null); setError(null); }}><Plus className="h-4 w-4" /> Nuevo cliente</Boton>
      {hecho && <Hecho>{hecho}</Hecho>}
      <PanelLateral abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Nuevo cliente" descripcion="Solo lo necesario para cotizar y despachar. Son datos personales: nunca se envían a la IA.">
        <form aria-label="Nuevo cliente" className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const cuerpo = Object.fromEntries(CAMPOS.map(([k]) => [k, String(f.get(k) ?? "")]).filter(([, v]) => v));
          setError(null);
          iniciar(async () => {
            try {
              await pedir("POST", "/api/v1/clientes", { csrf, cuerpo: { ...cuerpo, tipo: f.get("tipo") } });
              setHecho(`Cliente ${String(f.get("nombre") ?? "").trim()} creado.`);
              setAbierto(false);
              router.refresh();
            } catch (err) {
              setError(err);
            }
          });
        }}>
          {CAMPOS.map(([k, etiqueta, req]) => (
            <label key={k} className="block text-sm">{etiqueta}{req && " *"}
              <input name={k} required={req} className={`${campo} mt-1 ${k === "rut" ? "font-mono" : ""}`} placeholder={k === "rut" ? "Ej. 12.345.678-5" : undefined}
                defaultValue={k === "rut" ? rutInicial : undefined} />
            </label>
          ))}
          <div className="block text-sm">Tipo
            <Dropdown name="tipo" aria-label="Tipo de cliente" defaultValue="directo" className="mt-1 w-full"><option value="directo">Directo</option><option value="tienda">Tienda</option></Dropdown>
          </div>
          {error ? <ErrorAccion error={error} /> : null}
          <div className="flex gap-2 pt-1">
            <Boton type="submit" variante="primario" disabled={pendiente} className="flex-1">{pendiente ? "Guardando…" : "Guardar cliente"}</Boton>
            <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
          </div>
        </form>
      </PanelLateral>
    </div>
  );
}
