import { describe, expect, it } from "vitest";
import { repartirReserva } from "./reserva";

describe("reserva (REQ-STK-7.1, 7.3)", () => {
  it("reserva todo si alcanza", () => {
    expect(repartirReserva([{ articuloId: "a", cantidad: 3 }], new Map([["a", 5]]))).toEqual([{ reservado: 3, faltante: 0 }]);
  });

  it("reserva lo disponible y marca el faltante, sin pasar a negativo", () => {
    expect(repartirReserva([{ articuloId: "a", cantidad: 5 }], new Map([["a", 2]]))).toEqual([{ reservado: 2, faltante: 3 }]);
    expect(repartirReserva([{ articuloId: "a", cantidad: 2 }], new Map([["a", -1]]))).toEqual([{ reservado: 0, faltante: 2 }]);
    expect(repartirReserva([{ articuloId: "a", cantidad: 2 }], new Map())).toEqual([{ reservado: 0, faltante: 2 }]);
  });

  it("el mismo artículo en dos líneas consume el disponible una sola vez", () => {
    expect(repartirReserva([{ articuloId: "a", cantidad: 2 }, { articuloId: "a", cantidad: 2 }], new Map([["a", 3]])))
      .toEqual([{ reservado: 2, faltante: 0 }, { reservado: 1, faltante: 1 }]);
  });

  it("un ítem a pedido (sin artículo) queda completo como faltante", () => {
    expect(repartirReserva([{ articuloId: null, cantidad: 2 }], new Map())).toEqual([{ reservado: 0, faltante: 2 }]);
  });
});
