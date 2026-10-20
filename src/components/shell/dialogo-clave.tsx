"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campoAlto } from "@/components/ui/campos";
import { ErrorAccion } from "@/components/ui/error-accion";
import { LARGO_MINIMO_CLAVE } from "@/domain/auth/reglas";
import { pedir } from "@/lib/api-cliente";

const campo = `mt-1 w-full ${campoAlto}`;

/**
 * Cambiar la contraseña propia (con la actual) o restablecer la de otro usuario (REQ-ADM-1.4, 2.5). Las otras
 * sesiones del usuario se cierran en el servidor.
 */
export function DialogoClave({ modo, usuario, csrf, abierto, alCerrar }: {
  modo: "propia" | "restablecer"; usuario?: { id: string; nombre: string }; csrf: string; abierto: boolean; alCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<unknown>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) { setError(null); setListo(false); d.showModal(); }
    if (!abierto && d.open) d.close();
  }, [abierto]);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget; // tras un await, React deja currentTarget en null
    const f = new FormData(formulario);
    const nueva = String(f.get("claveNueva") ?? "");
    if (nueva !== String(f.get("repetir") ?? "")) { setError("Las contraseñas nuevas no coinciden."); return; }
    setError(null); setEnviando(true);
    try {
      if (modo === "propia") await pedir("PUT", "/api/v1/sesion/clave", { csrf, cuerpo: { claveActual: f.get("claveActual"), claveNueva: nueva } });
      else await pedir("PUT", `/api/v1/usuarios/${usuario!.id}/clave`, { csrf, cuerpo: { claveNueva: nueva } });
      setListo(true);
      formulario.reset();
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  const titulo = modo === "propia" ? "Cambiar mi contraseña" : `Restablecer la contraseña de ${usuario?.nombre ?? ""}`;
  return (
    <dialog ref={dialogo} onClose={alCerrar} aria-label={titulo}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-linea bg-lamina p-5 text-tinta shadow-xl backdrop:bg-black/40">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-tinta-suave" />
        <h2 className="flex-1 font-display text-lg">{titulo}</h2>
        <button type="button" onClick={alCerrar} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded text-tinta-suave hover:bg-papel-hundido hover:text-tinta pointer-coarse:h-11 pointer-coarse:w-11"><X className="h-4 w-4" /></button>
      </div>
      {listo ? (
        <div className="space-y-4">
          <p role="status" className="text-sm">
            {modo === "propia" ? "Listo: tu contraseña cambió y se cerraron tus otras sesiones." : "Listo: la contraseña cambió y se cerraron sus sesiones. Entrégasela por un canal privado."}
          </p>
          <Boton variante="primario" onClick={alCerrar}>Cerrar</Boton>
        </div>
      ) : (
        <form onSubmit={guardar} className="space-y-3 text-sm">
          {modo === "propia" && (
            <label className="block">Contraseña actual
              <input name="claveActual" type="password" required autoComplete="current-password" className={campo} />
            </label>
          )}
          <label className="block">Contraseña nueva (mín. {LARGO_MINIMO_CLAVE})
            <input name="claveNueva" type="password" required minLength={LARGO_MINIMO_CLAVE} autoComplete="new-password" className={campo} />
          </label>
          <label className="block">Repite la contraseña nueva
            <input name="repetir" type="password" required minLength={LARGO_MINIMO_CLAVE} autoComplete="new-password" className={campo} />
          </label>
          {error ? <ErrorAccion error={error} className="px-3 py-2" /> : null}
          <div className="flex gap-2 pt-1">
            <Boton variante="primario" type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</Boton>
            <Boton variante="fantasma" type="button" onClick={alCerrar}>Cancelar</Boton>
          </div>
        </form>
      )}
    </dialog>
  );
}
