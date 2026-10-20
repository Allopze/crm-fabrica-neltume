"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, X } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { pedir } from "@/lib/api-cliente";

type Tipo = "entrada" | "salida" | "ajuste";
const CONFIG: Record<Tipo, { titulo: string; ruta: string; icono: typeof ArrowDownToLine; ayuda: string; codigos: string }> = {
  entrada: { titulo: "Entrada por producción", ruta: "/api/v1/movimientos/entradas", icono: ArrowDownToLine, ayuda: "Suma puertas terminadas al stock, cada una con su código.",
    codigos: "Etiquetas de las puertas (opcional: si no, la app las numera)" },
  salida: { titulo: "Salida por despacho", ruta: "/api/v1/movimientos/salidas", icono: ArrowUpFromLine, ayuda: "No puede dejar el disponible en negativo.",
    codigos: "Etiquetas de las puertas que salen (opcional: si no, las más antiguas)" },
  ajuste: { titulo: "Ajuste con motivo", ruta: "/api/v1/movimientos/ajustes", icono: SlidersHorizontal, ayuda: "Positivo o negativo. Este movimiento no se puede editar ni borrar.",
    codigos: "Etiquetas de las puertas (opcional: las que salen o las que vuelven)" },
};
const campo = `w-full ${campoAlto}`;

/** Etiquetas escritas una por línea o separadas por comas o espacios. */
const leerCodigos = (texto: FormDataEntryValue | null) => String(texto ?? "").split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);

/** Botones y formulario de movimientos (REQ-STK-3–5, 8.2–8.3). El backend valida permisos, stock, puertas e idempotencia. */
export function AccionesMovimiento({ tipos, csrf, codigo, ubicaciones = [] }: { tipos: Tipo[]; csrf: string; codigo?: string; ubicaciones?: string[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<Tipo | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(form: FormData) {
    if (!abierto) return;
    const texto = String(form.get("cantidad") ?? "").trim();
    const puertas = leerCodigos(form.get("puertas"));
    const art = String(form.get("codigo") ?? "").trim();
    const cuerpo = {
      ...(art ? { codigo: art } : {}),
      ...(texto ? { cantidad: Number(texto.replace(",", ".").replace("−", "-")) } : {}),
      ...(puertas.length ? { puertas } : {}),
      ...(abierto !== "salida" && String(form.get("ubicacion") ?? "").trim() ? { ubicacion: String(form.get("ubicacion")).trim() } : {}),
      ...(abierto === "ajuste" ? { motivo: form.get("detalle") } : form.get("detalle") ? { referencia: form.get("detalle") } : {}),
    };
    iniciar(async () => {
      try {
        const r = await pedir<{ puertas?: string[] }>("POST", CONFIG[abierto].ruta, { csrf, idempotente: true, cuerpo });
        const lista = r.puertas?.length ? ` Puertas: ${r.puertas.join(", ")}.` : "";
        setMensaje({ ok: true, texto: `${CONFIG[abierto].titulo}: registrada.${lista}` });
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
      {mensaje && <p role={mensaje.ok ? "status" : "alert"} className={mensaje.ok ? "max-w-md text-sm text-musgo" : "text-sm text-error"}>{mensaje.texto}</p>}
      {abierto && (
        <form action={enviar} aria-label={CONFIG[abierto].titulo}
          className="entrada w-full max-w-md rounded-lg border border-linea-fuerte bg-lamina p-5 text-left shadow-[0_18px_40px_-28px_rgb(30_40_30/0.5)]">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="font-display text-lg">{CONFIG[abierto].titulo}</p>
              <p className="text-xs text-tinta-tenue">{CONFIG[abierto].ayuda}</p>
            </div>
            <button type="button" aria-label="Cerrar" onClick={() => setAbierto(null)} className="grid h-9 w-9 place-items-center rounded text-tinta-tenue hover:bg-papel-hundido hover:text-tinta pointer-coarse:h-11 pointer-coarse:w-11"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <label className="text-sm">Código<input name="codigo" required={abierto === "entrada"} defaultValue={codigo} className={`${campo} mt-1 font-mono uppercase`} /></label>
            <label className="text-sm">Cantidad<input name="cantidad" required={abierto === "ajuste"} inputMode="numeric" className={`${campo} mt-1 tabular-nums`} placeholder={abierto === "ajuste" ? "−1" : "1"} /></label>
          </div>
          <label className="mt-3 block text-sm">
            {CONFIG[abierto].codigos}
            <textarea name="puertas" rows={2} className="mt-1 w-full rounded-md border border-linea-fuerte bg-lamina px-3 py-2 font-mono text-sm uppercase focus:border-tinta focus:outline-none" />
          </label>
          {abierto !== "salida" && (
            <label className="mt-3 block text-sm">
              Ubicación de las puertas que entran
              <input name="ubicacion" list="ubicaciones-stock" placeholder="Fábrica" maxLength={60} className={`${campo} mt-1`} />
              <datalist id="ubicaciones-stock">{ubicaciones.map((u) => <option key={u} value={u} />)}</datalist>
            </label>
          )}
          <label className="mt-3 block text-sm">
            {abierto === "ajuste" ? "Motivo (obligatorio)" : abierto === "salida" ? "Documento (factura, boleta, guía…)" : "Referencia (orden, guía…)"}
            <input name="detalle" required={abierto === "ajuste"} minLength={abierto === "ajuste" ? 3 : undefined} className={`${campo} mt-1`} />
          </label>
          {abierto !== "entrada" && <p className="mt-2 text-xs text-tinta-tenue">Sin artículo, indica las etiquetas: el artículo sale de cada puerta.</p>}
          <Boton type="submit" variante="primario" disabled={pendiente} className="mt-4 w-full">{pendiente ? "Registrando…" : "Registrar"}</Boton>
        </form>
      )}
    </div>
  );
}
