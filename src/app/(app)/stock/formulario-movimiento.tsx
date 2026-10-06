"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, X } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";

type Tipo = "entrada" | "salida" | "ajuste";
const CONFIG: Record<Tipo, { titulo: string; ruta: string; icono: typeof ArrowDownToLine; ayuda: string }> = {
  entrada: { titulo: "Entrada por producción", ruta: "/api/v1/movimientos/entradas", icono: ArrowDownToLine, ayuda: "Suma puertas terminadas al stock." },
  salida: { titulo: "Salida por despacho", ruta: "/api/v1/movimientos/salidas", icono: ArrowUpFromLine, ayuda: "No puede dejar el disponible en negativo." },
  ajuste: { titulo: "Ajuste con motivo", ruta: "/api/v1/movimientos/ajustes", icono: SlidersHorizontal, ayuda: "Positivo o negativo. Este movimiento no se puede editar ni borrar." },
};
const campo = "h-10 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

/** Botones y formulario de movimientos (REQ-STK-3–5). El backend valida permisos, stock e idempotencia. */
export function AccionesMovimiento({ tipos, csrf, codigo }: { tipos: Tipo[]; csrf: string; codigo?: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<Tipo | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(form: FormData) {
    if (!abierto) return;
    const cantidad = Number(String(form.get("cantidad")).replace(",", "."));
    const cuerpo = abierto === "ajuste"
      ? { codigo: form.get("codigo"), cantidad, motivo: form.get("detalle") }
      : { codigo: form.get("codigo"), cantidad, ...(form.get("detalle") ? { referencia: form.get("detalle") } : {}) };
    iniciar(async () => {
      try {
        await pedir("POST", CONFIG[abierto].ruta, { csrf, idempotente: true, cuerpo });
        setMensaje({ ok: true, texto: `${CONFIG[abierto].titulo}: registrada.` });
        setAbierto(null);
        router.refresh();
      } catch (e) {
        setMensaje({ ok: false, texto: (e as Error).message });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {tipos.map((t) => {
          const { icono: Icono, titulo } = CONFIG[t];
          return (
            <Boton key={t} variante={t === "entrada" ? "primario" : "secundario"} onClick={() => { setAbierto(t); setMensaje(null); }}>
              <Icono className="h-4 w-4" /> {titulo.split(" ")[0]}
            </Boton>
          );
        })}
      </div>
      {mensaje && <p role={mensaje.ok ? "status" : "alert"} className={mensaje.ok ? "text-sm text-musgo" : "text-sm text-error"}>{mensaje.texto}</p>}
      {abierto && (
        <form action={enviar} aria-label={CONFIG[abierto].titulo}
          className="entrada w-full max-w-md rounded-lg border border-linea-fuerte bg-lamina p-5 text-left shadow-[0_18px_40px_-28px_rgb(30_40_30/0.5)]">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="font-display text-lg">{CONFIG[abierto].titulo}</p>
              <p className="text-xs text-tinta-tenue">{CONFIG[abierto].ayuda}</p>
            </div>
            <button type="button" aria-label="Cerrar" onClick={() => setAbierto(null)} className="text-tinta-tenue hover:text-tinta"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <label className="text-sm">Código<input name="codigo" required defaultValue={codigo} className={`${campo} mt-1 font-mono uppercase`} /></label>
            <label className="text-sm">Cantidad<input name="cantidad" required inputMode="numeric" className={`${campo} mt-1 tabular-nums`} placeholder={abierto === "ajuste" ? "−1" : "1"} /></label>
          </div>
          <label className="mt-3 block text-sm">
            {abierto === "ajuste" ? "Motivo (obligatorio)" : "Referencia (orden, guía…)"}
            <input name="detalle" required={abierto === "ajuste"} minLength={abierto === "ajuste" ? 3 : undefined} className={`${campo} mt-1`} />
          </label>
          <Boton type="submit" variante="primario" disabled={pendiente} className="mt-4 w-full">Registrar</Boton>
        </form>
      )}
    </div>
  );
}
