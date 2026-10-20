"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoCompacto as campo } from "@/components/ui/campos";
import { pedir } from "@/lib/api-cliente";
import { leerCantidad, usoPorPuerta } from "@/lib/formato";
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
type Op = "factor" | "insumo" | "quitar";
interface Resultado { actualizados: string[]; sinReceta: string[]; sinCambio: string[] }

/**
 * Un mismo cambio en la receta general de varios modelos (REQ-MP-3.6): el factor de la madera (merma) o un insumo
 * por puerta. Pensado para cuando la fábrica confirma un dato que vale para todas las puertas.
 */
export function AplicarRecetas({ recetas, materias, csrf }: {
  recetas: { modeloCodigo: string; modelo: string; familia: "puerta" | "accesorio" }[];
  materias: { id: string; nombre: string; unidad: string }[];
  csrf: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [op, setOp] = useState<Op>("factor");
  const [valor, setValor] = useState("1");
  const [mpId, setMpId] = useState(materias[0]?.id ?? "");
  const [elegidos, setElegidos] = useState(() => new Set(recetas.filter((r) => r.familia === "puerta").map((r) => r.modeloCodigo)));
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) return <Boton variante="secundario" onClick={() => setAbierto(true)}><Layers className="h-4 w-4" /> Aplicar a varias recetas</Boton>;

  const grupo = (familia: "puerta" | "accesorio") => recetas.filter((r) => r.familia === familia);
  const marcarGrupo = (familia: "puerta" | "accesorio", si: boolean) => {
    const s = new Set(elegidos);
    for (const r of grupo(familia)) if (si) s.add(r.modeloCodigo); else s.delete(r.modeloCodigo);
    setElegidos(s);
  };
  const numero = leerCantidad(valor);
  const mp = materias.find((m) => m.id === mpId);
  const lectura = op === "insumo" && Number.isFinite(numero) ? usoPorPuerta(numero) : null;
  const descripcion = op === "factor" ? `madera × ${valor} pulgadas del artículo`
    : op === "insumo" ? `${mp?.nombre ?? "insumo"}: ${valor} ${mp?.unidad ?? ""} por puerta` : `quitar ${mp?.nombre ?? "insumo"}`;

  function aplicar() {
    if (op !== "quitar" && !(numero > 0)) { setError("Escribe un número mayor que cero (p. ej. 1,1 o 1/70)."); return; }
    const operacion = op === "factor" ? { tipo: op, factor: numero } : op === "insumo" ? { tipo: op, materiaPrimaId: mpId, cantidad: numero } : { tipo: op, materiaPrimaId: mpId };
    iniciar(async () => {
      try {
        setError(null);
        setResultado(await pedir<Resultado>("POST", "/api/v1/bom/aplicar", { csrf, idempotente: true, cuerpo: { modelos: [...elegidos], operacion } }));
        router.refresh();
      } catch (e) { setError((e as Error).message); }
    });
  }

  return (
    <form aria-label="Aplicar a varias recetas" className="w-full space-y-4 rounded-lg border border-linea-fuerte bg-lamina p-4" onSubmit={(e) => { e.preventDefault(); aplicar(); }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Cambio
          <select value={op} onChange={(e) => { setOp(e.target.value as Op); setResultado(null); }} className={`${campo} mt-1 block`}>
            <option value="factor">Factor de la madera (merma)</option>
            <option value="insumo">Agregar o cambiar un insumo</option>
            <option value="quitar">Quitar un insumo</option>
          </select>
        </label>
        {op !== "factor" && (
          <label className="min-w-0 flex-1 text-sm">Insumo
            <select value={mpId} onChange={(e) => setMpId(e.target.value)} className={`${campo} mt-1 block w-full`}>
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
            </select>
          </label>
        )}
        {op !== "quitar" && (
          <label className="text-sm">{op === "factor" ? "Factor" : "Por puerta"}
            <input inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} className={`${campo} mt-1 block w-24 text-right tabular-nums`} />
          </label>
        )}
      </div>
      {lectura && <p className="-mt-2 text-xs text-tinta-tenue">{lectura}</p>}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Recetas ({elegidos.size} de {recetas.length})</legend>
        {(["puerta", "accesorio"] as const).filter((f) => grupo(f).length).map((f) => (
          <div key={f} className="rounded-md border border-linea p-2">
            <div className="mb-1 flex items-center justify-between text-xs text-tinta-suave">
              <span>{f === "puerta" ? "Puertas" : "Accesorios"}</span>
              <span className="space-x-2">
                <button type="button" onClick={() => marcarGrupo(f, true)} className="inline-flex min-h-9 items-center px-1 underline-offset-2 hover:underline pointer-coarse:min-h-11">todas</button>
                <button type="button" onClick={() => marcarGrupo(f, false)} className="inline-flex min-h-9 items-center px-1 underline-offset-2 hover:underline pointer-coarse:min-h-11">ninguna</button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm sm:grid-cols-3">
              {grupo(f).map((r) => (
                <label key={r.modeloCodigo} className="flex min-h-9 items-center gap-2 truncate py-0.5 pointer-coarse:min-h-11">
                  <input type="checkbox" checked={elegidos.has(r.modeloCodigo)} onChange={(e) => {
                    const s = new Set(elegidos);
                    if (e.target.checked) s.add(r.modeloCodigo); else s.delete(r.modeloCodigo);
                    setElegidos(s);
                  }} /> {titulo(r.modelo)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Boton type="submit" variante="primario" disabled={pendiente || elegidos.size === 0}>
          {pendiente ? "Aplicando…" : `Aplicar a ${elegidos.size} ${elegidos.size === 1 ? "receta" : "recetas"}`}
        </Boton>
        <Boton type="button" variante="fantasma" onClick={() => { setAbierto(false); setResultado(null); }}>Cerrar</Boton>
        <span className="text-xs text-tinta-tenue">Crea una versión nueva de cada receta ({descripcion}); las anteriores quedan en el historial.</span>
      </div>
      {resultado && (
        <p role="status" className="rounded-md bg-musgo-velo px-3 py-2 text-sm text-musgo">
          Listo: {resultado.actualizados.length} {resultado.actualizados.length === 1 ? "receta actualizada" : "recetas actualizadas"}
          {resultado.sinCambio.length > 0 && ` · ${resultado.sinCambio.length} ya estaban así`}
          {resultado.sinReceta.length > 0 && ` · sin receta: ${resultado.sinReceta.join(", ")}`}.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </form>
  );
}
