"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { pedir } from "@/lib/api-cliente";

const campo = "mt-1.5 h-11 w-full rounded-md border border-linea-fuerte bg-lamina px-3 text-[15px] focus:border-tinta focus:outline-none";

export function FormularioLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setEnviando(true);
    try {
      await pedir("POST", "/api/v1/sesion", { cuerpo: { email: form.get("email"), clave: form.get("clave") } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form className="entrada w-full max-w-sm" onSubmit={ingresar} noValidate>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-rauli">Acceso interno</p>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Ingresar</h1>
      <div className="regla mt-6 mb-8" aria-hidden />

      <label className="block text-sm font-medium" htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" autoComplete="username" required className={campo} />

      <label className="mt-5 block text-sm font-medium" htmlFor="clave">Contraseña</label>
      <input id="clave" name="clave" type="password" autoComplete="current-password" required className={campo} />

      {error && (
        <p className="mt-3 rounded-md border border-error/25 bg-error-velo px-3 py-2 text-sm text-error" role="alert">{error}</p>
      )}

      <button type="submit" disabled={enviando}
        className="mt-7 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-rauli text-[15px] font-medium text-lamina shadow-[inset_0_-2px_0_rgb(0_0_0/0.2)] hover:bg-rauli-hondo disabled:opacity-60">
        <Lock className="h-4 w-4" /> {enviando ? "Ingresando…" : "Ingresar"}
      </button>
      <p className="mt-6 text-center text-xs text-tinta-tenue">
        ¿Olvidaste tu contraseña? Pídela a quien administra los usuarios.
      </p>
    </form>
  );
}
