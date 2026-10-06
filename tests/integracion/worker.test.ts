import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolApp, poolOwner } from "./bd";
import { DobleIA } from "@/ai/doble";
import { procesarSiguiente } from "@/ai/procesar";
import { bd, cerrarBd } from "@/db/conexion";
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

  it("recupera trabajos colgados más de 60 s", async () => {
    const c = await nueva("4 puertas Yelcho 90x210");
    await app.query("UPDATE trabajo_ia SET estado = 'en_curso', tomado_en = now() - interval '2 minutes', intentos = 1 WHERE cotizacion_id = $1", [c.id]);
    expect(await procesar()).toBe("listo");
    expect((await app.query("SELECT estado FROM cotizacion WHERE id = $1", [c.id])).rows[0].estado).toBe("borrador");
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

  it("limita a 20 interpretaciones por usuario y hora, y textos de más de 4.000 caracteres", async () => {
    await expect(nueva("x".repeat(4001))).rejects.toMatchObject({ codigo: "TEXTO_DEMASIADO_LARGO" });
    await app.query("INSERT INTO cotizacion (estado, origen, creado_por) SELECT 'ia_fallida', 'ia', $1 FROM generate_series(1, 20)", [actor.id]);
    await expect(nueva("3 puertas")).rejects.toMatchObject({ codigo: "LIMITE_IA" });
  });
});
