import { EsqueletoLista } from "@/components/ui/esqueleto";

// Las listas de stock (artículos, puertas y despachos anteriores) cargan con la forma de su tabla (UX §2).
export default function Cargando() {
  return <EsqueletoLista conPestanas columnas={7} />;
}
