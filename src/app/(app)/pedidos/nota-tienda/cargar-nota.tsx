"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, FileUp, TriangleAlert } from "lucide-react";
import { Boton, Placa } from "@/components/ui/base";
import { Tabla, Td, Th, Tr } from "@/components/ui/tabla";
import { clp, fecha } from "@/lib/formato";

interface Linea { codigo: string; cantidad: number; medidaSolicitada: string | null; precioNota: number; articulo: { descripcion: string } | null; precioLista: number | null; aviso: string | null }
interface Previa {
  nota: { numero: string; fecha: string | null; refCotizacion: string | null; despacho: { direccion: string | null; transporte: string | null; proyecto: string | null; entregaComprometida: string | null }; avisos: string[] };
  lineas: Linea[]; errores: string[]; duplicada: { id: string; numero: number } | null;
}

const campo = "mt-1 h-9 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-sm focus:border-tinta focus:outline-none";

async function enviar(url: string, form: FormData, csrf: string, idempotente = false) {
  const headers: Record<string, string> = { "x-csrf-token": csrf };
  if (idempotente) headers["idempotency-key"] = crypto.randomUUID();
  const r = await fetch(url, { method: "POST", body: form, headers });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(cuerpo?.error?.mensaje ?? "No se pudo leer la nota.");
  return cuerpo;
}

/** Pedido directo desde el PDF de la nota de la tienda (ADR-0008): leer → revisar → confirmar. */
export function CargarNota({ tiendas, csrf }: { tiendas: { id: string; nombre: string }[]; csrf: string }) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [clienteId, setClienteId] = useState(tiendas[0]?.id ?? "");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const formulario = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    const pdf = archivo.current?.files?.[0];
    if (pdf) f.set("archivo", pdf);
    if (clienteId) f.set("clienteId", clienteId);
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const leer = async () => {
    setError(null); setPrevia(null); setOcupado(true);
    try { setPrevia(await enviar("/api/v1/pedidos/nota-tienda/vista-previa", formulario(), csrf)); } catch (e) { setError((e as Error).message); } finally { setOcupado(false); }
  };
  const confirmar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null); setOcupado(true);
    try {
      const r = await enviar("/api/v1/pedidos/nota-tienda", formulario(Object.fromEntries([...f].map(([k, v]) => [k, String(v)]))), csrf, true);
      router.push(`/pedidos/${r.id}`);
    } catch (err) { setError((err as Error).message); setOcupado(false); }
  };
  const bloqueado = !previa || previa.errores.length > 0 || Boolean(previa.duplicada) || !clienteId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Tienda
          <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setPrevia(null); }} className={`${campo} w-64`} aria-label="Tienda">
            {tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">PDF de la nota de pedido
          <input ref={archivo} type="file" accept="application/pdf,.pdf" aria-label="PDF de la nota" onChange={() => setPrevia(null)}
            className="mt-1 block text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-linea-fuerte file:bg-lamina file:px-3" />
        </label>
        <Boton onClick={leer} disabled={ocupado}><FileUp className="h-4 w-4" /> Leer nota</Boton>
      </div>
      {error && <p role="alert" className="rounded-md border border-error/25 bg-error-velo px-4 py-2 text-sm text-error">{error}</p>}

      {previa && (
        <section aria-label="Vista previa de la nota" className="space-y-4">
          <p className="text-sm text-tinta-suave">
            Nota N.º <strong className="text-tinta">{previa.nota.numero}</strong>
            {previa.nota.fecha && <> del {fecha(previa.nota.fecha)}</>}{previa.nota.refCotizacion && <> · cotización de la tienda N.º {previa.nota.refCotizacion}</>}
            {previa.nota.despacho.proyecto && <> · proyecto {previa.nota.despacho.proyecto}</>}
          </p>
          {previa.duplicada && <p role="alert" className="flex items-center gap-2 text-sm text-error"><CircleAlert className="h-4 w-4" /> Esta nota ya se cargó como la nota de pedido N.º {previa.duplicada.numero}.</p>}
          {[...previa.errores, ...previa.nota.avisos].map((a) => <p key={a} role="alert" className="flex items-center gap-2 text-sm text-error"><CircleAlert className="h-4 w-4" /> {a}</p>)}
          <Tabla>
            <thead><tr><Th>Código</Th><Th>Descripción</Th><Th alinear="der">Cant.</Th><Th alinear="der">Precio nota</Th><Th alinear="der">Precio lista</Th></tr></thead>
            <tbody>
              {previa.lineas.map((l) => (
                <Tr key={l.codigo}>
                  <Td><Placa codigo={l.codigo} /></Td>
                  <Td>{l.articulo?.descripcion ?? <span className="text-error">no está en el catálogo</span>}
                    {l.medidaSolicitada && <span className="block text-xs text-tinta-tenue">Medida solicitada: {l.medidaSolicitada}</span>}
                    {l.aviso && <span className="mt-1 flex items-center gap-1 text-xs text-ambar"><TriangleAlert className="h-3 w-3" /> {l.aviso}</span>}</Td>
                  <Td alinear="der">{l.cantidad}</Td>
                  <Td alinear="der" className="text-tinta-suave">{clp(l.precioNota)}</Td>
                  <Td alinear="der" className="font-medium">{l.precioLista === null ? "—" : clp(l.precioLista)}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
          <form aria-label="Confirmar pedido de la tienda" onSubmit={confirmar} className="grid gap-3 rounded-lg border border-linea bg-lamina p-5 sm:grid-cols-2">
            <label className="text-sm text-tinta-tenue">Dirección de despacho<input name="direccionDespacho" defaultValue={previa.nota.despacho.direccion ?? ""} maxLength={300} className={campo} /></label>
            <label className="text-sm text-tinta-tenue">Medio de transporte<input name="medioTransporte" defaultValue={previa.nota.despacho.transporte ?? ""} maxLength={120} className={campo} /></label>
            <label className="text-sm text-tinta-tenue">Entrega comprometida<input type="date" name="entregaComprometida" defaultValue={previa.nota.despacho.entregaComprometida ?? ""} className={campo} /></label>
            <label className="text-sm text-tinta-tenue">Observaciones para la fábrica<input name="observaciones" maxLength={1000} className={campo} /></label>
            <p className="text-xs text-tinta-tenue sm:col-span-2">Se cobra el precio de venta de la lista vigente, sin recargo. No se guardan los datos del cliente final de la tienda.</p>
            <div className="sm:col-span-2"><Boton type="submit" variante="primario" disabled={bloqueado || ocupado}>Crear nota de pedido y reservar</Boton></div>
          </form>
        </section>
      )}
    </div>
  );
}
