import { describe, expect, it } from "vitest";
import { leerRetryAfterMs } from "./retry-after";
import { ErrorIA } from "./interfaz";

describe("lectura acotada de Retry-After", () => {
  it("acepta segundos y fecha HTTP, ignora valores inválidos", () => {
    const ahora = Date.parse("2026-10-06T12:00:00Z");
    expect(leerRetryAfterMs("2.5", ahora)).toBe(2_500);
    expect(leerRetryAfterMs("Tue, 06 Oct 2026 12:00:04 GMT", ahora)).toBe(4_000);
    expect(leerRetryAfterMs("malo", ahora)).toBeUndefined();
  });

  it("no reintenta antes de un Retry-After que excede los 30 segundos", () => {
    const demora = leerRetryAfterMs("300", 0);
    expect(demora).toBe(30_001);
    expect(new ErrorIA("transitorio", "429", demora).reintentable).toBe(false);
  });
});
