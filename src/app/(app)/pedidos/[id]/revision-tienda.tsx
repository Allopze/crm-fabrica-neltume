"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/base";
import { ErrorAccion } from "@/components/ui/error-accion";
import { pedir } from "@/lib/api-cliente";
import { fechaHora } from "@/lib/formato";

export interface PendienteTienda { id: string; tipoEvento: string; revision: number; numeroNota: string; creadoEn: string; avisos: string[] }

/**
 * Revisión o anulación de la tienda que llegó con la nota ya en curso (ADR-0023 §4): no se aplicó sola. Aplicar una
 * revisión cancela esta nota y crea la nueva; aplicar una anulación la cancela. Las dos piden motivo y se auditan.
 */
export function RevisionTienda({ notaId, p, csrf }: { notaId: string; p: PendienteTienda; csrf: string }) {
  const router = useRouter();
  const [accion, setAccion] = useState<"aplicar" | "descartar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const anulacion = p.tipoEvento === "order.cancelled";

  async function resolver() {
    setEnviando(true);
    setError(null);
    try {
      const r = await pedir<{ nueva: { id: string } | null }>("POST", `/api/v1/pedidos/${notaId}/recepciones/${p.id}`, { csrf, idempotente: true, cuerpo: { accion, motivo } });
      if (r.nueva) router.push(`/pedidos/${r.nueva.id}`);
      else router.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section role="status" aria-label={anulacion ? "Anulación de la tienda" : "Revisión de la tienda"} className="mb-6 rounded-lg border border-pizarra/40 bg-pizarra-velo px-5 py-4 text-sm">
      <p className="font-medium text-tinta">
        {anulacion ? `La tienda anuló la nota N.º ${p.numeroNota}` : `La tienda envió la revisión ${p.revision} de la nota N.º ${p.numeroNota}`}
        <span className="font-normal text-tinta-tenue"> · {fechaHora(p.creadoEn)}</span>
      </p>
      <p className="mt-1 text-tinta-suave">
        {anulacion
          ? "Esta nota ya está en curso, así que no se canceló sola. Aplicar la cancela y libera sus reservas; lo ya fabricado queda en stock."
          : "Esta nota ya está en curso, así que no se reemplazó sola. Aplicar la cancela (libera sus reservas) y crea la nota nueva; lo ya fabricado queda en stock."}
      </p>
      {p.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-tinta-suave">{p.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      {accion ? (
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void resolver(); }}>
          <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} aria-label="Motivo"
            placeholder={accion === "aplicar" ? "Motivo (p. ej. «confirmado con la tienda»)" : "Motivo para descartarla"}
            className="h-9 w-72 rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none pointer-coarse:h-11" />
          <Boton type="submit" variante={accion === "aplicar" ? "primario" : "peligro"} disabled={!motivo.trim() || enviando}>
            {enviando ? "Guardando…" : accion === "aplicar" ? (anulacion ? "Cancelar la nota" : "Aplicar la revisión") : "Descartar"}
          </Boton>
          <Boton type="button" variante="fantasma" onClick={() => setAccion(null)}>Volver</Boton>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Boton variante="primario" onClick={() => { setAccion("aplicar"); setMotivo(""); }}>{anulacion ? "Aplicar la anulación" : "Aplicar la revisión"}</Boton>
          <Boton variante="fantasma" onClick={() => { setAccion("descartar"); setMotivo(""); }}>Descartar</Boton>
        </div>
      )}
      {error ? <ErrorAccion error={error} className="mt-2" /> : null}
    </section>
  );
}
