// `npm run eval:ia` permite elegir proveedor y modelo; los flags permiten automatizar la selección.
// Evalúa el intérprete con AI.md §6 contra el catálogo importado. Usa APIs reales, por lo que puede tener costo.
// Escribe eval/informes/<fecha>-<modelo>.{md,json}; no imprime ni guarda claves de proveedor.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { generarCasos } from "../src/ai/casos-generados";
import { CommandCodeIA, baseDeApi } from "../src/ai/proveedores/commandcode";
import { GroqIA } from "../src/ai/proveedores/groq";
import { ordenarPorCostoEstimado } from "../src/ai/costo-estimado";
import { renderizarTablaCLI } from "../src/ai/tabla-cli";
import { type Caso, evaluarCaso, type Obtenido, type ResultadoCaso, resumir } from "../src/ai/evaluacion";
import type { InterpreteIA } from "../src/ai/interfaz";
import { apiKeyDesdeEntorno, leerCatalogo, leerConfiguracionPrivada, type CatalogoIA, type ConfiguracionPrivadaIA, type ModeloIA, type ProveedorConfigurado } from "../src/ai/ajustes";
import { normalizarPedido, redactar } from "../src/ai/redaccion";
import { promptSistema } from "../src/ai/prompt";
import { interpretarRevisado } from "../src/ai/revision";
import { bd, cerrarBd } from "../src/db/conexion";
import { cargarCatalogoMapeo, catalogoResumido } from "../src/domain/cotizaciones/catalogo";
import { alertaNotaIa, mapearConDudasIa } from "../src/domain/cotizaciones/mapear";

// --generados N [--semilla S]: en vez de eval/casos.json, N pedidos generados desde el catálogo (src/ai/casos-generados.ts).
const { values } = parseArgs({ options: { modelo: { type: "string" }, proveedor: { type: "string" }, generados: { type: "string" }, semilla: { type: "string" }, ids: { type: "string" } } });
const terminal = stdin.isTTY && stdout.isTTY ? createInterface({ input: stdin, output: stdout }) : null;
const OPCIONES_PROVEEDOR: { id: ProveedorConfigurado; nombre: string }[] = [
  { id: "commandcode", nombre: "Command Code" }, { id: "groq", nombre: "Groq" },
];

const pct = (n: number) => `${Math.round(n * 100)} %`;
const valor = (nombre: string, v: number) => (nombre.startsWith("Latencia") ? `${(v / 1000).toFixed(1).replace(".", ",")} s` : nombre.startsWith("Costo") ? `US$ ${v.toFixed(4).replace(".", ",")}` : pct(v));
async function preguntar(texto: string) {
  if (!terminal) throw new Error("Usa una terminal interactiva o indica --proveedor y --modelo en la línea de comandos.");
  return (await terminal.question(texto)).trim();
}

async function seleccionarProveedor(argumento?: string): Promise<ProveedorConfigurado> {
  let respuesta = argumento?.trim().toLowerCase();
  if (!respuesta) {
    console.log("\nProveedor para la evaluación:\n  1. CommandCode\n  2. Groq");
    respuesta = (await preguntar("Elige proveedor [1-2]: ")).toLowerCase();
  }
  if (respuesta === "1") return "commandcode";
  if (respuesta === "2") return "groq";
  if (OPCIONES_PROVEEDOR.some((p) => p.id === respuesta)) return respuesta as ProveedorConfigurado;
  throw new Error("Proveedor inválido. Elige 1 (Command Code) o 2 (Groq), o usa --proveedor commandcode|groq.");
}

function modelosEvaluables(proveedor: ProveedorConfigurado, catalogo: CatalogoIA, config: ConfiguracionPrivadaIA): ModeloIA[] {
  const modelos = [...catalogo.modelos];
  // Una configuración migrada puede no estar todavía en el caché recién creado del catálogo.
  if (config.proveedor === proveedor && config.modelo && !modelos.some((m) => m.id === config.modelo)) {
    modelos.push({ id: config.modelo, nombre: config.modelo, compatible: true, preview: false });
  }
  return modelos;
}

const numeroTabla = (n: number | undefined) => n === undefined ? "—" : n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

async function seleccionarModelo(proveedor: ProveedorConfigurado, catalogo: CatalogoIA, config: ConfiguracionPrivadaIA, argumento?: string) {
  const todos = modelosEvaluables(proveedor, catalogo, config);
  const elegibles = todos.filter((m) => m.compatible && !m.preview);
  const habilitados = proveedor === "commandcode"
    ? ordenarPorCostoEstimado(elegibles)
    : [...elegibles].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (catalogo.actualizadoEn) {
    const fecha = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short" }).format(new Date(catalogo.actualizadoEn));
    console.log(`\nModelos ${proveedor} · catálogo consultado ${fecha}`);
  } else {
    console.log(`\nModelos ${proveedor} · catálogo sin fecha de actualización`);
  }
  if (proveedor === "commandcode") {
    console.log("Ordenados por costo estimado, de menor a mayor. Tarifas en US$/millón de tokens; costo estimado con 4.000 tokens de entrada + 400 de salida.\n");
  } else {
    console.log("Límites Free publicados como referencia; las cuotas exactas se consultan en Groq Console.\n");
  }
  if (!habilitados.length) {
    const bloqueados = todos.map((m) => `  · ${m.nombre}: ${m.motivo ?? "no compatible"}`).join("\n");
    throw new Error(`No hay modelos compatibles en el catálogo. Inicia el worker para actualizarlo.${bloqueados ? `\n${bloqueados}` : ""}`);
  }
  const columnas = proveedor === "commandcode"
    ? [
      { titulo: "#", alineacion: "derecha" as const }, { titulo: "Modelo (ID)" },
      { titulo: "Entrada US$/M", alineacion: "derecha" as const }, { titulo: "Salida US$/M", alineacion: "derecha" as const },
      { titulo: "Est. US$/llamada", alineacion: "derecha" as const },
    ]
    : [
      { titulo: "#", alineacion: "derecha" as const }, { titulo: "Modelo (ID)" },
      { titulo: "RPM", alineacion: "derecha" as const }, { titulo: "RPD", alineacion: "derecha" as const },
      { titulo: "TPM", alineacion: "derecha" as const }, { titulo: "TPD", alineacion: "derecha" as const },
    ];
  const filas = habilitados.map((m, i) => {
    const activo = config.proveedor === proveedor && config.modelo === m.id ? "✓ " : "";
    const modelo = `${activo}${m.nombre} (${m.id})`;
    if (proveedor === "commandcode") {
      const estimado = m.precioEntradaUsdMTok === undefined || m.precioSalidaUsdMTok === undefined
        ? "—"
        : numeroTabla((m.precioEntradaUsdMTok * 4_000 + m.precioSalidaUsdMTok * 400) / 1_000_000);
      return [String(i + 1), modelo, numeroTabla(m.precioEntradaUsdMTok), numeroTabla(m.precioSalidaUsdMTok), estimado];
    }
    return [String(i + 1), modelo, m.limites?.rpm ?? "—", m.limites?.rpd ?? "—", m.limites?.tpm ?? "—", m.limites?.tpd ?? "—"];
  });
  console.log(renderizarTablaCLI(columnas, filas));
  if (habilitados.some((m) => config.proveedor === proveedor && config.modelo === m.id)) console.log("\n✓ Modelo activo en Ajustes.");
  const bloqueados = todos.filter((m) => !m.compatible || m.preview);
  if (bloqueados.length) {
    console.log("\nModelos no seleccionables:");
    console.log(renderizarTablaCLI(
      [{ titulo: "Modelo (ID)" }, { titulo: "Motivo" }],
      bloqueados.map((m) => [`${m.nombre} (${m.id})`, m.motivo ?? "no compatible"]),
    ));
  }

  const respuesta = argumento?.trim() || await preguntar(`Elige el número del modelo [1-${habilitados.length}]: `);
  const numero = Number(respuesta);
  const elegido = Number.isInteger(numero) && numero > 0 ? habilitados[numero - 1] : habilitados.find((m) => m.id === respuesta);
  if (!elegido) throw new Error(`Modelo no disponible para ${proveedor}: ${respuesta}. Elige un modelo numerado como compatible.`);
  return elegido;
}

function cargarEntornoWorkerLocal() {
  // npm ejecuta eval con .env.local para la BD. Las claves de proveedores se toman de .env.worker.local.
  delete process.env.CMD_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.CMD_API_BASE_URL;
  delete process.env.GROQ_API_BASE_URL;
  try { process.loadEnvFile(".env.worker.local"); } catch { /* La validación de proveedor explica si falta la clave. */ }
}

function crearInterpreteEvaluacion(proveedor: ProveedorConfigurado, modelo: ModeloIA): InterpreteIA {
  const apiKey = apiKeyDesdeEntorno(proveedor);
  if (!apiKey) throw new Error(`Falta ${proveedor === "groq" ? "GROQ_API_KEY" : "CMD_API_KEY"} en .env.worker.local.`);
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 12_000);
  const maxTokensSalida = Number(process.env.LLM_MAX_TOKENS_SALIDA || 2_000);
  if (proveedor === "groq") {
    return new GroqIA({ apiKey, modelo: modelo.id, timeoutMs, maxTokensSalida, baseUrl: process.env.GROQ_API_BASE_URL });
  }
  return new CommandCodeIA({
    apiKey, modelo: modelo.id, baseUrl: baseDeApi(process.env.CMD_API_BASE_URL), timeoutMs, maxTokensSalida,
    precioEntradaMTok: modelo.precioEntradaUsdMTok ?? 0,
    precioSalidaMTok: modelo.precioSalidaUsdMTok ?? 0,
  });
}

async function main() {
  cargarEntornoWorkerLocal();
  const generados = values.generados ? Number(values.generados) : 0;
  const semilla = Number(values.semilla ?? 1);
  if (values.generados && !(Number.isInteger(generados) && generados > 0 && Number.isInteger(semilla))) throw new Error("--generados y --semilla deben ser enteros positivos.");
  const config = await leerConfiguracionPrivada();
  const proveedor = await seleccionarProveedor(values.proveedor);
  if (!apiKeyDesdeEntorno(proveedor)) throw new Error(`Falta ${proveedor === "groq" ? "GROQ_API_KEY" : "CMD_API_KEY"} en .env.worker.local.`);
  const catalogoProveedor = await leerCatalogo(proveedor);
  const modelo = await seleccionarModelo(proveedor, catalogoProveedor, config, values.modelo);

  const base = crearInterpreteEvaluacion(proveedor, modelo);
  let peticion = "";
  // Registra lo que realmente recibe el proveedor, para verificar que no viajan datos personales.
  const ia: InterpreteIA = { nombre: base.nombre, interpretar: (t, c, o) => { peticion = t; return base.interpretar(t, c, o); } };
  const [resumido, catalogo] = await Promise.all([catalogoResumido(bd()), cargarCatalogoMapeo(bd())]);
  if (!catalogo.articulos.size) throw new Error("No hay catálogo: importa el Excel (npm run demo:preparar).");
  const todosLosCasos: Caso[] = generados ? generarCasos(catalogo, generados, semilla) : (JSON.parse(readFileSync("eval/casos.json", "utf8")) as { casos: Caso[] }).casos;
  const ids = values.ids?.split(",").map(Number);
  if (ids && (!ids.length || ids.some((id) => !Number.isInteger(id) || !todosLosCasos.some((c) => c.id === id)))) throw new Error("--ids requiere identificadores existentes, separados por coma.");
  const casos = ids ? todosLosCasos.filter((c) => ids.includes(c.id)) : todosLosCasos;
  const hash = (valor: string) => createHash("sha256").update(valor).digest("hex").slice(0, 12);
  const promptHash = hash(promptSistema(resumido));
  const casosHash = hash(JSON.stringify(casos));
  const pipelineHash = hash([
    "src/domain/cotizaciones/anclaje.ts", "src/domain/cotizaciones/texto-pedido.ts", "src/domain/cotizaciones/correcciones.ts",
    "src/domain/cotizaciones/mapear.ts", "src/ai/revision.ts", "src/ai/evaluacion.ts",
  ].map((ruta) => readFileSync(ruta, "utf8")).join("\n"));
  const origen = ids ? `muestra de ${casos.length} casos (${ids.join(",")})` : generados ? `${generados} casos generados (semilla ${semilla})` : `${casos.length} casos de AI.md §6`;
  console.log(`\nEvaluando ${casos.length} casos con ${base.nombre} · ${modelo.id}\n`);

  const resultados: ResultadoCaso[] = [];
  const propuestas: Record<number, unknown> = {};
  for (const c of casos) {
    const inicio = Date.now();
    peticion = "";
    try {
      const texto = redactar(normalizarPedido(c.pedido)).texto;
      const { resultado: r, anclada, dudasIa } = await interpretarRevisado(ia, texto, resumido, { modelos: resumido.modelos, alias: resumido.alias ?? [] }, {
        alIntentar: (i) => { propuestas[c.id] = i.resultado?.propuesta ?? { error: i.error?.message }; },
      });
      const notas: string[] = [];
      const obtenidos: Obtenido[] = anclada.items.map((p, k) => {
        const { item: m, nota } = mapearConDudasIa(p, dudasIa[k] ?? [], catalogo);
        if (nota) notas.push(alertaNotaIa(k + 1, nota));
        return { estado: m.estado, codigo: m.codigo, cantidad: m.cantidad, referencia: m.referencia?.codigo ?? null };
      });
      resultados.push(evaluarCaso(c, { obtenidos, alertas: [...anclada.alertas, ...notas], peticion, latenciaMs: Date.now() - inicio, costoUsd: r.costoUsd ?? 0, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida }));
    } catch (e) {
      resultados.push(evaluarCaso(c, { obtenidos: [], alertas: [], peticion, latenciaMs: Date.now() - inicio, costoUsd: 0, error: (e as Error).message.slice(0, 120) }));
    }
    const u = resultados.at(-1)!;
    console.log(`${u.ok ? "✓" : "✗"} ${String(c.id).padStart(2)} ${c.grupo.padEnd(9)} ${(u.latenciaMs / 1000).toFixed(1)} s ${u.motivos.join("; ")}`);
  }

  const modeloCommandCode = proveedor === "commandcode" ? modelo : undefined;
  const conTarifa = proveedor === "commandcode" && modeloCommandCode?.precioEntradaUsdMTok !== undefined && modeloCommandCode?.precioSalidaUsdMTok !== undefined;
  const { criterios, aprobado, tokensMedios } = resumir(resultados, conTarifa);
  const marca = (c: boolean | null) => (c === null ? "sin tarifa" : c ? "✓" : "✗");
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const baseNombre = `eval/informes/${fecha}-${modelo.id.replace(/[^\w.-]+/g, "_")}${generados ? `-gen${generados}-s${semilla}` : ""}${ids ? `-m${casos.length}-${casosHash}` : ""}`;
  let nombre = baseNombre;
  for (let n = 2; existsSync(`${nombre}.json`) || existsSync(`${nombre}.md`); n++) nombre = `${baseNombre}-r${n}`;
  const md = [
    `# Evaluación del intérprete · ${modelo.id}`, "",
    `Fecha ${fecha.split("-").reverse().join("-")} · proveedor ${base.nombre} · ${origen} · **${aprobado ? "APROBADO" : "NO APROBADO"}**`, "",
    `Tokens medios por pedido: ${tokensMedios.entrada} de entrada y ${tokensMedios.salida} de salida.${conTarifa ? "" : proveedor === "groq" ? " Groq no informó costos por llamada; el costo no se evalúa." : " Sin tarifas del modelo: el costo no se evalúa."}`, "",
    `Identificadores de comparación: prompt ${promptHash} · casos ${casosHash} · pipeline ${pipelineHash}.`, "",
    "| Criterio | Resultado | Meta | |", "|---|---|---|---|",
    ...criterios.map((k) => `| ${k.nombre} | ${valor(k.nombre, k.valor)} | ${k.meta} | ${marca(k.cumple)} |`), "",
    "| # | Grupo | Resultado | Obtenido | Latencia | Costo US$ | Motivo |", "|---|---|---|---|---|---|---|",
    ...resultados.map((r) => `| ${r.id} | ${r.grupo} | ${r.ok ? "✓" : "✗"} | ${r.obtenidos.map((o) => `${o.codigo ?? o.referencia ?? "—"} ×${o.cantidad} ${o.estado}`).join("<br>") || "—"} | ${(r.latenciaMs / 1000).toFixed(1)} s | ${r.costoUsd.toFixed(4).replace(".", ",")} | ${r.motivos.join("; ")} |`),
    "",
  ].join("\n");
  writeFileSync(`${nombre}.md`, md);
  writeFileSync(`${nombre}.json`, JSON.stringify({ modelo: modelo.id, proveedor: base.nombre, fecha, promptHash, casosHash, pipelineHash, criterios, aprobado, tokensMedios, resultados, propuestas }, null, 1));
  console.log(`Tokens medios: ${tokensMedios.entrada} entrada / ${tokensMedios.salida} salida`);
  console.log(`\n${criterios.map((k) => `${marca(k.cumple)} ${k.nombre}: ${valor(k.nombre, k.valor)} (meta ${k.meta})`).join("\n")}`);
  console.log(`\n${aprobado ? "APROBADO" : "NO APROBADO"} · informe en ${nombre}.md`);
  process.exitCode = aprobado ? 0 : 1;
}

try {
  await main();
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 2;
} finally {
  terminal?.close();
  await cerrarBd();
}
