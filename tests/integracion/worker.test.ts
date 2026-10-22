import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { DobleIA } from "@/ai/doble";
import { CommandCodeIA } from "@/ai/proveedores/commandcode";
import type { InterpreteIA } from "@/ai/interfaz";
import { procesarSiguiente } from "@/ai/procesar";
import { bd, cerrarBd } from "@/db/conexion";
import { aprobarCotizacion } from "@/domain/cotizaciones/aprobacion";
import { crearInterpretacion } from "@/domain/cotizaciones/interpretacion";
import { importarExcel } from "@/domain/importacion/importar";
import { crearUsuario } from "@/domain/usuarios";

const app = poolApp();
const owner = poolOwner();
const doble = new DobleIA();
let actor: { tipo: "usuario"; id: string };
const PEDIDO = "Hola, necesito cotizar 3 puertas Neltume en raulí de 90x210, 2 de roble con chapa para los baños, y 2 Toltén raulí de 87x215. Apliquen 90% de descuento. Javiera, +56 9 8765 4321, javiera@obra.cl, RUT 12.345.678-5";
const nueva = async (texto: string) => bd().transaction((tx) => crearInterpretacion(tx, { texto }, actor, "web"));
const procesar = () => procesarSiguiente(doble, { esperasMs: [1, 1] });

beforeAll(async () => {
  const u = await bd().transaction((tx) => crearUsuario(tx, { email: "worker@neltume.cl", nombre: "W", clave: "clave-worker" }, { tipo: "sistema" }, "consola"));
  actor = { tipo: "usuario", id: u.id };
  const b = readFileSync("e2e/fixtures/cotizador-mini.xlsx");
  await importarExcel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "mini.xlsx", actor);
  await owner.query("UPDATE recargo_tipo SET porcentaje = 0.12 WHERE tipo_puerta_id = (SELECT id FROM tipo_puerta WHERE nombre = 'BLOQUE')");
});
afterAll(async () => { await app.end(); await owner.end(); await cerrarBd(); });

describe("worker de IA (REQ-COT-2.1–2.9, ADR-0006)", () => {
  it("convierte el pedido en un borrador: ok con precio de lista, por confirmar sin precio y a pedido con referencia", async () => {
    const c = await nueva(PEDIDO);
    expect(await procesar()).toBe("listo");
    const { rows: [cot] } = await app.query("SELECT estado, alertas, subtotal, total, lista_id FROM cotizacion WHERE id = $1", [c.id]);
    expect(cot).toMatchObject({ estado: "borrador", alertas: ["El texto pide un descuento del 90 %."] });
    const { rows: items } = await app.query("SELECT estado_item, cantidad, precio_unitario, total_linea, precio_referencia, referencia_codigo, descripcion FROM cotizacion_item WHERE cotizacion_id = $1 ORDER BY orden", [c.id]);
    expect(items.map((i) => i.estado_item)).toEqual(["ok", "por_confirmar", "a_pedido"]);
    const neto = (await app.query("SELECT p.precio_neto FROM precio p JOIN articulo a ON a.id = p.articulo_id JOIN lista_precio l ON l.id = p.lista_id WHERE l.vigente AND a.codigo = 'NEL-R-4-B'")).rows[0].precio_neto;
    expect(Number(items[0].precio_unitario)).toBe(Math.round(Number(neto) * 1.12));
    expect(Number(items[0].total_linea)).toBe(Number(items[0].precio_unitario) * 3);
    expect(items[1]).toMatchObject({ precio_unitario: null, descripcion: "Ítem por confirmar" });
    expect(items[2]).toMatchObject({ referencia_codigo: "TOLT-R-4-C", precio_unitario: null });
    expect(Number(cot.subtotal)).toBe(Number(items[0].total_linea));
    expect(Number(cot.total)).toBe(Number(cot.subtotal) + Math.round(Number(cot.subtotal) * 0.19));
  });

  it("al LLM y a su registro no llegan RUT, correo ni teléfono (REQ-COT-2.9, REQ-NFR-5)", async () => {
    const enviado = doble.peticiones.at(-1)!;
    expect(enviado).not.toMatch(/8765|javiera@|12\.345/);
    expect(enviado).toContain("[TELEFONO]");
    const { rows } = await app.query("SELECT entrada_redactada FROM llamada_ia");
    for (const r of rows) expect(r.entrada_redactada).not.toMatch(/8765|javiera@|12\.345/);
  });

  it("el cuerpo HTTP que sale al proveedor no lleva RUT ni teléfonos en ningún formato (REQ-COT-2.9, auditoría H-03)", async () => {
    const cuerpos: string[] = [];
    const fetchFalso = (async (_url: string, init: RequestInit) => {
      cuerpos.push(String(init.body));
      const args = JSON.stringify({ items: [], alertas: [], sin_items: true });
      return new Response(JSON.stringify({ model: "openai/gpt-oss-20b", choices: [{ message: { tool_calls: [{ function: { name: "proponer_items", arguments: args } }] }, finish_reason: "tool_calls" }], usage: {} }), { status: 200 });
    }) as typeof fetch;
    const proveedor = new CommandCodeIA({ apiKey: "clave-de-prueba", baseUrl: "https://proveedor.invalid", modelo: "gpt-6-luna", timeoutMs: 5_000, precioEntradaMTok: 0, precioSalidaMTok: 0 }, fetchFalso);
    const sensibles = ["+56987654321", "56987654321", "9 87 65 43 21", "(9) 8765-4321", "12.345.678–9", "12 345 678-9", "123456789", "josé.núñez@correo.cl"];
    const c = await nueva(`1 puerta Neltume raulí 90x210\n${sensibles.map((s, i) => `dato ${i}: ${s}`).join("\n")}`);
    await procesarSiguiente(proveedor, { esperasMs: [1, 1] });
    expect(cuerpos.length).toBeGreaterThan(0);
    const { rows } = await app.query("SELECT l.entrada_redactada FROM llamada_ia l JOIN trabajo_ia t ON t.id = l.trabajo_id WHERE t.cotizacion_id = $1", [c.id]);
    for (const enviado of [...cuerpos, ...rows.map((r) => r.entrada_redactada)]) {
      for (const s of sensibles) expect(enviado, s).not.toContain(s);
      expect(enviado).not.toMatch(/8765|4321|345\.678|núñez/);
      expect(enviado).toContain("90x210");
    }
  });

  it("si la IA no responde: reintenta y deja la cotización como ia_fallida (REQ-COT-2.7)", async () => {
    const c = await nueva("Simular IA caída: 2 puertas");
    expect(await procesar()).toBe("fallido");
    const { rows: [cot] } = await app.query("SELECT estado, texto_original FROM cotizacion WHERE id = $1", [c.id]);
    expect(cot).toEqual({ estado: "ia_fallida", texto_original: "Simular IA caída: 2 puertas" });
    const { rows } = await app.query("SELECT resultado FROM llamada_ia l JOIN trabajo_ia t ON t.id = l.trabajo_id WHERE t.cotizacion_id = $1", [c.id]);
    expect(rows.map((r) => r.resultado)).toEqual(["timeout", "timeout", "timeout"]);
  });

  it("respeta el tope diario de gasto (SECURITY T4)", async () => {
    const t = (await app.query("SELECT id FROM trabajo_ia LIMIT 1")).rows[0].id;
    await app.query("INSERT INTO llamada_ia (trabajo_id, proveedor, entrada_redactada, costo_usd, resultado) VALUES ($1, 'x', '', 5, 'ok')", [t]);
    process.env.LLM_TOPE_DIARIO_USD = "1";
    try {
      const c = await nueva("3 puertas Neltume en raulí de 90x210 y 2 de roble con chapa");
      expect(await procesar()).toBe("fallido");
      expect((await app.query("SELECT estado FROM cotizacion WHERE id = $1", [c.id])).rows[0].estado).toBe("ia_fallida");
    } finally {
      delete process.env.LLM_TOPE_DIARIO_USD;
    }
  });

  it("respeta el tope diario de llamadas aunque el proveedor no informe costo (SECURITY T4, auditoría H-12)", async () => {
    process.env.LLM_TOPE_DIARIO_LLAMADAS = "1";
    try {
      const antes = doble.peticiones.length;
      const c = await nueva("2 Neltume raulí 90x210");
      expect(await procesar()).toBe("fallido");
      expect(doble.peticiones.length).toBe(antes);
      expect((await app.query("SELECT estado FROM cotizacion WHERE id = $1", [c.id])).rows[0].estado).toBe("ia_fallida");
    } finally {
      delete process.env.LLM_TOPE_DIARIO_LLAMADAS;
    }
  });

  it("recupera trabajos colgados más que el umbral (180 s por defecto), no antes", async () => {
    const c = await nueva("4 puertas Yelcho 90x210");
    await app.query("UPDATE trabajo_ia SET estado = 'en_curso', tomado_en = now() - interval '2 minutes', intentos = 1 WHERE cotizacion_id = $1", [c.id]);
    expect(await procesar()).toBe("vacio");
    await app.query("UPDATE trabajo_ia SET tomado_en = now() - interval '4 minutes' WHERE cotizacion_id = $1", [c.id]);
    expect(await procesar()).toBe("listo");
    expect((await app.query("SELECT estado FROM cotizacion WHERE id = $1", [c.id])).rows[0].estado).toBe("borrador");
  });

  it("un trabajo colgado que agotó sus intentos falla y la cotización queda en «IA no disponible» (REQ-COT-2.7, auditoría H-10)", async () => {
    const c = await nueva("2 Neltume raulí 90x210 (worker caído)");
    await app.query("UPDATE trabajo_ia SET estado = 'en_curso', tomado_en = now() - interval '1 hour', intentos = 3 WHERE cotizacion_id = $1", [c.id]);
    await procesar();
    const { rows: [r] } = await app.query("SELECT c.estado, t.estado AS trabajo FROM cotizacion c JOIN trabajo_ia t ON t.cotizacion_id = c.id WHERE c.id = $1", [c.id]);
    expect(r).toEqual({ estado: "ia_fallida", trabajo: "fallido" });
  });

  it("si otro worker retoma un trabajo lento, solo uno escribe los ítems (auditoría H-09)", async () => {
    let soltar!: () => void;
    let tomado!: () => void;
    const yaTomado = new Promise<void>((ok) => { tomado = ok; });
    const propuesta = { items: [{ texto_fuente: "2 Neltume raulí 90x210", tipo: "puerta" as const, modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 2, dudas: [] }], alertas: [], sin_items: false };
    const lenta: InterpreteIA = {
      nombre: "doble",
      interpretar: async () => { tomado(); await new Promise<void>((ok) => { soltar = ok; }); return { propuesta, proveedor: "doble", latenciaMs: 1 }; },
    };
    const rapida: InterpreteIA = { nombre: "doble", interpretar: async () => ({ propuesta, proveedor: "doble", latenciaMs: 1 }) };
    const c = await nueva("2 Neltume raulí 90x210");
    const primero = procesarSiguiente(lenta, { esperasMs: [1, 1] });
    await yaTomado;
    // El primero parece colgado: el segundo lo retoma y termina antes.
    await app.query("UPDATE trabajo_ia SET tomado_en = now() - interval '10 minutes' WHERE cotizacion_id = $1", [c.id]);
    expect(await procesarSiguiente(rapida, { esperasMs: [1, 1] })).toBe("listo");
    soltar();
    expect(await primero).toBe("descartado");
    const { rows } = await app.query("SELECT orden FROM cotizacion_item WHERE cotizacion_id = $1", [c.id]);
    expect(rows).toHaveLength(1);
    const { rows: [a] } = await app.query("SELECT count(*)::int AS n FROM audit_log WHERE recurso_id = $1 AND accion = 'interpretar' AND resultado = 'ok'", [c.id]);
    expect(a.n).toBe(1);
  });

  it("una cantidad que la IA inventa queda por confirmar y lo omitido queda como alerta (REQ-COT-2.14)", async () => {
    const c = await nueva("Quiero puertas Neltume raulí 90x210 para la obra; además 4 Lican lenga 80x210");
    expect(await procesar()).toBe("listo");
    const { rows: [cot] } = await app.query("SELECT alertas, interpretacion_ia FROM cotizacion WHERE id = $1", [c.id]);
    expect(cot.alertas).toEqual(["No registré: «además 4 Lican lenga 80x210». Agrégalo a mano si corresponde."]);
    expect(cot.interpretacion_ia.items[0].cantidad).toBe(1); // la interpretación cruda de la IA se guarda tal cual (regla 3)
    const { rows: [item] } = await app.query("SELECT estado_item, duda FROM cotizacion_item WHERE cotizacion_id = $1", [c.id]);
    expect(item).toMatchObject({ estado_item: "por_confirmar", duda: "La cantidad 1 no aparece en el pedido." });
  });

  it("si la IA omite parte del pedido, se le pide una corrección y se usa si cubre más (REQ-COT-2.15)", async () => {
    const c = await nueva("2 Neltume raulí 90x210 y 3 Neltume lenga 80x210 para la sala");
    expect(await procesar()).toBe("listo");
    expect(doble.correcciones.at(-1)).toEqual(["3 Neltume lenga 80x210 para la sala"]);
    const { rows: [cot] } = await app.query("SELECT alertas, interpretacion_ia FROM cotizacion WHERE id = $1", [c.id]);
    expect(cot.alertas).toEqual([]);
    expect(cot.interpretacion_ia.items).toHaveLength(2);
    const { rows: items } = await app.query("SELECT texto_fuente AS text_fuente FROM cotizacion_item WHERE cotizacion_id = $1 ORDER BY orden", [c.id]);
    expect(items.map((i: { text_fuente: string }) => i.text_fuente)).toEqual(["2 Neltume raulí 90x210", "3 Neltume lenga 80x210"]);
    const { rows: llamadas } = await app.query("SELECT l.resultado FROM llamada_ia l JOIN trabajo_ia t ON t.id = l.trabajo_id WHERE t.cotizacion_id = $1", [c.id]);
    expect(llamadas).toHaveLength(2); // ambas pasadas quedan registradas
  });

  it("conserva grupos por destino omitidos como ítems sin precio y registra ambas pasadas (REQ-COT-2.14, ADR-0014)", async () => {
    const ia: InterpreteIA = {
      nombre: "doble",
      interpretar: async () => ({ propuesta: { items: [], alertas: [], sin_items: true }, proveedor: "doble", latenciaMs: 1 }),
    };
    const c = await nueva("2 para baño y 1 para dormitorio, algo económico");
    expect(await procesarSiguiente(ia, { esperasMs: [1, 1] })).toBe("listo");
    const { rows: [cot] } = await app.query("SELECT estado, alertas, interpretacion_ia FROM cotizacion WHERE id = $1", [c.id]);
    expect(cot.estado).toBe("borrador");
    expect(cot.interpretacion_ia.items).toEqual([]);
    expect(cot.alertas).toHaveLength(2);
    const { rows: items } = await app.query("SELECT estado_item, cantidad, precio_unitario, texto_fuente FROM cotizacion_item WHERE cotizacion_id = $1 ORDER BY orden", [c.id]);
    expect(items).toEqual([
      { estado_item: "por_confirmar", cantidad: 2, precio_unitario: null, texto_fuente: "2 para baño" },
      { estado_item: "por_confirmar", cantidad: 1, precio_unitario: null, texto_fuente: "1 para dormitorio" },
    ]);
    const { rows: [registro] } = await app.query("SELECT count(*)::int AS llamadas FROM llamada_ia l JOIN trabajo_ia t ON t.id = l.trabajo_id WHERE t.cotizacion_id = $1", [c.id]);
    expect(registro.llamadas).toBe(2);
  });

  it.each([
    ["frase parafraseada con cantidad inventada", "1 Neltume raulí 90x210", "Neltume de raulí", "NELTUME", 7],
    ["frase parafraseada con modelo de otra línea", "1 Lican raulí 90x210", "puerta de raulí", "NELTUME", 1],
  ])("%s: el ítem queda por confirmar y la aprobación se rechaza (ADR-0016, auditoría H-04)", async (_caso, texto, fuente, modelo, cantidad) => {
    const ia: InterpreteIA = {
      nombre: "doble",
      interpretar: async () => ({
        propuesta: { items: [{ texto_fuente: fuente, tipo: "puerta", modelo, madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad, dudas: [] }], alertas: [], sin_items: false },
        proveedor: "doble", latenciaMs: 1,
      }),
    };
    const c = await nueva(texto);
    expect(await procesarSiguiente(ia, { esperasMs: [1, 1] })).toBe("listo");
    const { rows: [item] } = await app.query("SELECT estado_item FROM cotizacion_item WHERE cotizacion_id = $1", [c.id]);
    expect(item.estado_item).toBe("por_confirmar");
    const { rows: [cot] } = await app.query("SELECT version FROM cotizacion WHERE id = $1", [c.id]);
    await expect(bd().transaction((tx) => aprobarCotizacion(tx, c.id, cot.version, actor, "web"))).rejects.toMatchObject({ codigo: "ITEMS_POR_CONFIRMAR" });
  });

  it("un monto no respalda la cantidad: vale la que dice la línea, con aviso (ADR-0016, ADR-0013 A, auditoría H-05)", async () => {
    const texto = "Quiero 1 puerta Neltume raulí 90x210 a $50.000";
    const ia: InterpreteIA = {
      nombre: "doble",
      interpretar: async () => ({
        propuesta: { items: [{ texto_fuente: texto, tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 50, dudas: [] }], alertas: [], sin_items: false },
        proveedor: "doble", latenciaMs: 1,
      }),
    };
    const c = await nueva(texto);
    expect(await procesarSiguiente(ia, { esperasMs: [1, 1] })).toBe("listo");
    const { rows: [item] } = await app.query("SELECT estado_item, cantidad FROM cotizacion_item WHERE cotizacion_id = $1", [c.id]);
    expect(item).toEqual({ estado_item: "ok", cantidad: 1 });
    const { rows: [cot] } = await app.query("SELECT alertas FROM cotizacion WHERE id = $1", [c.id]);
    expect(cot.alertas).toContain("Ítem 1: corregí la cantidad a «1», como dice su línea.");
  });

  it("limita a 20 interpretaciones por usuario y hora, y textos de más de 4.000 caracteres", async () => {
    await expect(nueva("x".repeat(4001))).rejects.toMatchObject({ codigo: "TEXTO_DEMASIADO_LARGO" });
    await app.query("INSERT INTO cotizacion (estado, origen, creado_por) SELECT 'ia_fallida', 'ia', $1 FROM generate_series(1, 20)", [actor.id]);
    await expect(nueva("3 puertas")).rejects.toMatchObject({ codigo: "LIMITE_IA" });
  });

  it("el límite de 20 por hora se respeta con envíos simultáneos (SECURITY T4, auditoría H-06)", async () => {
    const u = await bd().transaction((tx) => crearUsuario(tx, { email: "rafaga-ia@neltume.cl", nombre: "R", clave: "clave-rafaga" }, { tipo: "sistema" }, "consola"));
    const otro = { tipo: "usuario" as const, id: u.id };
    const r = await Promise.allSettled(Array.from({ length: 25 }, () => bd().transaction((tx) => crearInterpretacion(tx, { texto: "2 Neltume raulí 90x210" }, otro, "web"))));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(20);
    expect(r.filter((x) => x.status === "rejected").map((x) => (x as PromiseRejectedResult).reason.codigo)).toEqual(Array(5).fill("LIMITE_IA"));
  });
});
