import { describe, expect, it } from "vitest";
import { renderizarTablaCLI } from "./tabla-cli";

describe("tabla CLI", () => {
  it("alinea las columnas y delimita filas y encabezados", () => {
    const tabla = renderizarTablaCLI(
      [{ titulo: "#", alineacion: "derecha" }, { titulo: "Modelo" }, { titulo: "Entrada", alineacion: "derecha" }],
      [["1", "Gemini Flash", "0,15"], ["12", "GPT", "10,00"]],
    );

    expect(tabla).toContain("│ #  │ Modelo       │ Entrada │");
    expect(tabla).toContain("│  1 │ Gemini Flash │    0,15 │");
    expect(tabla).toContain("├────┼──────────────┼─────────┤");
  });
});
