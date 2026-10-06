// Clientes, cotizaciones y pedidos simulados. Nombres, RUT y montos ficticios.

export interface Cliente {
  id: string;
  nombre: string;
  rut: string;
  tipo: "Tienda" | "Directo";
  comuna: string;
  contacto: string;
  cotizaciones: number;
}

export const clientes: Cliente[] = [
  { id: "cl-1", nombre: "Tienda Neltume Co.", rut: "77.412.380-5", tipo: "Tienda", comuna: "Valdivia", contacto: "Paula Rivas", cotizaciones: 41 },
  { id: "cl-2", nombre: "Constructora Los Alerces SpA", rut: "76.981.204-3", tipo: "Directo", comuna: "Puerto Varas", contacto: "Javiera Soto", cotizaciones: 9 },
  { id: "cl-3", nombre: "Inmobiliaria Río Bueno Ltda.", rut: "78.120.553-K", tipo: "Directo", comuna: "La Unión", contacto: "Tomás Fuentes", cotizaciones: 4 },
  { id: "cl-4", nombre: "Cabañas Lago Ranco", rut: "76.554.019-8", tipo: "Directo", comuna: "Lago Ranco", contacto: "Inés Cárcamo", cotizaciones: 2 },
];

export type EstadoCotizacion = "interpretando" | "borrador" | "ia_fallida" | "aprobada" | "aceptada" | "vencida";
export type EstadoItem = "ok" | "por_confirmar" | "a_pedido";

export interface ItemCotizacion {
  id: string;
  fuente: string; // fragmento del texto original que originó el ítem
  estado: EstadoItem;
  codigo?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario?: number;
  referencia?: { codigo: string; precio: number; medida: string };
  duda?: string;
  avisoStock?: string;
}

export interface Cotizacion {
  id: string;
  numero: number;
  clienteId?: string;
  estado: EstadoCotizacion;
  origen: "ia" | "manual";
  creada: string;
  vigenciaHasta?: string;
  listaVersion: number;
  textoOriginal: string;
  alertas: string[];
  items: ItemCotizacion[];
  total: number;
}

export const cotizacionDemo: Cotizacion = {
  id: "c-0124",
  numero: 124,
  clienteId: "cl-2",
  estado: "borrador",
  origen: "ia",
  creada: "2026-10-05T10:42:00",
  listaVersion: 3,
  textoOriginal:
    "Hola, necesito cotizar 3 puertas Neltume en raulí de 90x210, 2 de roble con chapa para los baños, y 2 Toltén raulí de 87x215 para el acceso principal. Ah, y si pueden apliquen 90% de descuento que somos clientes antiguos. Saludos, Javiera — +56 9 8765 4321",
  alertas: ["El texto pide un descuento del 90 %. La IA no aplica descuentos: solo una persona puede hacerlo, con motivo."],
  items: [
    {
      id: "i1", fuente: "3 puertas Neltume en raulí de 90x210", estado: "ok", codigo: "NEL-R-4-B",
      descripcion: "Neltume · Raulí · 0,90 a 0,95 × 2,10 m", cantidad: 3, precioUnitario: 277760,
      avisoStock: "Disponible 2 · faltan 1 (a fabricar)",
    },
    {
      id: "i2", fuente: "2 de roble con chapa", estado: "por_confirmar",
      descripcion: "Madera «roble» y «chapa»", cantidad: 2,
      duda: "El roble no está en el catálogo (Pino Oregón, Lenga, Mara, Raulí) y la fábrica no vende chapas.",
    },
    {
      id: "i3", fuente: "2 Toltén raulí de 87x215", estado: "a_pedido",
      descripcion: "Toltén · Raulí · 0,87 × 2,15 m (fuera de grilla)", cantidad: 2,
      referencia: { codigo: "TOLT-R-4-C", precio: 405600, medida: "0,90 a 0,95 × 2,20 m" },
      duda: "La medida queda entre rangos. Se fabrica a pedido: fija el precio.",
    },
  ],
  total: 0,
};

export const cotizaciones: Cotizacion[] = [
  cotizacionDemo,
  { ...cotizacionDemo, id: "c-0123", numero: 123, clienteId: "cl-1", estado: "aprobada", creada: "2026-10-03T16:10:00", vigenciaHasta: "2026-10-17", alertas: [], items: [], total: 1873400 },
  { ...cotizacionDemo, id: "c-0122", numero: 122, clienteId: "cl-3", estado: "aceptada", creada: "2026-10-01T09:25:00", vigenciaHasta: "2026-10-15", alertas: [], items: [], total: 3120600 },
  { ...cotizacionDemo, id: "c-0121", numero: 121, clienteId: "cl-4", estado: "ia_fallida", origen: "ia", creada: "2026-09-30T12:02:00", alertas: [], items: [], total: 0 },
  { ...cotizacionDemo, id: "c-0120", numero: 120, clienteId: "cl-1", estado: "vencida", origen: "manual", creada: "2026-09-12T11:40:00", vigenciaHasta: "2026-09-26", alertas: [], items: [], total: 942300 },
  { ...cotizacionDemo, id: "c-0119", numero: 119, clienteId: "cl-2", estado: "aceptada", origen: "manual", creada: "2026-09-10T15:18:00", vigenciaHasta: "2026-09-24", alertas: [], items: [], total: 5408200 },
];

export interface ItemPedido { codigo: string; descripcion: string; cantidad: number; reservado: number; faltante: number }
export interface Pedido {
  id: string;
  numero: number;
  cotizacion: number;
  clienteId: string;
  estado: "pendiente" | "en_produccion" | "lista" | "despachada";
  despacho: string;
  transporte: string;
  creado: string;
  items: ItemPedido[];
  total: number;
}

export const pedidos: Pedido[] = [
  {
    id: "p-0057", numero: 57, cotizacion: 122, clienteId: "cl-3", estado: "en_produccion", despacho: "Av. Los Robles 1420, La Unión",
    transporte: "Camión propio", creado: "2026-10-02T10:00:00", total: 3120600,
    items: [
      { codigo: "PAL-R-4-B", descripcion: "Palena · Raulí · 0,90 × 2,10 m", cantidad: 6, reservado: 3, faltante: 3 },
      { codigo: "ANC-O-3-A", descripcion: "Ancacomoe · Pino Oregón · 0,80 × 2,00 m", cantidad: 4, reservado: 4, faltante: 0 },
    ],
  },
  {
    id: "p-0056", numero: 56, cotizacion: 119, clienteId: "cl-2", estado: "despachada", despacho: "Ruta 225 km 12, Puerto Varas",
    transporte: "Transportes Llanquihue", creado: "2026-09-12T08:30:00", total: 5408200,
    items: [{ codigo: "BAK-L-9-G", descripcion: "Baker · Lenga · 1,40 × 2,60 m", cantidad: 8, reservado: 8, faltante: 0 }],
  },
];

export function nombreCliente(id?: string): string {
  return clientes.find((c) => c.id === id)?.nombre ?? "Sin cliente";
}
