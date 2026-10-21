"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";

const campo = `w-full ${campoAlto}`;
const CAMPOS: [string, string, boolean][] = [
  ["nombre", "Nombre o razón social", true], ["rut", "RUT", true], ["giro", "Giro", false], ["contacto", "Contacto", false],
  ["email", "Correo", false], ["telefono", "Teléfono", false], ["direccion", "Dirección", false], ["comuna", "Comuna", false],
  ["direccionDespacho", "Dirección de despacho", false],
];

/** Alta de cliente (REQ-COT-9.1): solo datos necesarios para cotizar y despachar. `rutInicial`: el RUT detectado en
 * el texto de una cotización (REQ-COT-2.18) abre el formulario con él. */
export function NuevoCliente({ csrf, rutInicial }: { csrf: string; rutInicial?: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(Boolean(rutInicial));
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  if (!abierto) return <Boton variante="primario" onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Nuevo cliente</Boton>;

  return (
    <form aria-label="Nuevo cliente" className="grid w-full max-w-3xl gap-3 rounded-lg border border-linea-fuerte bg-lamina p-5 sm:grid-cols-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const cuerpo = Object.fromEntries(CAMPOS.map(([k]) => [k, String(f.get(k) ?? "")]).filter(([, v]) => v));
      iniciar(async () => {
        try {
          await pedir("POST", "/api/v1/clientes", { csrf, cuerpo: { ...cuerpo, tipo: f.get("tipo") } });
          setAbierto(false);
          router.refresh();
        } catch (err) {
          setError(err);
        }
      });
    }}>
      {CAMPOS.map(([k, etiqueta, req]) => (
        <label key={k} className={k === "direccionDespacho" ? "text-sm sm:col-span-2" : "text-sm"}>{etiqueta}{req && " *"}
          <input name={k} required={req} className={`${campo} mt-1 ${k === "rut" ? "font-mono" : ""}`} placeholder={k === "rut" ? "12.345.678-5" : undefined}
            defaultValue={k === "rut" ? rutInicial : undefined} />
        </label>
      ))}
      <div className="text-sm">Tipo
        <Dropdown name="tipo" aria-label="Tipo de cliente" defaultValue="directo" className="mt-1"><option value="directo">Directo</option><option value="tienda">Tienda</option></Dropdown>
      </div>
      <div className="flex gap-2 sm:col-span-3">
        <Boton type="submit" variante="primario" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar cliente"}</Boton>
        <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
        {error ? <ErrorAccion error={error} className="self-center px-3 py-2" /> : null}
      </div>
    </form>
  );
}
