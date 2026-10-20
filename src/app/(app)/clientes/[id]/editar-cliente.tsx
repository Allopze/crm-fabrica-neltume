"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilLine } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";

const campo = `mt-1 w-full ${campoAlto}`;
const CAMPOS: [string, string, boolean][] = [
  ["nombre", "Nombre o razón social", true], ["rut", "RUT", true], ["giro", "Giro", false], ["contacto", "Contacto", false],
  ["email", "Correo", false], ["telefono", "Teléfono", false], ["direccion", "Dirección", false], ["comuna", "Comuna", false],
  ["direccionDespacho", "Dirección de despacho", false],
];

export interface ClienteEditable {
  id: string; nombre: string; rut: string; tipo: string; giro: string | null; direccion: string | null; direccionDespacho: string | null;
  comuna: string | null; contacto: string | null; email: string | null; telefono: string | null;
}

/** Edición de los datos mínimos del cliente (REQ-COT-9.1); el RUT se valida en el backend. */
export function EditarCliente({ cliente, csrf }: { cliente: ClienteEditable; csrf: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return <Boton onClick={() => setAbierto(true)}><PencilLine className="h-4 w-4" /> Editar datos</Boton>;
  }

  return (
    <form aria-label="Editar cliente" className="grid w-full max-w-3xl gap-3 rounded-lg border border-linea-fuerte bg-lamina p-5 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const cuerpo = Object.fromEntries(CAMPOS.map(([k]) => [k, String(f.get(k) ?? "").trim()]));
        iniciar(async () => {
          try {
            await pedir("PATCH", `/api/v1/clientes/${cliente.id}`, { csrf, cuerpo: { ...cuerpo, tipo: String(f.get("tipo")) } });
            setAbierto(false);
            setError(null);
            router.refresh();
          } catch (err) {
            setError(err);
          }
        });
      }}>
      {CAMPOS.map(([k, etiqueta, req]) => (
        <label key={k} className={k === "direccionDespacho" ? "text-sm sm:col-span-2" : "text-sm"}>{etiqueta}{req && " *"}
          <input name={k} required={req} defaultValue={String(cliente[k as keyof ClienteEditable] ?? "")} className={`${campo} ${k === "rut" ? "font-mono" : ""}`} placeholder={k === "rut" ? "12.345.678-5" : undefined} />
        </label>
      ))}
      <label className="text-sm">Tipo
        <select name="tipo" defaultValue={cliente.tipo} className={campo}><option value="directo">Directo</option><option value="tienda">Tienda</option></select>
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Boton type="submit" variante="primario" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar cambios"}</Boton>
        <Boton type="button" variante="fantasma" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</Boton>
        {error ? <ErrorAccion error={error} className="px-3 py-2" /> : null}
      </div>
    </form>
  );
}
