import { describe, expect, it } from "vitest";
import type { ItemPropuesto } from "@/ai/esquema";
import { anclarItems, anclarPropuesta, cantidadesDichas, cifras, pedidosSinRegistrar } from "./anclaje";

const puerta = (p: Partial<ItemPropuesto>): ItemPropuesto => ({
  texto_fuente: "3 Neltume raulí 90x210", tipo: "puerta", modelo: "NELTUME", madera: "RAULI", ancho_m: 0.9, alto_m: 2.1, medida_accesorio: null, cantidad: 3, dudas: [], ...p,
});
const MODELOS = ["NELTUME", "LICAN", "COZ COZ", "HUILO HUILO", "COSCOS"]; // modelos + alias

describe("verificación de cifras (REQ-COT-2.14)", () => {
  it("lee números y cantidades en palabras, sin confundir medidas con cantidades", () => {
    expect(cifras("90x210 y 2,10 m, 10.000")).toEqual(expect.arrayContaining([90, 210, 2.1, 10000]));
    expect(cantidadesDichas("3 Neltume raulí 90x210")).toEqual([3]);
    expect(cantidadesDichas("tres marcos de 2,10")).toEqual([3]);
    expect(cantidadesDichas("media docena de Lican")).toEqual([6]);
    expect(cantidadesDichas("un par de puertas de 80 por 200")).toEqual([2]);
    expect(cantidadesDichas("guardapolvo 12x1 de 3 m")).toEqual([]);
  });

  it("una cantidad que no está en su frase queda en duda; una dicha o heredada no", () => {
    const msj = "puertas Panguipulli lenga 80x210";
    expect(anclarItems([puerta({ texto_fuente: msj, cantidad: 1, ancho_m: 0.8 })], msj)[0].dudas).toEqual(["La cantidad 1 no aparece en el pedido."]);
    expect(anclarItems([puerta({})], "3 Neltume raulí 90x210")[0].dudas).toEqual([]);
    const conMarco = "2 Fuy oregón 70x200 con su marco 2x4 de 2,10";
    const items = anclarItems([
      puerta({ texto_fuente: "2 Fuy oregón 70x200", cantidad: 2, ancho_m: 0.7, alto_m: 2 }),
      { ...puerta({ texto_fuente: "con su marco 2x4 de 2,10", cantidad: 2, ancho_m: null, alto_m: 2.1 }), tipo: "marco", modelo: null, medida_accesorio: "2x4" },
    ], conMarco);
    expect(items.map((i) => i.dudas)).toEqual([[], []]);
  });

  it("una medida o escuadría inventada queda en duda; en cm o mm se reconoce", () => {
    expect(anclarItems([puerta({ alto_m: 2.2 })], "3 Neltume raulí 90x210")[0].dudas).toEqual(["El alto 2,2 m no aparece en el pedido."]);
    expect(anclarItems([puerta({ texto_fuente: "3 Neltume raulí 900 x 2100 mm" })], "3 Neltume raulí 900 x 2100 mm")[0].dudas).toEqual([]);
    const marco = { ...puerta({ texto_fuente: "3 marcos de raulí", ancho_m: null, alto_m: null }), tipo: "marco" as const, medida_accesorio: "2x6" };
    expect(anclarItems([marco], "3 marcos de raulí")[0].dudas).toEqual(["La medida «2x6» no aparece en el pedido."]);
  });

  it("si la frase no está literal en el pedido (parafraseada), no se exige la cantidad en ella", () => {
    expect(anclarItems([puerta({ texto_fuente: "tres puertas neltume" })], "Necesito 3 Neltume raulí 90x210")[0].dudas).toEqual([]);
  });
});

describe("cobertura del pedido (REQ-COT-2.14)", () => {
  it("lo que pide el mensaje y la IA omitió queda como alerta", () => {
    const msj = "Necesito 2 Neltume raulí 90x210 y 3 Lican lenga 80x210. Gracias, saludos";
    expect(pedidosSinRegistrar(msj, ["2 Neltume raulí 90x210"], MODELOS)).toEqual(["3 Lican lenga 80x210"]);
    expect(pedidosSinRegistrar(msj, ["2 Neltume raulí 90x210", "3 Lican lenga 80x210"], MODELOS)).toEqual([]);
    expect(pedidosSinRegistrar("Despacho a Temuco, dirección Av. Alemania 123", [], MODELOS)).toEqual([]);
  });

  it("anclarPropuesta junta ambas cosas", () => {
    const r = anclarPropuesta({ items: [puerta({ texto_fuente: "2 Neltume raulí 90x210", cantidad: 2 })], alertas: [], sin_items: false }, "2 Neltume raulí 90x210; 4 coscos de 80 por 200", MODELOS);
    expect(r.alertas).toEqual(["No registré: «4 coscos de 80 por 200». Agrégalo a mano si corresponde."]);
  });
});
