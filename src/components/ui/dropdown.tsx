"use client";

import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
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
  /** Muestra un buscador sobre las opciones; por omisión, cuando hay más de 10. */
  buscable?: boolean;
};

function textoDe(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("");
  if (isValidElement(nodo)) return textoDe((nodo.props as { children?: ReactNode }).children);
  return "";
}

const normal = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-CL");
/** «Elegir cliente…»: opción vacía que invita a elegir, no una elección. */
const esInvitacion = (o?: Opcion) => Boolean(o && o.valor === "" && o.texto.endsWith("…"));

/** Selector visual compartido con el sistema de campos (REQ-NFR-6). Las opciones se pasan como <option>. */
export function Dropdown({ children, name, value, defaultValue, className, onChange, onBlur, disabled, id, buscable, ...botonProps }: Props) {
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
  const [filtro, setFiltro] = useState("");
  const referencia = useRef<HTMLSpanElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const oculta = useRef<HTMLInputElement>(null);
  const opcionActiva = useRef<HTMLSpanElement>(null);
  const temporizadorBusqueda = useRef<number | null>(null);
  const notificar = useRef(false);
  const listaId = `${useId()}-opciones`;
  const controlado = value !== undefined;
  const actual = controlado ? value : interno;
  const seleccionada = opciones.find((o) => o.valor === actual);
  const conBuscador = buscable ?? opciones.length > 10;
  const visibles = opciones.map((o, i) => (!filtro || normal(o.texto).includes(normal(filtro)) ? i : -1)).filter((i) => i >= 0);
  const permitidas = visibles.filter((i) => !opciones[i].deshabilitada);
  const clases = className?.split(/\s+/) ?? [];
  const anchoExplicito = clases.some((c) => c === "flex-1" || /(^|:)w-/.test(c));

  function indiceInicial(direccion = 1) {
    const i = opciones.findIndex((o) => o.valor === actual && !o.deshabilitada);
    return i >= 0 ? i : (direccion > 0 ? permitidas[0] : permitidas.at(-1)) ?? -1;
  }

  function mover(desde: number, direccion: number) {
    if (!permitidas.length) return -1;
    const pos = permitidas.indexOf(desde);
    if (pos < 0) return direccion > 0 ? permitidas[0] : permitidas.at(-1)!;
    return permitidas[(pos + direccion + permitidas.length) % permitidas.length];
  }

  function elegir(indice: number) {
    const opcion = opciones[indice];
    if (!opcion || opcion.deshabilitada) return;
    if (opcion.valor !== actual) notificar.current = true;
    if (!controlado) setInterno(opcion.valor);
    onChange?.(opcion.valor);
    setAbierto(false);
    if (conBuscador) boton.current?.focus();
  }

  function abrir(indice = indiceInicial()) {
    setFiltro("");
    setActivo(indice);
    setAbierto(true);
  }

  function cerrar(enfocarBoton = false) {
    setAbierto(false);
    if (enfocarBoton) boton.current?.focus();
  }

  // Flechas, Enter y Escape: los mismos en el botón y en el buscador.
  function navegar(e: KeyboardEvent<HTMLElement>): boolean {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const direccion = e.key === "ArrowDown" ? 1 : -1;
      if (!abierto) abrir(indiceInicial(direccion));
      else setActivo((i) => mover(i, direccion));
      return true;
    }
    if (e.key === "Home" || e.key === "End") {
      if (e.currentTarget === buscador.current) return false;
      e.preventDefault();
      setActivo(e.key === "Home" ? permitidas[0] ?? -1 : permitidas.at(-1) ?? -1);
      setAbierto(true);
      return true;
    }
    if (e.key === "Escape") { if (abierto) { e.preventDefault(); cerrar(true); } return true; }
    if (e.key === "Enter" || (e.key === " " && e.currentTarget === boton.current)) {
      e.preventDefault();
      if (!abierto) abrir();
      else elegir(activo);
      return true;
    }
    return false;
  }

  function teclado(e: KeyboardEvent<HTMLButtonElement>) {
    if (navegar(e)) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (conBuscador) {
        abrir();
        setFiltro(e.key);
        setActivo(opciones.findIndex((o) => !o.deshabilitada && normal(o.texto).includes(normal(e.key))));
        return;
      }
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
    if (conBuscador) buscador.current?.focus();
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto, conBuscador]);

  // El menú no se sale de la pantalla: se alinea a la derecha o se abre hacia arriba si hace falta. Se monta en cada
  // apertura, así que los estilos vuelven solos a su lugar.
  useLayoutEffect(() => {
    const m = menu.current;
    const b = boton.current?.getBoundingClientRect();
    if (!abierto || !m || !b) return;
    const r = m.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) Object.assign(m.style, { left: "auto", right: "0" });
    if (r.bottom > window.innerHeight - 8 && b.top > window.innerHeight - b.bottom) Object.assign(m.style, { top: "auto", bottom: "100%", marginTop: "0", marginBottom: "0.25rem" });
  }, [abierto]);

  useEffect(() => { opcionActiva.current?.scrollIntoView?.({ block: "nearest" }); }, [activo, abierto]);

  useEffect(() => () => { if (temporizadorBusqueda.current) window.clearTimeout(temporizadorBusqueda.current); }, []);

  // Los formularios que escuchan cambios (filtros que se aplican solos) se enteran de la elección.
  useEffect(() => {
    if (!notificar.current) return;
    notificar.current = false;
    oculta.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [actual]);

  useEffect(() => {
    const form = boton.current?.form;
    if (!form || controlado) return;
    const restablecer = () => { setInterno(inicial); setAbierto(false); };
    form.addEventListener("reset", restablecer);
    return () => form.removeEventListener("reset", restablecer);
  }, [controlado, inicial]);

  const salir = (relacionado: EventTarget | null) => { if (!relacionado || !referencia.current?.contains(relacionado as Node)) setAbierto(false); };

  return (
    <span
      ref={referencia}
      style={{ minWidth: clases.some((c) => c === "min-w-0" || c === "w-full") ? 0 : "9rem", width: anchoExplicito ? undefined : "max-content" }}
      className={cn("relative inline-block max-w-full align-middle", className)}
    >
      {name && <input ref={oculta} type="hidden" name={name} value={actual} disabled={disabled} />}
      <button
        {...botonProps}
        id={id}
        ref={boton}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? listaId : undefined}
        aria-activedescendant={abierto && !conBuscador && activo >= 0 ? `${listaId}-${activo}` : undefined}
        disabled={disabled}
        style={{ width: anchoExplicito ? "100%" : "max-content" }}
        className={cn(campo, "flex min-w-0 max-w-full items-center justify-between gap-2 text-left", disabled && "cursor-not-allowed")}
        onBlur={(e) => { salir(e.relatedTarget); onBlur?.(e); }}
        onKeyDown={teclado}
        onClick={() => abierto ? setAbierto(false) : abrir()}
      >
        <span className={cn("min-w-0 flex-1 truncate", esInvitacion(seleccionada) && "text-tinta-tenue")}>{seleccionada?.etiqueta ?? "Selecciona…"}</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-tinta-tenue transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <span ref={menu} className="absolute top-full left-0 z-50 mt-1 block w-max min-w-full max-w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-linea-fuerte bg-lamina shadow-[0_12px_30px_-14px_rgb(30_40_30/0.5)]">
          {conBuscador && (
            <span className="flex items-center gap-2 border-b border-linea px-3">
              <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-tinta-tenue" />
              <input ref={buscador} value={filtro} placeholder="Buscar…" aria-label="Buscar opción" aria-controls={listaId}
                aria-activedescendant={activo >= 0 ? `${listaId}-${activo}` : undefined} autoComplete="off"
                onChange={(e) => {
                  const f = normal(e.target.value);
                  setFiltro(e.target.value);
                  setActivo(opciones.findIndex((o) => !o.deshabilitada && normal(o.texto).includes(f)));
                }}
                onKeyDown={(e) => { if (e.key === "Tab") { setAbierto(false); return; } navegar(e); }}
                onBlur={(e) => salir(e.relatedTarget)}
                className="h-9 w-full min-w-0 bg-transparent text-sm focus:outline-none pointer-coarse:h-11" />
            </span>
          )}
          <span id={listaId} role="listbox" className="block max-h-60 overflow-auto py-1">
            {visibles.length === 0 && <span className="block px-3 py-2 text-sm text-tinta-tenue">Sin coincidencias.</span>}
            {visibles.map((i) => {
              const opcion = opciones[i];
              const invitacion = esInvitacion(opcion);
              return (
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
                    actual === opcion.valor && !invitacion && "font-medium",
                    invitacion && activo !== i && "text-tinta-tenue",
                    opcion.deshabilitada ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-rauli-velo",
                  )}
                  onPointerDown={(e) => { if (e.button === 0) e.preventDefault(); }}
                  onPointerMove={() => { if (!opcion.deshabilitada) setActivo(i); }}
                  onClick={() => elegir(i)}
                >
                  <span className="min-w-0 break-words">{opcion.etiqueta}</span>
                  {actual === opcion.valor && !invitacion && <Check aria-hidden className="h-4 w-4 shrink-0 text-rauli" />}
                </span>
              );
            })}
          </span>
        </span>
      )}
    </span>
  );
}
