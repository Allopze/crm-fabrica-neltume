import { describe, expect, it } from "vitest";
import { lineaDeMedida, medidaPedida, metrosExactos } from "./medida";

describe("lib.medida (REQ-COT-2.12, REQ-COT-4.12)", () => {
  it("los metros llevan centímetros por lo menos y milímetros solo si hacen falta", () => {
    expect([0.8, 0.82, 0.822, 0.825, 2, 2.1, 2.155].map(metrosExactos)).toEqual(["0,80", "0,82", "0,822", "0,825", "2,00", "2,10", "2,155"]);
  });

  it("la medida pedida sale del texto de la línea, en mm", () => {
    expect(medidaPedida("820 × 2000 mm (Hoja)")).toEqual({ ancho: 820, alto: 2000 });
    expect(medidaPedida("830 × 2360 mm, vano")).toEqual({ ancho: 830, alto: 2360 });
    expect(medidaPedida("2x4 pulg. × 2,10 m")).toBeNull();
    expect(medidaPedida(null)).toBeNull();
  });

  const exacto = "Molco · Pino Oregón · 0,82 × 2,00 m";
  const rango = "Molco · Pino Oregón · 0,80 a 0,85 × 2,00 m";

  it("una línea automática ya dice la medida en el título: sin línea aparte, salvo hoja o vano en la nota y la orden", () => {
    expect(lineaDeMedida(exacto, "820 × 2000 mm", false)).toBeNull();
    expect(lineaDeMedida(exacto, "820 × 2000 mm", true)).toBeNull();
    expect(lineaDeMedida(exacto, "820 × 2000 mm (Hoja)", false)).toBeNull(); // la cotización nunca nombra el tipo
    expect(lineaDeMedida(exacto, "820 × 2000 mm (Hoja)", true)).toBe("Medida solicitada: 820 × 2000 mm (Hoja)");
    expect(lineaDeMedida("Toltén · Raulí · 0,825 × 2,15 m", "825 × 2150 mm, vano", true)).toBe("Medida solicitada: 825 × 2150 mm, vano");
  });

  it("si el título no trae la medida (rango del catálogo, descripción escrita a mano), va aparte y sin tipo en la cotización", () => {
    expect(lineaDeMedida(rango, "820 × 2000 mm", false)).toBe("Medida solicitada: 820 × 2000 mm");
    expect(lineaDeMedida(rango, "820 × 2000 mm (Vano)", false)).toBe("Medida solicitada: 820 × 2000 mm");
    expect(lineaDeMedida("Puerta Molco oregón, panel liso", "830 × 2000 mm, hoja", false)).toBe("Medida solicitada: 830 × 2000 mm");
    expect(lineaDeMedida(rango, "820 × 2000 mm (Vano)", true)).toBe("Medida solicitada: 820 × 2000 mm (Vano)");
    expect(lineaDeMedida(rango, "820 × 2000 mm", true)).toBe("Medida solicitada: 820 × 2000 mm");
  });

  it("sin medida pedida no hay línea (registro antiguo: queda la descripción del catálogo)", () => {
    expect(lineaDeMedida(rango, null, true)).toBeNull();
    expect(lineaDeMedida(rango, undefined, false)).toBeNull();
    expect(lineaDeMedida(rango, "", false)).toBeNull();
  });
});
