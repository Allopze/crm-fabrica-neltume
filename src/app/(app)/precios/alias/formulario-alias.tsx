"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Boton } from "@/components/ui/base";
import { campo } from "@/components/ui/campos";
import { ConfirmarAccion } from "@/components/ui/confirmar-accion";
import { pedir } from "@/lib/api-cliente";

export function NuevoAlias({ modelos, csrf }: { modelos: string[]; csrf: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form aria-label="Nuevo alias" className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      iniciar(async () => {
        try {
          await pedir("POST", "/api/v1/alias-modelos", { csrf, cuerpo: { alias: f.get("alias"), modelo: f.get("modelo"), tipo: f.get("tipo") } });
          setError(null); form.reset(); router.refresh();
        } catch (err) { setError((err as Error).message); }
      });
    }}>
      <input name="alias" required minLength={3} maxLength={60} placeholder="Como lo dicen (p. ej. coscos)" aria-label="Alias" className={`${campo} w-56`} />
      <select name="modelo" aria-label="Modelo" className={campo}>{modelos.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      <select name="tipo" aria-label="Tipo de alias" className={campo} defaultValue="seguro">
        <option value="seguro">Seguro (se aplica)</option><option value="posible">Dudoso (se pregunta)</option>
      </select>
      <Boton type="submit" disabled={pendiente}><Plus className="h-4 w-4" /> {pendiente ? "Agregando…" : "Agregar"}</Boton>
      {error && <p role="alert" className="w-full text-sm text-error">{error}</p>}
    </form>
  );
}

export function QuitarAlias({ alias, csrf }: { alias: string; csrf: string }) {
  const router = useRouter();
  return (
    <ConfirmarAccion
      etiqueta={`Quitar alias ${alias}`}
      titulo={`¿Quitar el alias «${alias}»?`}
      onConfirmar={async () => { await pedir("DELETE", `/api/v1/alias-modelos/${encodeURIComponent(alias)}`, { csrf }); router.refresh(); }}
    />
  );
}
