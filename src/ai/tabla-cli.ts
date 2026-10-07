export interface ColumnaTablaCLI {
  titulo: string;
  alineacion?: "izquierda" | "derecha";
}

/** Renderiza una tabla de texto sin dependencias, lista para una terminal monoespaciada. */
export function renderizarTablaCLI(columnas: ColumnaTablaCLI[], filas: string[][]): string {
  if (!columnas.length) return "";
  const celdas = [columnas.map((c) => c.titulo), ...filas];
  const anchos = columnas.map((c, i) => Math.max(...celdas.map((fila) => [...(fila[i] ?? "")].length)));
  const borde = (izq: string, union: string, der: string) =>
    `${izq}${anchos.map((ancho) => "─".repeat(ancho + 2)).join(union)}${der}`;
  const fila = (valores: string[], encabezado = false) => `│${columnas.map((columna, i) => {
    const texto = valores[i] ?? "";
    const ancho = anchos[i];
    const celda = !encabezado && columna.alineacion === "derecha" ? texto.padStart(ancho) : texto.padEnd(ancho);
    return ` ${celda} `;
  }).join("│")}│`;

  return [
    borde("┌", "┬", "┐"),
    fila(columnas.map((c) => c.titulo), true),
    borde("├", "┼", "┤"),
    ...filas.map((valores) => fila(valores)),
    borde("└", "┴", "┘"),
  ].join("\n");
}
