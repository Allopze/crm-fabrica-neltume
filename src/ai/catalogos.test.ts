import { describe, expect, it } from "vitest";
import { parsearLimitesGroqFree, parsearPreciosCommandCode } from "./catalogos";

describe("catálogos públicos de IA (REQ-ADM-4.2)", () => {
  it("lee tarifas de entrada y salida por millón desde la tabla de Command Code", () => {
    const html = '<script>{"id":"google/gemini-3.5-flash","name":"Gemini Flash","inputCost":1.5,"outputCost":9,"cacheReadCost":0.2}</script>';
    expect(parsearPreciosCommandCode(html).get("google/gemini-3.5-flash")).toEqual({ entrada: 1.5, salida: 9 });
  });

  it("lee tarifas cuando Command Code escapa el JSON de su página de precios", () => {
    const html = String.raw`<script>{\"id\":\"google/gemini-3.5-flash\",\"name\":\"Gemini Flash\",\"inputCost\":1.5,\"outputCost\":9}</script>`;
    expect(parsearPreciosCommandCode(html).get("google/gemini-3.5-flash")).toEqual({ entrada: 1.5, salida: 9 });
  });

  it("lee RPM, RPD, TPM y TPD de la tabla Free sin reinterpretar headers", () => {
    const html = '<table><tr><th>MODEL ID</th><th>RPM</th><th>RPD</th><th>TPM</th><th>TPD</th></tr><tr><td>openai/gpt-oss-120b</td><td>30</td><td>1K</td><td>8K</td><td>200K</td><td>-</td></tr></table>';
    expect(parsearLimitesGroqFree(html).get("openai/gpt-oss-120b")).toEqual({ rpm: "30", rpd: "1K", tpm: "8K", tpd: "200K" });
  });
});
