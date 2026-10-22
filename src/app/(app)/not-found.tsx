import type { Metadata } from "next";
import { BotonLink, Vacio } from "@/components/ui/base";

export const metadata: Metadata = { title: "No encontrado" };

export default function NoEncontrado() {
  return (
    <Vacio titulo="No encontramos lo que buscas" accion={<BotonLink href="/">Volver al panel</BotonLink>}>
      Puede que no exista o que no tengas permiso para verlo.
    </Vacio>
  );
}
