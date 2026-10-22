"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import { Boton, Hecho } from "@/components/ui/base";
import { areaTexto, campoAlto } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { PanelLateral } from "@/components/ui/panel-lateral";
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

/**
 * Botones y formulario de movimientos (REQ-STK-3–5, 8.2–8.3), en un panel lateral para no mover la página (UX §1).
 * El backend valida permisos, stock, puertas e idempotencia.
 */
export function AccionesMovimiento({ tipos, csrf, codigo, ubicaciones = [] }: { tipos: Tipo[]; csrf: string; codigo?: string; ubicaciones?: string[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<Tipo | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
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
    setError(null);
    iniciar(async () => {
      try {
        const r = await pedir<{ puertas?: string[] }>("POST", CONFIG[abierto].ruta, { csrf, idempotente: true, cuerpo });
        const lista = r.puertas?.length ? ` Puertas: ${r.puertas.join(", ")}.` : "";
        setHecho(`${CONFIG[abierto].titulo}: registrada.${lista}`);
        setAbierto(null);
        router.refresh();
      } catch (e) {
        setError(e);
      }
    });
  }

  const actual = abierto ? CONFIG[abierto] : null;
  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        {tipos.map((t) => {
          const { icono: Icono, titulo } = CONFIG[t];
          return (
            <Boton key={t} variante={t === "entrada" ? "primario" : "secundario"} onClick={() => { setAbierto(t); setHecho(null); setError(null); }}>
              <Icono className="h-4 w-4" /> {titulo.split(" ")[0]}
            </Boton>
          );
        })}
      </div>
      {hecho && <Hecho className="max-w-md">{hecho}</Hecho>}
      <PanelLateral abierto={abierto !== null} alCerrar={() => setAbierto(null)} titulo={actual?.titulo ?? ""} descripcion={actual?.ayuda}>
        {abierto && actual && (
          <form action={enviar} aria-label={actual.titulo} className="space-y-4">
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <label className="text-sm">Código<input name="codigo" required={abierto === "entrada"} defaultValue={codigo} className={`${campo} mt-1 font-mono uppercase`} /></label>
              <label className="text-sm">Cantidad<input name="cantidad" required={abierto === "ajuste"} inputMode="numeric" className={`${campo} mt-1 tabular-nums`} placeholder={abierto === "ajuste" ? "−1" : "1"} /></label>
            </div>
            <label className="block text-sm">
              {actual.codigos}
              <textarea name="puertas" rows={2} className={`mt-1 font-mono uppercase ${areaTexto}`} />
            </label>
            {abierto !== "salida" && (
              <label className="block text-sm">
                Ubicación de las puertas que entran
                <input name="ubicacion" list="ubicaciones-stock" placeholder="Fábrica" maxLength={60} className={`${campo} mt-1`} />
                <datalist id="ubicaciones-stock">{ubicaciones.map((u) => <option key={u} value={u} />)}</datalist>
              </label>
            )}
            <label className="block text-sm">
              {abierto === "ajuste" ? "Motivo (obligatorio)" : abierto === "salida" ? "Documento (factura, boleta, guía…)" : "Referencia (orden, guía…)"}
              <input name="detalle" required={abierto === "ajuste"} minLength={abierto === "ajuste" ? 3 : undefined} className={`${campo} mt-1`} />
            </label>
            {abierto !== "entrada" && <p className="text-xs text-tinta-tenue">Sin artículo, indica las etiquetas: el artículo sale de cada puerta.</p>}
            {error ? <ErrorAccion error={error} /> : null}
            <div className="flex gap-2 pt-1">
              <Boton type="submit" variante="primario" disabled={pendiente} className="flex-1">{pendiente ? "Registrando…" : "Registrar"}</Boton>
              <Boton type="button" variante="fantasma" onClick={() => setAbierto(null)}>Cancelar</Boton>
            </div>
          </form>
        )}
      </PanelLateral>
    </div>
  );
}
