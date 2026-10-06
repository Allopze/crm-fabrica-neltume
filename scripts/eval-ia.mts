// `npm run eval:ia [-- --modelo <id>] [--proveedor commandcode|doble]`: evalúa el intérprete con el set de AI.md §6.
// Usa el mismo camino que el worker (normalizar → redactar → intérprete → mapeo determinista) contra el catálogo de
// la BD (Excel importado). Llama al proveedor real: tiene costo. Escribe eval/informes/<fecha>-<modelo>.{md,json}.
// El informe no incluye el texto de los pedidos ni precios: solo códigos, estados, latencia y costo.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { crearInterprete } from "../src/ai";
import { type Caso, evaluarCaso, type Obtenido, type ResultadoCaso, resumir } from "../src/ai/evaluacion";
import type { InterpreteIA } from "../src/ai/interfaz";
import { normalizarPedido, redactar } from "../src/ai/redaccion";
import { interpretarConReintentos } from "../src/ai/reintentos";
import { bd, cerrarBd } from "../src/db/conexion";
import { cargarCatalogoMapeo, catalogoResumido } from "../src/domain/cotizaciones/catalogo";
import { mapearItem } from "../src/domain/cotizaciones/mapear";

const { values } = parseArgs({ options: { modelo: { type: "string" }, proveedor: { type: "string" } } });
if (values.modelo) process.env.CMD_MODEL = values.modelo;
if (values.proveedor) process.env.LLM_PROVEEDOR = values.proveedor;

const pct = (n: number) => `${Math.round(n * 100)} %`;
const valor = (nombre: string, v: number) => (nombre.startsWith("Latencia") ? `${(v / 1000).toFixed(1).replace(".", ",")} s` : nombre.startsWith("Costo") ? `US$ ${v.toFixed(4)}` : pct(v));

try {
  const { casos } = JSON.parse(readFileSync("eval/casos.json", "utf8")) as { casos: Caso[] };
  const base = crearInterprete();
  let peticion = "";
  // Registra lo que realmente recibe el proveedor, para verificar que no viajan datos personales.
  const ia: InterpreteIA = { nombre: base.nombre, interpretar: (t, c) => { peticion = t; return base.interpretar(t, c); } };
  const [resumido, catalogo] = await Promise.all([catalogoResumido(bd()), cargarCatalogoMapeo(bd())]);
  if (!catalogo.articulos.size) throw new Error("No hay catálogo: importa el Excel (npm run demo:preparar).");
  const modelo = process.env.CMD_MODEL ?? base.nombre;
  console.log(`Evaluando ${casos.length} casos con ${base.nombre} · ${modelo}\n`);

  const resultados: ResultadoCaso[] = [];
  const propuestas: Record<number, unknown> = {}; // salida cruda de la IA, para diagnosticar (solo en el .json)
  for (const c of casos) {
    const inicio = Date.now();
    peticion = "";
    try {
      const r = await interpretarConReintentos(ia, redactar(normalizarPedido(c.pedido)).texto, resumido, {
        alIntentar: (i) => { propuestas[c.id] = i.resultado?.propuesta ?? { error: i.error?.message }; },
      });
      const obtenidos: Obtenido[] = r.propuesta.items.map((p) => {
        const m = mapearItem(p, catalogo);
        return { estado: m.estado, codigo: m.codigo, cantidad: m.cantidad, referencia: m.referencia?.codigo ?? null };
      });
      resultados.push(evaluarCaso(c, { obtenidos, alertas: r.propuesta.alertas, peticion, latenciaMs: Date.now() - inicio, costoUsd: r.costoUsd ?? 0, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida }));
    } catch (e) {
      resultados.push(evaluarCaso(c, { obtenidos: [], alertas: [], peticion, latenciaMs: Date.now() - inicio, costoUsd: 0, error: (e as Error).message.slice(0, 120) }));
    }
    const u = resultados.at(-1)!;
    console.log(`${u.ok ? "✓" : "✗"} ${String(c.id).padStart(2)} ${c.grupo.padEnd(9)} ${(u.latenciaMs / 1000).toFixed(1)} s ${u.motivos.join("; ")}`);
  }

  const conTarifa = Number(process.env.LLM_PRECIO_ENTRADA_USD_MTOK || 0) > 0 && Number(process.env.LLM_PRECIO_SALIDA_USD_MTOK || 0) > 0;
  const { criterios, aprobado, tokensMedios } = resumir(resultados, conTarifa);
  const marca = (c: boolean | null) => (c === null ? "sin tarifa" : c ? "✓" : "✗");
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const nombre = `eval/informes/${fecha}-${modelo.replace(/[^\w.-]+/g, "_")}`;
  const md = [
    `# Evaluación del intérprete · ${modelo}`, "",
    `Fecha ${fecha.split("-").reverse().join("-")} · proveedor ${base.nombre} · ${casos.length} casos de AI.md §6 · **${aprobado ? "APROBADO" : "NO APROBADO"}**`, "",
    `Tokens medios por pedido: ${tokensMedios.entrada} de entrada y ${tokensMedios.salida} de salida.${conTarifa ? "" : " Sin tarifas (LLM_PRECIO_*): el costo se calcula con estos tokens y la tarifa del modelo."}`, "",
    "| Criterio | Resultado | Meta | |", "|---|---|---|---|",
    ...criterios.map((k) => `| ${k.nombre} | ${valor(k.nombre, k.valor)} | ${k.meta} | ${marca(k.cumple)} |`), "",
    "| # | Grupo | Resultado | Obtenido | Latencia | Costo US$ | Motivo |", "|---|---|---|---|---|---|---|",
    ...resultados.map((r) => `| ${r.id} | ${r.grupo} | ${r.ok ? "✓" : "✗"} | ${r.obtenidos.map((o) => `${o.codigo ?? o.referencia ?? "—"} ×${o.cantidad} ${o.estado}`).join("<br>") || "—"} | ${(r.latenciaMs / 1000).toFixed(1)} s | ${r.costoUsd.toFixed(4).replace(".", ",")} | ${r.motivos.join("; ")} |`),
    "",
  ].join("\n");
  writeFileSync(`${nombre}.md`, md);
  writeFileSync(`${nombre}.json`, JSON.stringify({ modelo, proveedor: base.nombre, fecha, criterios, aprobado, tokensMedios, resultados, propuestas }, null, 1));
  console.log(`Tokens medios: ${tokensMedios.entrada} entrada / ${tokensMedios.salida} salida`);
  console.log(`\n${criterios.map((k) => `${marca(k.cumple)} ${k.nombre}: ${valor(k.nombre, k.valor)} (meta ${k.meta})`).join("\n")}`);
  console.log(`\n${aprobado ? "APROBADO" : "NO APROBADO"} · informe en ${nombre}.md`);
  process.exitCode = aprobado ? 0 : 1;
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 2;
} finally {
  await cerrarBd();
}
