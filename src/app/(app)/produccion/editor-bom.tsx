"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { pedir } from "@/lib/api-cliente";

const campo = "h-9 rounded-md border border-linea-fuerte bg-lamina px-2 text-sm focus:border-tinta focus:outline-none";

/** Editor de BOM (REQ-MP-3.1): cada guardado crea una versión nueva del BOM del modelo. */
export function EditorBom({ modelos, materias, csrf }: { modelos: { codigo: string; nombre: string }[]; materias: { id: string; nombre: string; unidad: string }[]; csrf: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modelo, setModelo] = useState(modelos[0]?.codigo ?? "");
  const [origen, setOrigen] = useState<"real" | "demo">("real");
  const [lineas, setLineas] = useState([{ materiaPrimaId: materias[0]?.id ?? "", cantidad: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) return <Boton onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Definir BOM</Boton>;

  function guardar() {
    iniciar(async () => {
      try {
        await pedir("PUT", `/api/v1/bom/${modelo}`, { csrf, cuerpo: { origen, lineas: lineas.map((l) => ({ materiaPrimaId: l.materiaPrimaId, cantidad: Number(l.cantidad.replace(",", ".")) })) } });
        setAbierto(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form aria-label="Definir BOM" className="w-full max-w-xl space-y-3 rounded-lg border border-linea-fuerte bg-lamina p-4" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <div className="flex flex-wrap gap-2">
        <label className="text-sm">Modelo
          <select value={modelo} onChange={(e) => setModelo(e.target.value)} className={`${campo} mt-1 block w-48`}>
            {modelos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre.toLowerCase()} ({m.codigo})</option>)}
          </select>
        </label>
        <label className="text-sm">Origen
          <select value={origen} onChange={(e) => setOrigen(e.target.value as "real" | "demo")} className={`${campo} mt-1 block`}>
            <option value="real">Real (de Producción)</option><option value="demo">Demostración</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-tinta-tenue">Cantidades por puerta. Aplica a todas las medidas del modelo.</p>
      {lineas.map((l, i) => (
        <div key={i} className="flex gap-2">
          <select aria-label={`Materia prima ${i + 1}`} value={l.materiaPrimaId} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, materiaPrimaId: e.target.value } : x)))} className={`${campo} flex-1`}>
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
          </select>
          <input aria-label={`Cantidad ${i + 1}`} required inputMode="decimal" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} className={`${campo} w-24 text-right`} />
          <button type="button" aria-label="Quitar línea" disabled={lineas.length === 1} onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="text-tinta-tenue hover:text-error disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Boton type="button" variante="fantasma" onClick={() => setLineas([...lineas, { materiaPrimaId: materias[0]?.id ?? "", cantidad: "" }])}><Plus className="h-4 w-4" /> Agregar insumo</Boton>
        <Boton type="submit" variante="primario" disabled={pendiente}>Guardar BOM</Boton>
        <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </form>
  );
}
