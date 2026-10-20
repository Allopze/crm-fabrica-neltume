"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/base";
import { campo as campoBase } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";

const campo = `mt-1 w-full ${campoBase}`;

/** Datos de despacho, entrega comprometida y observaciones para la fábrica (editables hasta despachar). */
export function FormularioDespacho({ id, inicial, csrf }: {
  id: string; csrf: string;
  inicial: { direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null; observaciones: string | null };
}) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form aria-label="Despacho" className="space-y-3 text-sm" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const v = (k: string) => String(f.get(k) ?? "").trim() || null;
      iniciar(async () => {
        try {
          await pedir("PATCH", `/api/v1/pedidos/${id}`, { csrf, cuerpo: { direccionDespacho: v("direccion"), medioTransporte: v("transporte"), entregaComprometida: v("entrega"), observaciones: v("observaciones") } });
          setError(null);
          setMensaje("Despacho actualizado.");
          router.refresh();
        } catch (err) {
          setMensaje(null);
          setError(err);
        }
      });
    }}>
      <label className="block text-tinta-tenue">Dirección de despacho<input name="direccion" defaultValue={inicial.direccionDespacho ?? ""} placeholder="Vacío = retira en fábrica" maxLength={300} className={campo} /></label>
      <label className="block text-tinta-tenue">Medio de transporte<input name="transporte" defaultValue={inicial.medioTransporte ?? ""} maxLength={120} className={campo} /></label>
      <label className="block text-tinta-tenue">Entrega comprometida<input type="date" name="entrega" defaultValue={inicial.entregaComprometida ?? ""} className={campo} /></label>
      <label className="block text-tinta-tenue">Observaciones para la fábrica
        <textarea name="observaciones" defaultValue={inicial.observaciones ?? ""} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border border-linea-fuerte bg-lamina px-3 py-2 text-sm focus:border-tinta focus:outline-none" />
      </label>
      <Boton type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar despacho"}</Boton>
      {mensaje && <p role="status" className="text-musgo">{mensaje}</p>}
      {error ? <ErrorAccion error={error} /> : null}
    </form>
  );
}
