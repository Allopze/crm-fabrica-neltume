// Esqueletos de carga (UX §2): la forma de la pantalla que viene, sin spinners. Respetan «reducir movimiento».

function Barra({ className }: { className: string }) {
  return <span aria-hidden className={`block rounded bg-papel-hundido ${className}`} />;
}

/** Encabezado, filtros y tabla: lo que tienen las listas largas (stock, precios, auditoría, cotizaciones, pedidos). */
export function EsqueletoLista({ filas = 8, columnas = 6, conPestanas }: { filas?: number; columnas?: number; conPestanas?: boolean }) {
  return (
    <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only" role="status">Cargando la lista…</span>
      <Barra className="h-10 w-full max-w-80" />
      <Barra className="mt-3 h-4 w-full max-w-xl" />
      <div aria-hidden className="regla mt-6 mb-6 opacity-60" />
      {conPestanas && <div className="mb-6 flex gap-4 border-b border-linea pb-3"><Barra className="h-4 w-20" /><Barra className="h-4 w-16" /><Barra className="h-4 w-36" /></div>}
      <div className="mb-5 flex flex-wrap gap-2"><Barra className="h-9 w-56" /><Barra className="h-9 w-40" /><Barra className="h-9 w-36" /></div>
      <div className="overflow-hidden rounded-lg border border-linea bg-lamina">
        <div className="flex gap-6 border-b border-linea-fuerte px-4 py-3">
          {Array.from({ length: columnas }, (_, i) => <Barra key={i} className="h-3 flex-1" />)}
        </div>
        {Array.from({ length: filas }, (_, f) => (
          <div key={f} className="flex items-center gap-6 border-b border-linea/70 px-4 py-4 last:border-0">
            {Array.from({ length: columnas }, (_, i) => <Barra key={i} className={`h-3.5 flex-1 ${i === 0 ? "max-w-32" : ""}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
