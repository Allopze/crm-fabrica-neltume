"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoCompacto as campo } from "@/components/ui/campos";
import { Dropdown } from "@/components/ui/dropdown";
import { pedir } from "@/lib/api-cliente";
import { cantidad, leerCantidad, usoPorPuerta } from "@/lib/formato";
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export interface RecetaInicial {
  modeloCodigo: string;
  origen: "real" | "demo";
  lineas: { maderaPuerta: boolean; mpId: string | null; cantidad: number }[];
}

/**
 * Editor de BOM (REQ-MP-3.1, 3.4). Nuevo o «Editar» con la receta vigente precargada; cada guardado crea una versión
 * nueva y la anterior queda en el historial. Las cantidades aceptan fracciones de taller («1/70»).
 */
export function EditorBom({ modelos, materias, csrf, maderaLista, inicial }: {
  modelos: { codigo: string; nombre: string }[];
  materias: { id: string; nombre: string; unidad: string }[];
  csrf: string;
  /** Las cuatro maderas tienen materia prima asociada: una receta nueva parte con la madera incluida. */
  maderaLista: boolean;
  inicial?: RecetaInicial;
}) {
  const router = useRouter();
  const editando = Boolean(inicial);
  const [abierto, setAbierto] = useState(editando);
  const [modelo, setModelo] = useState(inicial?.modeloCodigo ?? modelos[0]?.codigo ?? "");
  const [origen, setOrigen] = useState<"real" | "demo">(inicial?.origen ?? "real");
  const maderaInicial = inicial?.lineas.find((l) => l.maderaPuerta);
  const [conMadera, setConMadera] = useState(inicial ? Boolean(maderaInicial) : maderaLista);
  const [factor, setFactor] = useState(maderaInicial ? cantidad(maderaInicial.cantidad) : "1");
  const insumosIniciales = inicial?.lineas.filter((l) => !l.maderaPuerta && l.mpId).map((l) => ({ materiaPrimaId: l.mpId!, cantidad: cantidad(l.cantidad) }));
  const [lineas, setLineas] = useState(insumosIniciales?.length ? insumosIniciales : inicial ? [] : [{ materiaPrimaId: materias[0]?.id ?? "", cantidad: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) return <Boton onClick={() => setAbierto(true)}><Plus className="h-4 w-4" /> Definir BOM</Boton>;

  const nombreMp = (id: string) => materias.find((m) => m.id === id)?.nombre ?? "insumo";
  // Lo que se pierde respecto de la versión vigente, para que nunca se quite algo sin verlo.
  const quitados = inicial ? [
    ...(maderaInicial && !conMadera ? ["Madera de la puerta"] : []),
    ...(insumosIniciales ?? []).filter((x) => !lineas.some((l) => l.materiaPrimaId === x.materiaPrimaId)).map((x) => nombreMp(x.materiaPrimaId)),
  ] : [];
  const cerrar = () => { setAbierto(false); if (editando) router.replace("/produccion?vista=recetas#bom", { scroll: false }); };

  function guardar() {
    const insumos = lineas.map((l) => ({ materiaPrimaId: l.materiaPrimaId, cantidad: leerCantidad(l.cantidad) }));
    const f = leerCantidad(factor);
    if (insumos.some((l) => !(l.cantidad > 0)) || (conMadera && !(f > 0))) { setError("Revisa las cantidades: deben ser números mayores que cero (p. ej. 0,4 o 1/70)."); return; }
    if (!conMadera && !insumos.length) { setError("La receta necesita al menos la madera o un insumo."); return; }
    iniciar(async () => {
      try {
        setError(null);
        await pedir("PUT", `/api/v1/bom/${modelo}`, { csrf, cuerpo: { origen, lineas: [...(conMadera ? [{ maderaPuerta: true, cantidad: f }] : []), ...insumos] } });
        cerrar();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const nombreForm = editando ? `Editar BOM de ${titulo(modelos.find((m) => m.codigo === modelo)?.nombre ?? modelo)}` : "Definir BOM";
  return (
    <form aria-label={nombreForm} className="w-full space-y-3 rounded-lg border border-linea-fuerte bg-lamina p-4" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <div className="flex flex-wrap items-end gap-2">
        {editando ? <p className="mr-auto font-display text-lg font-medium">{nombreForm}</p> : (
          <div className="text-sm">Modelo
            <Dropdown aria-label="Modelo" value={modelo} onChange={setModelo} className="mt-1 w-56">
              {modelos.map((m) => <option key={m.codigo} value={m.codigo}>{titulo(m.nombre)} ({m.codigo})</option>)}
            </Dropdown>
          </div>
        )}
        <div className="text-sm">Origen
          <Dropdown aria-label="Origen" value={origen} onChange={(v) => setOrigen(v as "real" | "demo")} className="mt-1">
            <option value="real">Real (de Producción)</option><option value="demo">Demostración</option>
          </Dropdown>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-rauli-velo/40 px-3 py-2 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={conMadera} onChange={(e) => setConMadera(e.target.checked)} /> Madera de la puerta
        </label>
        {conMadera && (
          <label className="flex items-center gap-2">× <input aria-label="Factor de madera" required inputMode="decimal" value={factor} onChange={(e) => setFactor(e.target.value)} className={`${campo} w-20 text-right tabular-nums`} /> pulgadas del artículo</label>
        )}
        <p className="basis-full text-xs text-tinta-tenue">Usa las pulgadas de cada medida del catálogo y las descuenta de la madera de la puerta (raulí, lenga, mara u oregón). Factor 1 = tal cual; 1,1 suma un 10 % de merma.</p>
      </div>

      <p className="text-xs text-tinta-tenue">Insumos por puerta, para todas las medidas del modelo. Puedes escribir fracciones: «1/70» = una cada 70 puertas.</p>
      {lineas.map((l, i) => {
        const valor = leerCantidad(l.cantidad);
        const lectura = Number.isFinite(valor) ? usoPorPuerta(valor) : null;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Dropdown aria-label={`Materia prima ${i + 1}`} value={l.materiaPrimaId} onChange={(materiaPrimaId) => setLineas(lineas.map((x, j) => (j === i ? { ...x, materiaPrimaId } : x)))} className="min-w-0 flex-1">
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
            </Dropdown>
            <input aria-label={`Cantidad ${i + 1}`} required inputMode="decimal" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} className={`${campo} w-24 text-right tabular-nums`} />
            <button type="button" aria-label={`Quitar línea ${i + 1}`} onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-md text-tinta-tenue hover:bg-error-velo hover:text-error pointer-coarse:h-11 pointer-coarse:w-11"><Trash2 className="h-4 w-4" /></button>
            {lectura && <span className="basis-full pl-1 text-xs text-tinta-tenue">{lectura}</span>}
          </div>
        );
      })}

      {quitados.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-ambar-velo px-3 py-2 text-sm text-ambar">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> La nueva versión deja fuera: {quitados.join(", ")}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Boton type="button" variante="fantasma" onClick={() => setLineas([...lineas, { materiaPrimaId: materias[0]?.id ?? "", cantidad: "" }])}><Plus className="h-4 w-4" /> Agregar insumo</Boton>
        <Boton type="submit" variante="primario" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar BOM"}</Boton>
        <Boton type="button" variante="fantasma" onClick={cerrar}>Cancelar</Boton>
        <span className="text-xs text-tinta-tenue">{editando ? "Guardar crea una versión nueva; la anterior queda en el historial." : "Si el modelo ya tiene BOM, este lo reemplaza como versión nueva."}</span>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </form>
  );
}
