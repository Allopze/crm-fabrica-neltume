// Paleta visual por madera (código de una letra del catálogo).
export type MaderaId = "O" | "L" | "M" | "R";

export const maderas: Record<MaderaId, { nombre: string; css: string }> = {
  O: { nombre: "Pino Oregón", css: "var(--pino-oregon)" },
  L: { nombre: "Lenga", css: "var(--lenga)" },
  M: { nombre: "Mara", css: "var(--mara)" },
  R: { nombre: "Raulí", css: "var(--rauli-madera)" },
};
