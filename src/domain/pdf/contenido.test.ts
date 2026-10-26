import { describe, expect, it } from "vitest";
import { datosEmpresa } from "@/lib/marca";
import { contenidoCotizacion, contenidoOrdenTrabajo, contenidoPedido, contenidoPruebaConexion, fechaLargaSantiago, fechaSantiago, textoPie } from "./contenido";
import { GENERICO } from "./dibujos";

const base = {
  numero: 124, aprobadaEn: new Date("2026-10-06T02:30:00Z"), aprobadaPor: "Paula Soto", vigenciaHasta: "2026-10-20", listaVersion: 3,
  cliente: { nombre: "Constructora Los Alerces", rut: "12.345.678-5", comuna: "Temuco", contacto: null },
  items: [
    { codigo: "MOL-O-3-A", descripcion: "Molco · Pino Oregón · 0,80 a 0,85 × 2,00 m", medidaSolicitada: "820 × 2000 mm (Hoja)", cantidad: 3, precioUnitario: 277760, totalLinea: 833280, modelo: "MOLCO", familia: "puerta" as const },
    { codigo: null, descripcion: "Toltén · Raulí · 0,87 × 2,15 m", medidaSolicitada: "870 × 2150 mm, vano", cantidad: 2, precioUnitario: 400000, totalLinea: 800000 },
  ],
  subtotal: 1633280, descuento: 0, descuentoMotivo: null, iva: 310323, total: 1943603, abonoPct: 50,
};

describe("pdf.contenido (REQ-COT-4.2; estilo común v1)", () => {
  it("tipo y número, fecha en palabras en el encabezado, vigencia, quién aprobó y cliente", () => {
    const k = contenidoCotizacion(base);
    expect([k.tipo, k.numero, k.titulo]).toEqual(["Cotización", "N.º 124", "Cotización N.º 124 · Neltume"]);
    // 23:30 del 05-10 en Santiago: la fecha larga solo va en el encabezado; la vigencia sigue en dd-mm-aaaa.
    expect(k.meta).toEqual([["Fecha", "5 de octubre de 2026"], ["Válida hasta", "20-10-2026"], ["Aprobada por", "Paula Soto"]]);
    expect(k.partes).toEqual([{ etiqueta: "Cliente", titulo: "Constructora Los Alerces", pares: [["RUT", "12.345.678-5"], ["Contacto", "—"], ["Comuna", "Temuco"]] }]);
    expect(contenidoCotizacion({ ...base, cliente: null }).partes).toEqual([]);
    expect(contenidoCotizacion({ ...base, aprobadaPor: null }).meta).toHaveLength(2);
  });

  it("la tabla común: celda de producto, importes en formato chileno y la miniatura del dibujo sin cotas", () => {
    const k = contenidoCotizacion(base);
    expect(k.filas[0]).toMatchObject({ n: 1, titulo: base.items[0].descripcion, medida: "Medida solicitada: 820 × 2000 mm", observacion: null, codigo: "MOL-O-3-A", cantidad: "3", importes: ["$277.760", "$833.280"], cotas: null });
    expect(k.filas[0].dibujo!.archivo).toBe("molco.png");
    // «A pedido» sin artículo: el modelo sale del comienzo de la descripción y no lleva código.
    expect(k.filas[1]).toMatchObject({ n: 2, codigo: null, medida: null, importes: ["$400.000", "$800.000"], cotas: null });
    expect(k.filas[1].dibujo!.archivo).toBe("tolten.png");
    expect(k.totales).toEqual([["Subtotal neto", "$1.633.280"], ["IVA 19 %", "$310.323"]]);
    expect(k.total).toBe("$1.943.603");
  });

  it("la cotización imprime la medida exacta pedida y no el rango, y nunca «hoja» ni «vano» (REQ-COT-4.12)", () => {
    const nueva = { ...base, items: [
      { ...base.items[0], descripcion: "Molco · Pino Oregón · 0,82 × 2,00 m", medidaSolicitada: "820 × 2000 mm (hoja)" },
      { ...base.items[1], descripcion: "Toltén · Raulí · 0,822 × 2,15 m", medidaSolicitada: "822 × 2150 mm (vano)" },
    ] };
    const k = contenidoCotizacion(nueva);
    expect(k.filas.map((f) => [f.titulo, f.medida])).toEqual([["Molco · Pino Oregón · 0,82 × 2,00 m", null], ["Toltén · Raulí · 0,822 × 2,15 m", null]]);
    // Una cotización antigua trae el rango del catálogo en el título: la medida pedida va aparte y también sin el tipo.
    const antigua = contenidoCotizacion({ ...base, items: [{ ...base.items[0], medidaSolicitada: "820 × 2000 mm, vano" }, { ...base.items[0], medidaSolicitada: null }] });
    expect(antigua.filas.map((f) => [f.titulo, f.medida])).toEqual([[base.items[0].descripcion, "Medida solicitada: 820 × 2000 mm"], [base.items[0].descripcion, null]]);
    const texto = JSON.stringify([...k.filas, ...antigua.filas].map((f) => [f.titulo, f.medida, f.observacion, f.detalle]));
    expect(texto).not.toMatch(/hoja|vano/i);
  });

  it("las notas junto a los totales (flete, lista, condición de pago) y el pie con los datos de la empresa", () => {
    const k = contenidoCotizacion(base);
    expect(k.notas[0]).toContain("Valores puestos en fábrica, flete aparte.");
    expect(k.notas[0]).toContain("lista v3");
    expect(k.notas[2]).toBe("Condición de pago: 50 % de abono al confirmar y saldo antes del despacho o retiro.");
    expect(contenidoCotizacion({ ...base, abonoPct: 100 }).notas[2]).toBe("Condición de pago: total antes del despacho o retiro.");
    // A la tienda no se le exige pago: sin condición impresa (REQ-COT-8.17).
    expect(contenidoCotizacion({ ...base, abonoPct: null }).notas).toHaveLength(2);
    expect(k.pie).toBe("Neltume.co · Neltume.co@gmail.com");
  });

  it("muestra el descuento con su motivo solo si existe", () => {
    const k = contenidoCotizacion({ ...base, descuento: 50000, descuentoMotivo: "cliente frecuente" });
    expect(k.totales[1]).toEqual(["Descuento (cliente frecuente)", "−$50.000"]);
  });

  it("la fecha se toma en la zona de Santiago, corta y en palabras", () => {
    expect(fechaSantiago(new Date("2026-01-01T02:00:00Z"))).toBe("31-12-2025");
    expect(fechaLargaSantiago(new Date("2026-01-01T02:00:00Z"))).toBe("31 de diciembre de 2025");
    expect(fechaLargaSantiago(new Date("2026-10-25T15:30:00Z"))).toBe("25 de octubre de 2026");
  });
});

describe("pdf.contenido de la nota de pedido (REQ-COT-8.1, 8.16, 4.9–4.11)", () => {
  const nota = {
    numero: 7, creadoEn: new Date("2026-10-06T15:00:00Z"), estado: "pendiente", cotizacionNumero: 124, notaTienda: null,
    cliente: { nombre: "Ferretería Puyehue", rut: "11.111.111-1", contacto: null, telefono: null },
    direccionDespacho: null, medioTransporte: "Camión propio", entregaComprometida: "2026-11-20", observaciones: "Llamar antes",
    items: [
      { codigo: "FUY-O-2-A", descripcion: "Fuy", medidaSolicitada: "720 × 2000 mm (Hoja)", observacion: "Bisagras a la derecha", cantidad: 3, faltante: 1, totalLinea: 300000, modelo: "FUY", familia: "puerta" as const },
      { codigo: "MAR-O-2X4-B", descripcion: "Marco", medidaSolicitada: null, cantidad: 3, faltante: 0, totalLinea: 57000, modelo: "MARCO", familia: "accesorio" as const },
      { codigo: null, descripcion: "Puerta según diseño cliente · Roble", medidaSolicitada: "900 × 2100 mm (Vano)", cantidad: 1, faltante: 1, totalLinea: 0 },
      { codigo: "ENDO-O-12X1-H", descripcion: "Endolado", medidaSolicitada: null, cantidad: 12, faltante: 0, totalLinea: 82596, modelo: "ENDOLADO", familia: "accesorio" as const },
    ],
    subtotal: 301000, descuento: 0, iva: 57190, total: 358190, pago: { pagado: 179095, saldo: 179095 },
  };

  it("muestra despacho, faltante por fabricar y totales congelados", () => {
    const k = contenidoPedido(nota);
    expect([k.tipo, k.numero, k.titulo, k.marca]).toEqual(["Nota de pedido", "N.º 7", "Nota de pedido N.º 7 · Neltume", null]);
    expect(k.meta).toEqual([["Fecha", "6 de octubre de 2026"], ["Cotización", "N.º 124"]]);
    expect(k.partes).toEqual([
      { etiqueta: "Cliente", titulo: "Ferretería Puyehue", pares: [["RUT", "11.111.111-1"], ["Contacto", "—"], ["Teléfono", "—"]] },
      { etiqueta: "Despacho", titulo: "Retira en fábrica", pares: [["Transporte", "Camión propio"], ["Entrega", "20-11-2026"]] },
    ]);
    expect(k.filas.map((f) => f.importes)).toEqual([["1", "$300.000"], ["—", "$57.000"], ["1", "Por definir"], ["—", "$82.596"]]);
    expect(k.total).toBe("$358.190");
    expect(k.pago).toEqual([["Pagado", "$179.095"], ["Saldo", "$179.095"]]);
    expect(k.notas[0]).toContain("flete aparte");
  });

  it("celda de producto con observación, y un plano con las cotas de la medida pedida solo en las puertas con ancho y alto", () => {
    const [puerta, marco, especial, moldura] = contenidoPedido(nota).filas;
    expect(puerta).toMatchObject({ observacion: "Observación: Bisagras a la derecha", medida: "Medida solicitada: 720 × 2000 mm (Hoja)", cotas: { ancho: 720, alto: 2000 } });
    expect(puerta.dibujo!.archivo).toBe("fuy.png");
    // El marco lleva su dibujo y nunca cotas; la moldura, nada.
    expect(marco.dibujo!.archivo).toBe("marco.png");
    expect(marco.cotas).toBeNull();
    expect(moldura.dibujo).toBeNull();
    // El pedido especial usa el esquema genérico de puerta, con las cotas de su medida.
    expect(especial.dibujo).toBe(GENERICO);
    expect(especial.cotas).toEqual({ ancho: 900, alto: 2100 });
    expect(especial.codigo).toBeNull();
  });

  it("la nota dice «hoja» o «vano» solo si el cliente lo indicó; con la medida ya en el título no repite la línea (REQ-COT-4.12)", () => {
    const linea = (descripcion: string, medidaSolicitada: string) => contenidoPedido({ ...nota, items: [{ ...nota.items[0], descripcion, medidaSolicitada }] }).filas[0].medida;
    expect(linea("Fuy · Pino Oregón · 0,72 × 2,00 m", "720 × 2000 mm")).toBeNull();
    expect(linea("Fuy · Pino Oregón · 0,72 × 2,00 m", "720 × 2000 mm (Hoja)")).toBe("Medida solicitada: 720 × 2000 mm (Hoja)");
    // Una línea de la tienda trae la descripción del catálogo (el rango): la medida pedida va siempre aparte.
    expect(linea("Fuy Pino Oregon 0,70 a 0,75 m × 2 m", "720 × 2000 mm")).toBe("Medida solicitada: 720 × 2000 mm");
    expect(linea("Fuy Pino Oregon 0,70 a 0,75 m × 2 m", "720 × 2000 mm (Vano)")).toBe("Medida solicitada: 720 × 2000 mm (Vano)");
  });

  it("«Para fábrica»: entrega, observaciones y las dos firmas; un ítem a pedido sin precio dice «Por definir», nunca «$0»", () => {
    const k = contenidoPedido(nota);
    expect(k.paraFabrica).toEqual({ entrega: "20-11-2026", observaciones: "Llamar antes", firmas: ["Aprobado por", "Recibido por la fábrica"] });
    expect(contenidoPedido({ ...nota, entregaComprometida: null }).paraFabrica.entrega).toBe("Por comprometer");
    expect(JSON.stringify(k.filas.map((f) => f.importes))).not.toContain("$0");
  });

  it("una nota de la tienda lleva su número en la meta y una cancelada, el estado y la marca ANULADA", () => {
    const k = contenidoPedido({ ...nota, cotizacionNumero: null, notaTienda: "577", estado: "cancelada" });
    expect(k.meta).toEqual([["Fecha", "6 de octubre de 2026"], ["Nota de la tienda", "N.º 577"], ["Estado", "Cancelada"]]);
    expect(k.marca).toBe("ANULADA");
  });
});

describe("datos de la empresa en el pie (marca real)", () => {
  it("imprime solo los datos configurados, con nombre y correo por defecto", () => {
    expect(textoPie(datosEmpresa({}))).toBe("Neltume.co · Neltume.co@gmail.com");
    const d = datosEmpresa({ NELTUME_EMPRESA_RUT: "11.111.111-1", NELTUME_EMPRESA_DIRECCION: "Camino a Neltume s/n", NELTUME_EMPRESA_TELEFONO: "+56 9 1234 5678", NELTUME_EMPRESA_WEB: "ejemplo.cl", NELTUME_EMPRESA_CORREO: "ventas@ejemplo.cl" });
    expect(textoPie(d)).toBe("Neltume.co · RUT 11.111.111-1 · Camino a Neltume s/n · Tel. +56 9 1234 5678 · ejemplo.cl · ventas@ejemplo.cl");
    expect(contenidoCotizacion(base, d).pie).toContain("ventas@ejemplo.cl");
  });
});

describe("pdf.orden-trabajo (ADR-0023 §7)", () => {
  const orden = {
    numero: 418, creadoEn: new Date("2026-10-24T15:00:00Z"), estado: "pendiente", cotizacionNumero: null, notaTienda: "577", revisionTienda: 2,
    proyecto: "Casa Lago", direccionDespacho: "Camino a Neltume km 3", medioTransporte: "Starken", entregaComprometida: "2026-11-16", observaciones: "Entregar en dos etapas.",
    items: [
      { codigo: "FUY-O-2-A", descripcion: "Fuy · Pino Oregón", medidaSolicitada: "720 × 2000 mm (Hoja)", observacion: "Bisagras a la derecha", revisar: null, referencias: 1, cantidad: 3, reservado: 1, faltante: 2, modelo: "FUY", familia: "puerta" as const },
      { codigo: null, descripcion: "Puerta según diseño · Roble", medidaSolicitada: "900 × 2100 mm (Vano)", observacion: null, revisar: "Pedido especial de la tienda; precio por definir", referencias: 0, cantidad: 1, reservado: 0, faltante: 0 },
    ],
  };

  it("lleva lo necesario para fabricar y ningún importe ni dato del cliente final", () => {
    const k = contenidoOrdenTrabajo(orden);
    expect([k.tipo, k.numero, k.titulo, k.marca]).toEqual(["Orden de trabajo", "N.º 418", "Orden de trabajo N.º 418 · Neltume", null]);
    expect(k.meta).toEqual([["Fecha", "24 de octubre de 2026"], ["Nota de la tienda", "N.º 577 (rev. 2)"]]);
    expect(k.partes).toEqual([
      { etiqueta: "Obra", titulo: "Casa Lago", pares: [] },
      { etiqueta: "Despacho", titulo: "Camino a Neltume km 3", pares: [["Transporte", "Starken"], ["Entrega", "16-11-2026"]] },
    ]);
    expect(k.filas[0]).toMatchObject({ codigo: "FUY-O-2-A", observacion: "Observación: Bisagras a la derecha", detalle: "Referencias del cliente: 1 (en la app)", revisar: null, cantidad: "3", importes: ["1", "2"], cotas: { ancho: 720, alto: 2000 } });
    expect(k.filas[1]).toMatchObject({ codigo: null, revisar: "REVISAR: Pedido especial de la tienda; precio por definir", cantidad: "1", importes: ["—", "1"], cotas: { ancho: 900, alto: 2100 } });
    expect(k.filas[1].dibujo).toBe(GENERICO);
    expect(k.paraFabrica).toEqual({ entrega: "16-11-2026", observaciones: "Entregar en dos etapas.", firmas: ["Aprobado por", "Recibido por la fábrica"] });
    expect(k.notas.join(" ")).toContain("Las cotas del plano son la medida pedida");
    expect(JSON.stringify({ ...k, filas: k.filas.map((f) => ({ ...f, dibujo: null })) })).not.toMatch(/\$|IVA|Total|RUT/);
  });

  it("una orden de una cotización nombra su origen y una cancelada lleva la marca ANULADA", () => {
    const k = contenidoOrdenTrabajo({ ...orden, cotizacionNumero: 124, notaTienda: null, estado: "cancelada", proyecto: null });
    expect(k.meta).toEqual([["Fecha", "24 de octubre de 2026"], ["Cotización", "N.º 124"], ["Estado", "Cancelada"]]);
    expect(k.partes[0]).toEqual({ etiqueta: "Obra", titulo: "Sin proyecto", pares: [] });
    expect(k.marca).toBe("ANULADA");
  });
});

describe("pdf.prueba-conexion (ADR-0024 §5)", () => {
  const k = contenidoPruebaConexion({ codigo: "6f1c2a7e", fabrica: "PANGUIPULLI", creadaEn: new Date("2026-10-25T18:02:11Z") });

  it("se rotula como prueba, con la fecha y hora de Santiago y el código para reconocerlo al otro lado", () => {
    expect(k.rotulo).toBe("PRUEBA DE CONEXIÓN — no es un pedido");
    expect([k.tipo, k.numero, k.titulo, k.marca]).toEqual(["Prueba de conexión", "6f1c2a7e", "Prueba de conexión · Neltume", "PRUEBA"]);
    expect(k.meta).toEqual([["Fecha y hora", "25-10-2026 15:02"]]);
    expect(k.partes).toEqual([
      { etiqueta: "Emisor", titulo: "Fábrica Panguipulli", pares: [] },
      { etiqueta: "Destino", titulo: "La tienda", pares: [["Código", "6f1c2a7e"]] },
    ]);
    expect(k.nota).toContain("6f1c2a7e");
    expect(k.notas.join(" ")).toContain("no crea notas de pedido");
  });

  it("solo lleva datos inventados y no lleva dibujos: ni precios, ni clientes, ni nada real de la fábrica", () => {
    expect(k.filas.map((f) => f.codigo)).toEqual(["PRUEBA-1", "PRUEBA-2"]);
    expect(k.filas.every((f) => f.titulo.includes("dato inventado") && f.dibujo === null && f.cotas === null)).toBe(true);
    expect(JSON.stringify({ partes: k.partes, filas: k.filas })).not.toMatch(/\$|IVA|Total|precio|RUT|@/i);
    expect(JSON.stringify(k)).not.toContain("$"); // ni un monto en pesos en ninguna parte
    expect(k.notas[0]).toContain("no lleva precios");
  });
});
