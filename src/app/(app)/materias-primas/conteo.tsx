"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoNumero } from "@/components/ui/campos";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { hoySantiago } from "@/domain/precios/dias-habiles";
import { pedir } from "@/lib/api-cliente";
import { cantidad, fecha, leerCantidad } from "@/lib/formato";

interface Fila { id: string; nombre: string; unidad: string; existencia: number; minimo: number | null }
const campo = `w-28 ${campoNumero}`;

/**
 * Conteo de existencias (stock inicial o inventario físico): se anota lo contado y el mínimo de cada materia prima
 * en una sola tabla. Cada diferencia se registra como ajuste con motivo (REQ-MP-5; los movimientos no se editan) y
 * cada mínimo cambiado se guarda (REQ-MP-6.2).
 */
export function ConteoExistencias({ filas, puedeAjustar, puedeMinimo, csrf }: { filas: Fila[]; puedeAjustar: boolean; puedeMinimo: boolean; csrf: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [contado, setContado] = useState<Record<string, string>>({});
  const [minimos, setMinimos] = useState<Record<string, string>>(() => Object.fromEntries(filas.map((f) => [f.id, f.minimo === null ? "" : cantidad(f.minimo)])));
  const [informe, setInforme] = useState<{ ok: number; errores: string[] } | null>(null);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) return <Boton variante="secundario" onClick={() => setAbierto(true)}><ClipboardList className="h-4 w-4" /> Conteo de existencias</Boton>;

  const motivo = `Conteo de existencias ${fecha(hoySantiago())}`;
  const cambios = filas.flatMap((f) => {
    const c = contado[f.id]?.trim() ? leerCantidad(contado[f.id]) : NaN;
    const m = minimos[f.id]?.trim() ? leerCantidad(minimos[f.id]) : null;
    const minimoCambia = puedeMinimo && (m === null ? f.minimo !== null : Number.isFinite(m) && m !== f.minimo);
    const diferencia = puedeAjustar && Number.isFinite(c) ? Number((c - f.existencia).toFixed(3)) : 0;
    return diferencia !== 0 || minimoCambia ? [{ f, diferencia, minimo: minimoCambia ? m : undefined }] : [];
  });
  const invalidas = filas.filter((f) => (contado[f.id]?.trim() && !(leerCantidad(contado[f.id]) >= 0)) || (minimos[f.id]?.trim() && !(leerCantidad(minimos[f.id]) >= 0)));

  function guardar() {
    iniciar(async () => {
      const errores: string[] = [];
      let ok = 0;
      for (const { f, diferencia, minimo } of cambios) {
        try {
          if (diferencia !== 0) await pedir("POST", "/api/v1/movimientos/ajustes", { csrf, idempotente: true, cuerpo: { materiaPrimaId: f.id, cantidad: diferencia, motivo } });
          if (minimo !== undefined) await pedir("PATCH", `/api/v1/materias-primas/${f.id}/minimo`, { csrf, cuerpo: { stockMinimo: minimo } });
          ok++;
        } catch (e) { errores.push(`${f.nombre}: ${(e as Error).message}`); }
      }
      setInforme({ ok, errores });
      if (!errores.length) { setContado({}); }
      router.refresh();
    });
  }

  return (
    <form aria-label="Conteo de existencias" className="mb-8 rounded-lg border border-linea-fuerte bg-lamina" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linea px-4 py-3">
        <h2 className="font-display text-lg font-medium">Conteo de existencias</h2>
        <p className="text-sm text-tinta-suave">Anota lo contado; cada diferencia queda como ajuste con motivo «{motivo}». Deja en blanco lo que no contaste.</p>
      </div>
      <Tabla etiqueta="Conteo de existencias">
        <thead><tr><Th>Materia prima</Th><Th alinear="der">En sistema</Th>{puedeAjustar && <Th alinear="der">Contado</Th>}{puedeMinimo && <Th alinear="der">Mínimo</Th>}</tr></thead>
        <tbody>
          {filas.map((f) => {
            const c = contado[f.id]?.trim() ? leerCantidad(contado[f.id]) : NaN;
            const dif = Number.isFinite(c) ? Number((c - f.existencia).toFixed(3)) : 0;
            return (
              <Tr key={f.id}>
                <Td>{f.nombre} <span className="text-xs text-tinta-tenue">({f.unidad})</span></Td>
                <Td alinear="der" className="text-tinta-suave">{cantidad(f.existencia)}</Td>
                {puedeAjustar && (
                  <Td alinear="der" className="py-1.5">
                    {dif !== 0 && <span className={`mr-2 text-xs tabular-nums ${dif > 0 ? "text-musgo" : "text-error"}`}>{dif > 0 ? "+" : "−"}{cantidad(Math.abs(dif))}</span>}
                    <input aria-label={`Contado de ${f.nombre}`} inputMode="decimal" value={contado[f.id] ?? ""} onChange={(e) => setContado({ ...contado, [f.id]: e.target.value })} className={campo} />
                  </Td>
                )}
                {puedeMinimo && (
                  <Td alinear="der" className="py-1.5">
                    <input aria-label={`Mínimo de ${f.nombre}`} inputMode="decimal" value={minimos[f.id] ?? ""} onChange={(e) => setMinimos({ ...minimos, [f.id]: e.target.value })} className={campo} />
                  </Td>
                )}
              </Tr>
            );
          })}
        </tbody>
      </Tabla>
      <div className="flex flex-wrap items-center gap-2 border-t border-linea px-4 py-3">
        <Boton type="submit" variante="primario" disabled={pendiente || cambios.length === 0 || invalidas.length > 0}>
          {pendiente ? "Guardando…" : cambios.length ? `Guardar ${cambios.length} ${cambios.length === 1 ? "cambio" : "cambios"}` : "Sin cambios"}
        </Boton>
        <Boton type="button" variante="fantasma" onClick={() => { setAbierto(false); setInforme(null); }}>Cerrar</Boton>
        {invalidas.length > 0 && <span role="alert" className="text-sm text-error">Revisa: {invalidas.map((f) => f.nombre).join(", ")} (números ≥ 0).</span>}
        {informe && (
          <span role="status" className={`text-sm ${informe.errores.length ? "text-error" : "text-musgo"}`}>
            {informe.ok} {informe.ok === 1 ? "materia prima actualizada" : "materias primas actualizadas"}{informe.errores.length > 0 && `; con error: ${informe.errores.join(" · ")}`}
          </span>
        )}
      </div>
    </form>
  );
}
