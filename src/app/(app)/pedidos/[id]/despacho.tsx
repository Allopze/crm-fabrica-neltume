"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";

const campo = "mt-1 h-9 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

/** Datos de despacho, entrega comprometida y observaciones para la fábrica (editables hasta despachar). */
export function FormularioDespacho({ id, inicial, csrf }: {
  id: string; csrf: string;
  inicial: { direccionDespacho: string | null; medioTransporte: string | null; entregaComprometida: string | null; observaciones: string | null };
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form aria-label="Despacho" className="space-y-3 text-sm" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const v = (k: string) => String(f.get(k) ?? "").trim() || null;
      iniciar(async () => {
        try {
          await pedir("PATCH", `/api/v1/pedidos/${id}`, { csrf, cuerpo: { direccionDespacho: v("direccion"), medioTransporte: v("transporte"), entregaComprometida: v("entrega"), observaciones: v("observaciones") } });
          setMsg({ ok: true, texto: "Despacho actualizado." });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, texto: (err as Error).message });
        }
      });
    }}>
      <label className="block text-tinta-tenue">Dirección de despacho<input name="direccion" defaultValue={inicial.direccionDespacho ?? ""} placeholder="Vacío = retira en fábrica" maxLength={300} className={campo} /></label>
      <label className="block text-tinta-tenue">Medio de transporte<input name="transporte" defaultValue={inicial.medioTransporte ?? ""} maxLength={120} className={campo} /></label>
      <label className="block text-tinta-tenue">Entrega comprometida<input type="date" name="entrega" defaultValue={inicial.entregaComprometida ?? ""} className={campo} /></label>
      <label className="block text-tinta-tenue">Observaciones para la fábrica
        <textarea name="observaciones" defaultValue={inicial.observaciones ?? ""} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border border-linea-fuerte bg-lamina px-3 py-2 text-sm focus:border-tinta focus:outline-none" />
      </label>
      <Boton type="submit" disabled={pendiente}>Guardar despacho</Boton>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-musgo" : "text-error"}>{msg.texto}</p>}
    </form>
  );
}
