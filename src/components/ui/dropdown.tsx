"use client";

import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/formato";
import { campo } from "./campos";

type Opcion = { valor: string; etiqueta: ReactNode; texto: string; deshabilitada: boolean };
type Props = Omit<ComponentProps<"button">, "children" | "type" | "value" | "defaultValue" | "name" | "onChange" | "onKeyDown" | "onBlur" | "className"> & {
  children: ReactNode;
  name?: string;
  value?: string;
  defaultValue?: string;
  className?: string;
  onChange?: (value: string) => void;
  onBlur?: ComponentProps<"button">["onBlur"];
};

function textoDe(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("");
  if (isValidElement(nodo)) return textoDe((nodo.props as { children?: ReactNode }).children);
  return "";
}

/** Selector visual compartido con el sistema de campos (REQ-NFR-6). Las opciones se pasan como <option>. */
export function Dropdown({ children, name, value, defaultValue, className, onChange, onBlur, disabled, id, ...botonProps }: Props) {
  const opciones = useMemo(() => Children.toArray(children).flatMap((nodo): Opcion[] => {
    if (!isValidElement(nodo)) return [];
    const p = nodo.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
    const etiqueta = p.children ?? "";
    return [{ valor: String(p.value ?? textoDe(etiqueta)), etiqueta, texto: textoDe(etiqueta), deshabilitada: Boolean(p.disabled) }];
  }), [children]);
  const inicial = defaultValue ?? opciones[0]?.valor ?? "";
  const [interno, setInterno] = useState(value ?? inicial);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [busqueda, setBusqueda] = useState("");
  const referencia = useRef<HTMLSpanElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const opcionActiva = useRef<HTMLSpanElement>(null);
  const temporizadorBusqueda = useRef<number | null>(null);
  const listaId = `${useId()}-opciones`;
  const controlado = value !== undefined;
  const actual = controlado ? value : interno;
  const seleccionada = opciones.find((o) => o.valor === actual);
  const permitidas = opciones.map((o, i) => !o.deshabilitada ? i : -1).filter((i) => i >= 0);
  const clases = className?.split(/\s+/) ?? [];
  const anchoExplicito = clases.some((c) => c === "flex-1" || /(^|:)w-/.test(c));

  function indiceInicial(direccion = 1) {
    const i = opciones.findIndex((o) => o.valor === actual && !o.deshabilitada);
    return i >= 0 ? i : (direccion > 0 ? permitidas[0] : permitidas.at(-1)) ?? -1;
  }

  function mover(desde: number, direccion: number) {
    if (!permitidas.length) return -1;
    const pos = permitidas.indexOf(desde);
    return permitidas[(pos + direccion + permitidas.length) % permitidas.length];
  }

  function elegir(indice: number) {
    const opcion = opciones[indice];
    if (!opcion || opcion.deshabilitada) return;
    if (!controlado) setInterno(opcion.valor);
    onChange?.(opcion.valor);
    setAbierto(false);
  }

  function abrir(indice = indiceInicial()) {
    setActivo(indice);
    setAbierto(true);
  }

  function teclado(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const direccion = e.key === "ArrowDown" ? 1 : -1;
      if (!abierto) abrir(indiceInicial(direccion));
      else setActivo((i) => i < 0 ? (direccion > 0 ? permitidas[0] ?? -1 : permitidas.at(-1) ?? -1) : mover(i, direccion));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActivo(e.key === "Home" ? permitidas[0] ?? -1 : permitidas.at(-1) ?? -1);
      setAbierto(true);
      return;
    }
    if (e.key === "Escape") { setAbierto(false); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!abierto) abrir();
      else elegir(activo);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const nueva = `${busqueda}${e.key}`.toLocaleLowerCase("es-CL");
      setBusqueda(nueva);
      const i = opciones.findIndex((o) => !o.deshabilitada && o.texto.toLocaleLowerCase("es-CL").startsWith(nueva));
      if (i >= 0) { setActivo(i); setAbierto(true); }
      if (temporizadorBusqueda.current) window.clearTimeout(temporizadorBusqueda.current);
      temporizadorBusqueda.current = window.setTimeout(() => setBusqueda(""), 700);
    }
  }

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!referencia.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  useEffect(() => { opcionActiva.current?.scrollIntoView?.({ block: "nearest" }); }, [activo, abierto]);

  useEffect(() => () => { if (temporizadorBusqueda.current) window.clearTimeout(temporizadorBusqueda.current); }, []);

  useEffect(() => {
    const form = boton.current?.form;
    if (!form || controlado) return;
    const restablecer = () => { setInterno(inicial); setAbierto(false); };
    form.addEventListener("reset", restablecer);
    return () => form.removeEventListener("reset", restablecer);
  }, [controlado, inicial]);

  return (
    <span
      ref={referencia}
      style={{ minWidth: clases.some((c) => c === "min-w-0" || c === "w-full") ? 0 : "9rem", width: anchoExplicito ? undefined : "max-content" }}
      className={cn("relative inline-block max-w-full align-middle", className)}
    >
      {name && <input type="hidden" name={name} value={actual} disabled={disabled} />}
      <button
        {...botonProps}
        id={id}
        ref={boton}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? listaId : undefined}
        aria-activedescendant={abierto && activo >= 0 ? `${listaId}-${activo}` : undefined}
        disabled={disabled}
        style={{ width: anchoExplicito ? "100%" : "max-content" }}
        className={cn(campo, "flex min-w-0 max-w-full items-center justify-between gap-2 text-left", disabled && "cursor-not-allowed")}
        onBlur={(e) => { if (!e.relatedTarget || !referencia.current?.contains(e.relatedTarget as Node)) setAbierto(false); onBlur?.(e); }}
        onKeyDown={teclado}
        onClick={() => abierto ? setAbierto(false) : abrir()}
      >
        <span className="min-w-0 flex-1 truncate">{seleccionada?.etiqueta ?? "Selecciona…"}</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-tinta-tenue transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <span id={listaId} role="listbox" className="absolute left-0 top-full z-50 mt-1 block max-h-60 w-max min-w-full max-w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-md border border-linea-fuerte bg-lamina py-1 shadow-[0_12px_30px_-14px_rgb(30_40_30/0.5)]">
          {opciones.map((opcion, i) => (
            <span
              key={`${opcion.valor}-${i}`}
              id={`${listaId}-${i}`}
              ref={activo === i ? opcionActiva : undefined}
              role="option"
              data-value={opcion.valor}
              aria-selected={actual === opcion.valor}
              aria-disabled={opcion.deshabilitada || undefined}
              className={cn(
                "flex min-h-9 items-center justify-between gap-3 px-3 py-1.5 text-sm pointer-coarse:min-h-11",
                activo === i && "bg-rauli-velo text-rauli-hondo",
                actual === opcion.valor && "font-medium",
                opcion.deshabilitada ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-rauli-velo",
              )}
              onPointerDown={(e) => { if (e.button === 0) e.preventDefault(); }}
              onPointerMove={() => { if (!opcion.deshabilitada) setActivo(i); }}
              onClick={() => elegir(i)}
            >
              <span className="min-w-0 break-words">{opcion.etiqueta}</span>
              {actual === opcion.valor && <Check aria-hidden className="h-4 w-4 shrink-0 text-rauli" />}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
