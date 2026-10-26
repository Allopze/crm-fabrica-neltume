import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dibujoDe, dibujosDelCatalogo, GENERICO, imagenDelDibujo, medidaPedida, normalizarModelo } from "./dibujos";

const puerta = (modelo: string | null, descripcion = "x", medida: { ancho: number; alto: number } | null = null) => ({ modelo, familia: modelo ? ("puerta" as const) : null, descripcion, medida });

describe("pdf.dibujos (REQ-COT-4.9; ADR-0025 D12)", () => {
  it("cada dibujo del manifiesto existe, es un PNG y mide lo que dice; el marco no tiene hoja", () => {
    const todos = [...dibujosDelCatalogo().values()];
    expect(todos.length).toBeGreaterThanOrEqual(35);
    for (const d of todos) {
      const png = imagenDelDibujo(d);
      expect(png.subarray(1, 4).toString(), d.archivo).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], d.archivo).toEqual(d.px);
    }
    expect(dibujosDelCatalogo().get("MARCO")!.hoja).toBeNull();
    expect(JSON.parse(readFileSync("public/marca/dibujos/dibujos.json", "utf8"))).toHaveProperty("MOLCO");
  });

  it("el modelo se normaliza sin tildes ni espacios, como en la tienda", () => {
    expect(normalizarModelo("Toltén")).toBe("TOLTEN");
    expect(normalizarModelo("Chan Chan")).toBe("CHANCHAN");
    expect(normalizarModelo("PUÑIR")).toBe("PUNIR");
    expect(dibujoDe(puerta("Huilo Huilo"))!.archivo).toBe("huilo-huilo.png");
  });

  it("una puerta usa el dibujo de su modelo o, si no tiene, el esquema genérico; el marco, el suyo; lo demás, ninguno", () => {
    expect(dibujoDe(puerta("MOLCO"))!.archivo).toBe("molco.png");
    expect(dibujoDe(puerta("MODELO NUEVO SIN DIBUJO"))).toBe(GENERICO);
    expect(dibujoDe({ modelo: "MARCO", familia: "accesorio", descripcion: "Marco", medida: null })!.archivo).toBe("marco.png");
    expect(dibujoDe({ modelo: "ENDOLADO", familia: "accesorio", descripcion: "Endolado", medida: null })).toBeNull();
  });

  it("una línea «a pedido» sin artículo toma el modelo de su descripción, o es una puerta genérica si trae medida, o no lleva dibujo", () => {
    expect(dibujoDe(puerta(null, "Toltén · Raulí · 0,87 × 2,15 m"))!.archivo).toBe("tolten.png");
    expect(dibujoDe(puerta(null, "Puerta según diseño cliente · Roble", { ancho: 900, alto: 2100 }))).toBe(GENERICO);
    expect(dibujoDe(puerta(null, "Accesorio especial"))).toBeNull();
  });

  it("la medida pedida sale del texto de la línea, en mm", () => {
    expect(medidaPedida("820 × 2000 mm (Hoja)")).toEqual({ ancho: 820, alto: 2000 });
    expect(medidaPedida("830 × 2360 mm, vano")).toEqual({ ancho: 830, alto: 2360 });
    expect(medidaPedida("2x4 pulg. × 2,10 m")).toBeNull();
    expect(medidaPedida(null)).toBeNull();
  });
});
