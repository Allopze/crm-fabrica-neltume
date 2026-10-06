"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Boton, Etiqueta } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";

interface Informe {
  repetida: boolean; listaVersion: number | null; creadas: number; actualizadas: number; sinCambios: number; rechazadas: number;
  rechazos: { fila: number; motivo: string }[];
  correcciones: { fila: number; detalle: string }[];
}

export function SubirExcel({ csrf }: { csrf: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"listo" | "subiendo">("listo");
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir() {
    // Se lee del input al hacer clic: no depende de que el onChange haya alcanzado a actualizar el estado.
    const archivo = entrada.current?.files?.[0];
    if (!archivo) { setError("Elige un archivo .xlsx."); return; }
    setEstado("subiendo");
    setError(null);
    const form = new FormData();
    form.set("archivo", archivo);
    try {
      const r = await fetch("/api/v1/importaciones", {
        method: "POST", body: form, headers: { "x-csrf-token": csrf, "idempotency-key": crypto.randomUUID() },
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error?.mensaje ?? "No se pudo importar");
      setInforme(datos);
      router.refresh();
    } catch (e) {
      setError(e instanceof TypeError ? "Sin conexión: no se importó nada." : (e as Error).message);
    } finally {
      setEstado("listo");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-linea-fuerte bg-lamina p-6">
        <FileSpreadsheet className="h-10 w-10 text-musgo" strokeWidth={1.3} />
        <label className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">Excel del cotizador (.xlsx, hojas Precio y Categorias)</span>
          <input ref={entrada} type="file" accept=".xlsx" aria-label="Archivo Excel" onChange={() => { setInforme(null); setError(null); }}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-linea-fuerte file:bg-papel file:px-3 file:py-1.5 file:text-sm" />
        </label>
        <Boton variante="primario" disabled={estado === "subiendo"} onClick={subir}>
          <Upload className="h-4 w-4" /> {estado === "subiendo" ? "Importando…" : "Importar"}
        </Boton>
      </div>

      {error && <p role="alert" className="rounded-md border border-error/25 bg-error-velo px-4 py-3 text-sm text-error">{error}</p>}

      {informe && (
        <section aria-label="Informe de importación" className="space-y-4">
          <p className="text-sm text-tinta-suave">
            {informe.repetida
              ? "Este archivo ya se había importado: no se hicieron cambios."
              : informe.listaVersion ? `Lista de precios vigente: v${informe.listaVersion}.` : "No hubo cambios de precio: la lista vigente se mantiene."}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[
              ["Creadas", informe.creadas, "bg-musgo-velo text-musgo"], ["Actualizadas", informe.actualizadas, "bg-pizarra-velo text-pizarra"],
              ["Sin cambios", informe.sinCambios, "bg-papel-hundido text-tinta-suave"], ["Rechazadas", informe.rechazadas, "bg-error-velo text-error"],
            ].map(([t, n, c]) => (
              <div key={t as string} className={`rounded-md py-3 ${c}`}>
                <dt className="text-[11px] uppercase tracking-wider">{t}</dt>
                <dd className="font-display text-2xl tabular-nums">{(n as number).toLocaleString("es-CL")}</dd>
              </div>
            ))}
          </dl>
          {informe.correcciones.length > 0 && (
            <div className="rounded-lg border border-linea bg-lamina">
              <p className="flex items-center justify-between border-b border-linea px-4 py-2.5 text-sm font-medium">
                Filas corregidas · {informe.correcciones.length} <Etiqueta tono="ambar">revisar en el Excel</Etiqueta>
              </p>
              <p className="px-4 pt-2.5 text-xs text-tinta-tenue">El código no coincidía con los atributos y solo una corrección era consistente con el resto del catálogo.</p>
              <Tabla>
                <thead><tr><Th>Fila</Th><Th>Corrección</Th></tr></thead>
                <tbody>
                  {informe.correcciones.map((c) => (
                    <Tr key={c.fila}><Td className="font-mono">{c.fila}</Td><Td className="font-mono text-xs text-tinta-suave">{c.detalle}</Td></Tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}
          {informe.rechazos.length > 0 && (
            <div className="rounded-lg border border-linea bg-lamina">
              <p className="flex items-center justify-between border-b border-linea px-4 py-2.5 text-sm font-medium">
                Filas rechazadas <Etiqueta tono="error">corregir en el Excel</Etiqueta>
              </p>
              <Tabla>
                <thead><tr><Th>Fila</Th><Th>Motivo</Th></tr></thead>
                <tbody>
                  {informe.rechazos.map((r) => (
                    <Tr key={r.fila}><Td className="font-mono">{r.fila}</Td><Td className="text-tinta-suave">{r.motivo}</Td></Tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
