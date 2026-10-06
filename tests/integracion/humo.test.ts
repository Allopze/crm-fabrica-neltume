import { describe, expect, it } from "vitest";

describe("capa de integración", () => {
  it("se ejecuta", () => {
    expect(process.version.startsWith("v24")).toBe(true);
  });
});
