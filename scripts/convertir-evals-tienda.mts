// Convierte los casos de UN mensaje del cotizador de la tienda (referencia/evals/cotizacion.json, fuera de git) al
// formato de eval/casos.json (AI.md §6). El esperado se calcula con NUESTRO mapeo sobre el catálogo importado, a partir
// de lo que la tienda declara correcto (modelo, madera, medidas, cantidad): así el caso queda alineado con la fábrica.
// Uso: npx tsx --env-file-if-exists=.env.local scripts/convertir-evals-tienda.mts  (requiere el Excel real importado)
import { readFileSync, writeFileSync } from "node:fs";
import type { ItemPropuesto } from "../src/ai/esquema";
import type { Caso, Esperado } from "../src/ai/evaluacion";
import { bd, cerrarBd } from "../src/db/conexion";
import { cargarCatalogoMapeo } from "../src/domain/cotizaciones/catalogo";
import { mapearItem } from "../src/domain/cotizaciones/mapear";

interface CasoTienda { id: string; descripcion: string; mensajes: string[]; esperado: { items: { modelo: string | null; madera: string | null; ancho: number | null; alto: number | null; medida: string | null; cantidad: number | null; tipoMedida?: "hoja" | "vano" | null }[] } }
// Datos personales mínimos (AGENTS 8): el nombre de un cliente real pasa a uno ficticio, también en el id de la fuente.
const anonimo = (t: string) => t.replace(/(Cotizar? a )\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)?/gu, "$1Ana Rojas");
const fuente = (id: string) => id.replace(/^paula-lastra-/, "cliente-");
const TIPO: Record<string, ItemPropuesto["tipo"]> = { MARCO: "marco", "PIEZAS T": "piezas_t", ENDOLADO: "endolado", GUARDAPOLVO: "guardapolvo", PILASTRA: "pilastra" };

try {
  const tienda = (JSON.parse(readFileSync("referencia/evals/cotizacion.json", "utf8")) as CasoTienda[]).filter((c) => c.mensajes.length === 1);
  const actual = JSON.parse(readFileSync("eval/casos.json", "utf8")) as { _nota: string; casos: (Caso & { fuente?: string })[] };
  const propios = actual.casos.filter((c) => !c.fuente?.startsWith("tienda:"));
  const cat = await cargarCatalogoMapeo(bd());
  let id = Math.max(...propios.map((c) => c.id));
  const nuevos = tienda.map((c) => {
    const items = c.esperado.items.map((i): ItemPropuesto => {
      const tipo = (i.modelo && TIPO[i.modelo.toUpperCase()]) || "puerta";
      return { texto_fuente: c.mensajes[0], tipo, modelo: tipo === "puerta" ? i.modelo : null, madera: i.madera, ancho_m: tipo === "puerta" ? i.ancho : null,
        alto_m: i.alto, medida_accesorio: tipo === "puerta" ? null : i.medida, cantidad: i.cantidad, dudas: [], tipo_medida: i.tipoMedida ?? null };
    });
    const mapeados = items.map((p) => ({ p, m: mapearItem(p, cat) }));
    const esperado: Esperado[] = mapeados.map(({ m }) => m.estado === "ok" ? { estado: "ok", codigo: m.codigo!, cantidad: m.cantidad }
      : m.estado === "a_pedido" ? { estado: "a_pedido", referencia: m.referencia!.codigo } : { estado: "por_confirmar" });
    const grupo = esperado.some((e) => e.estado !== "ok") ? "ambiguo" : items.some((p) => p.tipo !== "puerta") ? "accesorio" : "claro";
    return { id: ++id, grupo, pedido: anonimo(c.mensajes[0]), esperado, fuente: `tienda:${fuente(c.id)}` } as Caso & { fuente: string };
  });
  writeFileSync("eval/casos.json", JSON.stringify({ ...actual, casos: [...propios, ...nuevos] }, null, 1));
  for (const n of nuevos) console.log(`${n.id} ${n.grupo.padEnd(9)} ${n.fuente.padEnd(36)} ${n.esperado.map((e) => e.codigo ?? e.referencia ?? e.estado).join(", ")}`);
} finally {
  await cerrarBd();
}
