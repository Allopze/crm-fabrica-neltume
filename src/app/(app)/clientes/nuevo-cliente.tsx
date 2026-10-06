"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";

const campo = "h-10 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";
const CAMPOS: [string, string, boolean][] = [
  ["nombre", "Nombre o razón social", true], ["rut", "RUT", true], ["giro", "Giro", false], ["contacto", "Contacto", false],
  ["email", "Correo", false], ["telefono", "Teléfono", false], ["direccion", "Dirección", false], ["comuna", "Comuna", false],
  ["direccionDespacho", "Dirección de despacho", false],
];

/** Alta de cliente (REQ-COT-9.1): solo datos necesarios para cotizar y despachar. */
export function NuevoCliente({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          setError((err as Error).message);
        }
      });
    }}>
      {CAMPOS.map(([k, etiqueta, req]) => (
        <label key={k} className={k === "direccionDespacho" ? "text-sm sm:col-span-2" : "text-sm"}>{etiqueta}{req && " *"}
          <input name={k} required={req} className={`${campo} mt-1 ${k === "rut" ? "font-mono" : ""}`} placeholder={k === "rut" ? "12.345.678-5" : undefined} />
        </label>
      ))}
      <label className="text-sm">Tipo
        <select name="tipo" defaultValue="directo" className={`${campo} mt-1`}><option value="directo">Directo</option><option value="tienda">Tienda</option></select>
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <Boton type="submit" variante="primario" disabled={pendiente}>Guardar cliente</Boton>
        <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
        {error && <p role="alert" className="self-center text-sm text-error">{error}</p>}
      </div>
    </form>
  );
}
