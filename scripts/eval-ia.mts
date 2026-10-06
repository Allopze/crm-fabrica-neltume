// `npm run eval:ia` permite elegir proveedor y modelo; los flags permiten automatizar la selección.
// Evalúa el intérprete con AI.md §6 contra el catálogo importado. Usa APIs reales, por lo que puede tener costo.
// Escribe eval/informes/<fecha>-<modelo>.{md,json}; no imprime ni guarda claves de proveedor.
import { readFileSync, writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { CommandCodeIA, baseDeApi } from "../src/ai/proveedores/commandcode";
import { GroqIA } from "../src/ai/proveedores/groq";
import { type Caso, evaluarCaso, type Obtenido, type ResultadoCaso, resumir } from "../src/ai/evaluacion";
import type { InterpreteIA } from "../src/ai/interfaz";
import { apiKeyDesdeEntorno, leerCatalogo, leerConfiguracionPrivada, type CatalogoIA, type ConfiguracionPrivadaIA, type ModeloIA, type ProveedorConfigurado } from "../src/ai/ajustes";
import { normalizarPedido, redactar } from "../src/ai/redaccion";
import { interpretarRevisado } from "../src/ai/revision";
import { bd, cerrarBd } from "../src/db/conexion";
import { cargarCatalogoMapeo, catalogoResumido } from "../src/domain/cotizaciones/catalogo";
import { mapearItem } from "../src/domain/cotizaciones/mapear";

const { values } = parseArgs({ options: { modelo: { type: "string" }, proveedor: { type: "string" } } });
const terminal = stdin.isTTY && stdout.isTTY ? createInterface({ input: stdin, output: stdout }) : null;
const OPCIONES_PROVEEDOR: { id: ProveedorConfigurado; nombre: string }[] = [
  { id: "commandcode", nombre: "Command Code" }, { id: "groq", nombre: "Groq" },
];

const pct = (n: number) => `${Math.round(n * 100)} %`;
const valor = (nombre: string, v: number) => (nombre.startsWith("Latencia") ? `${(v / 1000).toFixed(1).replace(".", ",")} s` : nombre.startsWith("Costo") ? `US$ ${v.toFixed(4).replace(".", ",")}` : pct(v));
const precioUsd = (n: number) => `US$ ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

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

function detalleModelo(proveedor: ProveedorConfigurado, modelo: ModeloIA) {
  if (proveedor === "commandcode") {
    if (modelo.precioEntradaUsdMTok === undefined || modelo.precioSalidaUsdMTok === undefined) return "tarifa no disponible";
    return `${precioUsd(modelo.precioEntradaUsdMTok)} entrada / ${precioUsd(modelo.precioSalidaUsdMTok)} salida por millón de tokens`;
  }
  const l = modelo.limites;
  if (!l) return "límites Free no disponibles en caché";
  return `Free: ${l.rpm ?? "—"} RPM · ${l.rpd ?? "—"} RPD · ${l.tpm ?? "—"} TPM · ${l.tpd ?? "—"} TPD (referencia pública)`;
}

async function seleccionarModelo(proveedor: ProveedorConfigurado, catalogo: CatalogoIA, config: ConfiguracionPrivadaIA, argumento?: string) {
  const todos = modelosEvaluables(proveedor, catalogo, config);
  const habilitados = todos.filter((m) => m.compatible && !m.preview);
  if (catalogo.actualizadoEn) {
    const fecha = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short" }).format(new Date(catalogo.actualizadoEn));
    console.log(`\nModelos ${proveedor} · catálogo consultado ${fecha}`);
  } else {
    console.log(`\nModelos ${proveedor} · catálogo sin fecha de actualización`);
  }
  if (!habilitados.length) {
    const bloqueados = todos.map((m) => `  · ${m.nombre}: ${m.motivo ?? "no compatible"}`).join("\n");
    throw new Error(`No hay modelos compatibles en el catálogo. Inicia el worker para actualizarlo.${bloqueados ? `\n${bloqueados}` : ""}`);
  }
  habilitados.forEach((m, i) => {
    const activo = config.proveedor === proveedor && config.modelo === m.id ? " · activo en Ajustes" : "";
    console.log(`  ${i + 1}. ${m.nombre} (${m.id}) · ${detalleModelo(proveedor, m)}${activo}`);
  });
  const bloqueados = todos.filter((m) => !m.compatible || m.preview);
  if (bloqueados.length) {
    console.log("Modelos no seleccionables:");
    for (const m of bloqueados) console.log(`  · ${m.nombre} (${m.id}): ${m.motivo ?? "no compatible"}`);
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
  const { casos } = JSON.parse(readFileSync("eval/casos.json", "utf8")) as { casos: Caso[] };
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
  console.log(`\nEvaluando ${casos.length} casos con ${base.nombre} · ${modelo.id}\n`);

  const resultados: ResultadoCaso[] = [];
  const propuestas: Record<number, unknown> = {};
  for (const c of casos) {
    const inicio = Date.now();
    peticion = "";
    try {
      const texto = redactar(normalizarPedido(c.pedido)).texto;
      const { resultado: r, anclada } = await interpretarRevisado(ia, texto, resumido, { modelos: resumido.modelos, alias: resumido.alias ?? [] }, {
        alIntentar: (i) => { propuestas[c.id] = i.resultado?.propuesta ?? { error: i.error?.message }; },
      });
      const obtenidos: Obtenido[] = anclada.items.map((p) => {
        const m = mapearItem(p, catalogo);
        return { estado: m.estado, codigo: m.codigo, cantidad: m.cantidad, referencia: m.referencia?.codigo ?? null };
      });
      resultados.push(evaluarCaso(c, { obtenidos, alertas: anclada.alertas, peticion, latenciaMs: Date.now() - inicio, costoUsd: r.costoUsd ?? 0, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida }));
    } catch (e) {
      resultados.push(evaluarCaso(c, { obtenidos: [], alertas: [], peticion, latenciaMs: Date.now() - inicio, costoUsd: 0, error: (e as Error).message.slice(0, 120) }));
    }
    const u = resultados.at(-1)!;
    console.log(`${u.ok ? "✓" : "✗"} ${String(c.id).padStart(2)} ${c.grupo.padEnd(9)} ${(u.latenciaMs / 1000).toFixed(1)} s ${u.motivos.join("; ")}`);
  }

  const modeloCommandCode = proveedor === "commandcode" ? modelo : undefined;
  const precioEntrada = modeloCommandCode?.precioEntradaUsdMTok ?? 0;
  const precioSalida = modeloCommandCode?.precioSalidaUsdMTok ?? 0;
  const conTarifa = proveedor === "commandcode" && precioEntrada > 0 && precioSalida > 0;
  const { criterios, aprobado, tokensMedios } = resumir(resultados, conTarifa);
  const marca = (c: boolean | null) => (c === null ? "sin tarifa" : c ? "✓" : "✗");
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const nombre = `eval/informes/${fecha}-${modelo.id.replace(/[^\w.-]+/g, "_")}`;
  const md = [
    `# Evaluación del intérprete · ${modelo.id}`, "",
    `Fecha ${fecha.split("-").reverse().join("-")} · proveedor ${base.nombre} · ${casos.length} casos de AI.md §6 · **${aprobado ? "APROBADO" : "NO APROBADO"}**`, "",
    `Tokens medios por pedido: ${tokensMedios.entrada} de entrada y ${tokensMedios.salida} de salida.${conTarifa ? "" : proveedor === "groq" ? " Groq no informó costos por llamada; el costo no se evalúa." : " Sin tarifas del modelo: el costo no se evalúa."}`, "",
    "| Criterio | Resultado | Meta | |", "|---|---|---|---|",
    ...criterios.map((k) => `| ${k.nombre} | ${valor(k.nombre, k.valor)} | ${k.meta} | ${marca(k.cumple)} |`), "",
    "| # | Grupo | Resultado | Obtenido | Latencia | Costo US$ | Motivo |", "|---|---|---|---|---|---|---|",
    ...resultados.map((r) => `| ${r.id} | ${r.grupo} | ${r.ok ? "✓" : "✗"} | ${r.obtenidos.map((o) => `${o.codigo ?? o.referencia ?? "—"} ×${o.cantidad} ${o.estado}`).join("<br>") || "—"} | ${(r.latenciaMs / 1000).toFixed(1)} s | ${r.costoUsd.toFixed(4).replace(".", ",")} | ${r.motivos.join("; ")} |`),
    "",
  ].join("\n");
  writeFileSync(`${nombre}.md`, md);
  writeFileSync(`${nombre}.json`, JSON.stringify({ modelo: modelo.id, proveedor: base.nombre, fecha, criterios, aprobado, tokensMedios, resultados, propuestas }, null, 1));
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
