"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn, clp } from "@/lib/formato";

export interface Opcion { codigo: string; modelo: string; madera: string; ancho: string; altoM: number; precioVenta: number }

/**
 * Busca artículos en la lista vigente (código o modelo) y devuelve el código elegido.
 * Combobox accesible: el foco queda en el input y las opciones se recorren con flechas/Enter (UX §3).
 */
export function SelectorArticulo({ version, onElegir, etiqueta = "Buscar artículo del catálogo", id }: {
  version: number | null;
  onElegir: (codigo: string, opcion: Opcion) => void;
  etiqueta?: string;
  id?: string;
}) {
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [consultado, setConsultado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reintento, setReintento] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const estadoId = `${listaId}-estado`;
  const idOpcion = (i: number) => `${listaId}-op-${i}`;

  useEffect(() => {
    const texto = q.trim();
    if (!version || texto.length < 2) return;
    const control = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/listas-precio/${version}?${new URLSearchParams({ q: texto, limite: "8" })}`, { signal: control.signal });
        if (!r.ok) throw new Error("No se pudo buscar en el catálogo.");
        const datos = await r.json() as { datos?: Opcion[] };
        if (control.signal.aborted) return;
        setOpciones(datos.datos ?? []);
        setActivo(datos.datos?.length ? 0 : -1);
        setAbierto(true);
        setConsultado(true);
      } catch (e) {
        if (control.signal.aborted) return;
        setOpciones([]); setAbierto(true); setError((e as Error).message); setConsultado(true);
      } finally {
        if (!control.signal.aborted) setBuscando(false);
      }
    }, 250);
    return () => { clearTimeout(t); control.abort(); };
  }, [q, version, reintento]);

  function alCambiar(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value;
    setQ(valor);
    setOpciones([]); setAbierto(false); setActivo(-1); setError(null); setConsultado(false);
    setBuscando(Boolean(version) && valor.trim().length >= 2);
  }

  function elegir(o: Opcion) {
    onElegir(o.codigo, o);
    setQ(""); setOpciones([]); setAbierto(false); setActivo(-1); setError(null); setConsultado(false); setBuscando(false);
    entrada.current?.focus();
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setAbierto(false); setActivo(-1);
      return;
    }
    if (e.key === "Tab") {
      setAbierto(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!opciones.length) return;
      if (!abierto) { setAbierto(true); return; }
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setActivo((i) => (i + paso + opciones.length) % opciones.length);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      if (!opciones.length) return;
      e.preventDefault();
      setActivo(e.key === "Home" ? 0 : opciones.length - 1);
      return;
    }
    if (e.key === "Enter" && abierto && activo >= 0 && opciones[activo]) {
      e.preventDefault();
      elegir(opciones[activo]);
    }
  }

  const mostrarEstado = q.trim().length >= 2;

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={entrada}
        id={id}
        value={q}
        onChange={alCambiar}
        onKeyDown={alTeclear}
        onBlur={() => setAbierto(false)}
        disabled={!version}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={abierto && activo >= 0 ? idOpcion(activo) : undefined}
        aria-describedby={estadoId}
        autoComplete="off"
        placeholder={version ? "Busca por código o modelo" : "No hay lista de precios vigente"}
        aria-label={etiqueta}
        className="h-9 w-full rounded-md border border-linea-fuerte bg-lamina px-3 font-mono text-sm uppercase placeholder:font-sans placeholder:normal-case focus:border-tinta focus:outline-none disabled:opacity-60 pointer-coarse:h-11"
      />

      <p id={estadoId} role="status" aria-live="polite" className={cn("mt-1 text-xs", error ? "text-error" : "text-tinta-tenue", !mostrarEstado && "sr-only")}>
        {buscando ? "Buscando…" : error ? error : consultado && opciones.length === 0 ? `Sin resultados para «${q.trim()}».` : opciones.length > 0 ? `${opciones.length} ${opciones.length === 1 ? "resultado" : "resultados"}.` : ""}
      </p>
      {error && (
        <button type="button" onClick={() => { setBuscando(true); setError(null); setReintento((n) => n + 1); }}
          className="mt-1 inline-flex min-h-8 items-center text-xs text-rauli hover:underline pointer-coarse:min-h-11">
          Reintentar búsqueda
        </button>
      )}

      {abierto && opciones.length > 0 && (
        <ul id={listaId} role="listbox" aria-label="Artículos del catálogo"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-linea-fuerte bg-lamina shadow-lg">
          {opciones.map((o, i) => (
            <li key={o.codigo} id={idOpcion(i)} role="option" aria-selected={i === activo}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(o)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm", i === activo ? "bg-papel-hundido" : "hover:bg-papel")}>
              <span><span className="font-mono">{o.codigo}</span> <span className="capitalize text-tinta-suave">{o.modelo.toLowerCase()} · {o.madera.toLowerCase()}</span></span>
              <span className="tabular-nums text-tinta-tenue">{clp(o.precioVenta)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
