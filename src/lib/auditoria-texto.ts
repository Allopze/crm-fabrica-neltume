// Lectura humana del registro de auditoría (REQ-ADM-3.2): acciones, recursos y detalle en español y formato chileno.
// El registro guarda los datos tal cual; esto solo cambia cómo se muestran.
import { clp, fecha, fechaHora, numero } from "./formato";

const RECURSOS: Record<string, string> = {
  alias_modelo: "Alias de modelo", api: "Acceso", articulo: "Puerta o accesorio", bom: "Receta (BOM)", cliente: "Cliente",
  configuracion: "Configuración", cotizacion: "Cotización", feriado: "Feriado", importacion: "Importación del Excel",
  lista_precio: "Lista de precios", madera_insumo: "Madera de la puerta", materia_prima: "Materia prima", nota_pedido: "Nota de pedido",
  orden_produccion: "Orden de producción", rol: "Rol", sesion: "Sesión", usuario: "Usuario",
  compra: "Factura de compra (Chipax)", proveedor_compra: "Proveedor (Chipax)", mapeo_item_compra: "Ítem de proveedor",
  sincronizacion_chipax: "Sincronización con Chipax",
  recepcion_tienda: "Nota recibida de la tienda", adjunto_tienda: "Adjunto de la tienda", integracion: "API de la tienda",
  prueba_conexion: "Prueba de conexión con la tienda",
};

const ACCIONES: Record<string, string> = {
  login: "Ingreso", logout: "Salida", crear: "Creación", actualizar: "Cambio", anular: "Anulación", aprobar: "Aprobación", cerrar: "Cierre",
  recalcular: "Recálculo con la lista vigente", interpretar: "Interpretación de la IA", "interpretar (encolar)": "Pedido enviado a la IA",
  "crear manual": "Creación a mano", "agregar ítem por confirmar": "Ítem por confirmar agregado", "quitar ítem": "Ítem quitado", "aplicar descuento": "Descuento", "definir bom": "Receta definida",
  "asociar madera": "Madera asociada", "importar excel": "Importación del Excel", recepcion: "Recepción", ajuste: "Ajuste",
  consumo_produccion: "Consumo de producción", entrada_produccion: "Entrada de producción", salida_despacho: "Salida por despacho",
  reserva: "Reserva", liberacion: "Liberación de reserva", "crear pedido": "Nota de pedido creada", "cancelar pedido": "Cancelación",
  "pedido en produccion": "Pasó a producción", "pedido lista": "Lista para despacho", "pedido despachada": "Despacho",
  "completar reserva": "Reserva completada", "registrar pago": "Pago registrado", "revertir pago": "Pago revertido",
  "excepcion de pago": "Excepción de pago", "editar despacho": "Despacho editado",
  "leer factura chipax": "Factura leída de Chipax", "sincronizar chipax": "Sincronización con Chipax", "asociar item compra": "Ítem asociado",
  "ignorar item compra": "Ítem marcado «no es materia prima»", "habilitar proveedor": "Proveedor habilitado", "desactivar proveedor": "Proveedor desactivado",
  "editar mapeo compra": "Ítem de proveedor editado", "solicitar sincronizacion": "Sincronización pedida",
  "recibir de la tienda": "Recibida de la tienda", "recibir adjunto de la tienda": "Adjunto recibido de la tienda",
  "revision de la tienda": "Revisión de la tienda por aplicar", "anulacion de la tienda": "Anulación de la tienda por aplicar",
  "aplicar revision de la tienda": "Revisión de la tienda aplicada", "descartar revision de la tienda": "Revisión de la tienda descartada",
  "descargar orden de trabajo": "Orden de trabajo descargada", "descargar documento de la tienda": "Documento de la tienda descargado",
  "solicitar prueba de conexion": "Prueba de conexión pedida", "enviar prueba de conexion": "Prueba de conexión enviada a la tienda",
  "recibir prueba de conexion": "Prueba de conexión recibida de la tienda",
};

const METODOS: Record<string, string> = { GET: "Consultar", POST: "Registrar", PATCH: "Modificar", PUT: "Reemplazar", DELETE: "Eliminar" };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Las claves sin traducción se leen desde camelCase o snake_case; estas palabras recuperan sus tildes.
const TILDES: Record<string, string> = {
  articulo: "artículo", articulos: "artículos", catalogo: "catálogo", categoria: "categoría", categorias: "categorías", codigo: "código",
  codigos: "códigos", descripcion: "descripción", dia: "día", dias: "días", direccion: "dirección", existian: "existían", habiles: "hábiles",
  historico: "histórico", leidas: "leídas", linea: "línea", lineas: "líneas", migracion: "migración", minimo: "mínimo", numero: "número",
  observacion: "observación", produccion: "producción", razon: "razón", recepcion: "recepción", telefono: "teléfono", ubicacion: "ubicación",
  ultima: "última", ultimo: "último", version: "versión",
};
const conTildes = (t: string) => t.replace(/\p{L}+/gu, (p) => TILDES[p.toLowerCase()] ?? p).replace(/\bfuera catálogo\b/i, (m) => m.replace(" ", " de "));

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function textoRecurso(recurso: string): string {
  return RECURSOS[recurso] ?? capital(conTildes(recurso.replace(/_/g, " ")));
}

// Peticiones a la API registradas como acceso (denegadas o fallidas), en palabras: nunca la ruta.
const RUTAS: [RegExp, string][] = [
  [/^POST \/ordenes\/[^/]+\/cerrar$/, "Cerrar orden de producción"], [/^POST \/ordenes\/[^/]+\/anular$/, "Anular orden de producción"],
  [/^POST \/ordenes$/, "Crear orden de producción"], [/^POST \/movimientos\/entradas$/, "Registrar entrada de puertas"],
  [/^POST \/movimientos\/salidas$/, "Registrar salida de puertas"], [/^POST \/movimientos\/ajustes$/, "Registrar ajuste"],
  [/^POST \/recepciones$/, "Registrar recepción"], [/^POST \/cotizaciones\/interpretaciones$/, "Enviar pedido a la IA"],
  [/^POST \/cotizaciones\/[^/]+\/aprobar$/, "Aprobar cotización"], [/^GET \/cotizaciones\/[^/]+\/pdf$/, "Descargar PDF de la cotización"],
  [/^POST \/cotizaciones\/[^/]+\/descuento$/, "Aplicar descuento"], [/^POST \/cotizaciones\/[^/]+\/items$/, "Agregar ítem"],
  [/^PATCH \/cotizaciones\/[^/]+\/items\/[^/]+$/, "Modificar ítem"], [/^DELETE \/cotizaciones\/[^/]+\/items\/[^/]+$/, "Quitar ítem"],
  [/^POST \/cotizaciones\/[^/]+\/recalcular$/, "Recalcular con la lista vigente"], [/^POST \/cotizaciones$/, "Crear cotización"],
  [/^(GET|PATCH) \/cotizaciones\/[^/]+$/, "$1 cotización"], [/^GET \/pedidos\/[^/]+\/pdf$/, "Descargar PDF de la nota de pedido"],
  [/^POST \/pedidos\/nota-tienda$/, "Cargar nota de la tienda"], [/^POST \/pedidos\/[^/]+\/despachar$/, "Despachar nota de pedido"],
  [/^POST \/pedidos\/[^/]+\/pagos$/, "Registrar pago"], [/^POST \/pedidos$/, "Crear nota de pedido"],
  [/^POST \/puertas\/[^/]+\/apartar$/, "Apartar puerta"], [/^POST \/puertas\/[^/]+\/liberar$/, "Liberar puerta"],
  [/^PATCH \/puertas\/[^/]+$/, "Modificar puerta"], [/^POST \/importaciones$/, "Importar el Excel"], [/^POST \/listas-precio$/, "Crear versión de la lista"],
  [/^PUT \/usuarios\/[^/]+\/clave$/, "Restablecer contraseña"], [/^POST \/usuarios$/, "Crear usuario"], [/^PATCH \/usuarios\/[^/]+$/, "Modificar usuario"],
  [/^PUT \/roles/, "Modificar permisos"], [/^PUT \/ajustes\/ia$/, "Cambiar los ajustes de IA"], [/^POST \/bom\/aplicar$/, "Aplicar a varias recetas"],
  [/^POST \/compras\/sincronizar$/, "Pedir sincronización con Chipax"], [/^POST \/feriados$/, "Agregar feriado"],
  [/^POST \/integracion\/tienda\/pruebas$/, "Enviar prueba de conexión a la tienda"], [/^GET \/integracion\/tienda\/pruebas\/[^/]+\/pdf$/, "Ver PDF de una prueba de conexión"],
];
const SEGMENTOS: Record<string, string> = {
  auditoria: "auditoría", clientes: "clientes", cotizaciones: "cotizaciones", pedidos: "notas de pedido", stock: "stock", puertas: "puertas",
  "materias-primas": "materias primas", metricas: "métricas", ordenes: "órdenes de producción", bom: "recetas", usuarios: "usuarios",
  "listas-precio": "lista de precios", feriados: "feriados", compras: "compras de Chipax", "proveedores-compra": "proveedores de Chipax",
  integracion: "conexión con la tienda",
};

/** «POST /api/v1/ordenes/<id>/cerrar» → «Cerrar orden de producción»; el resto, por tabla o sin guiones bajos. */
export function textoAccion(accion: string): string {
  const http = /^(GET|POST|PATCH|PUT|DELETE) \/api\/v1(\/\S*)$/.exec(accion);
  if (http) {
    const ruta = `${http[1]} ${http[2].replace(/\?.*$/, "")}`;
    const conocida = RUTAS.find(([r]) => r.test(ruta));
    if (conocida) return ruta.replace(conocida[0], conocida[1]).replace(/^(GET|PATCH) /, (_, m: string) => `${METODOS[m]} `);
    const primero = http[2].split("/").filter(Boolean)[0] ?? "";
    return `${METODOS[http[1]]} ${SEGMENTOS[primero] ?? primero.replace(/-/g, " ")}`;
  }
  return ACCIONES[accion] ?? capital(conTildes(accion.replace(/_/g, " ")));
}

const CAMPOS: Record<string, string> = {
  activo: "Activo", cantidad: "Cantidad", codigo: "Código", comuna: "Comuna", contacto: "Contacto", creadas: "Creadas", descripcion: "Descripción",
  descuento: "Descuento", descuentoPct: "Descuento (%)", direccion: "Dirección", direccionDespacho: "Dirección de despacho", email: "Correo",
  estado: "Estado", faltante: "Faltante", filasCorregidas: "Filas corregidas", filasRechazadas: "Filas rechazadas", giro: "Giro", items: "Ítems",
  iva: "IVA", largoTexto: "Largo del texto", lineas: "Líneas", listaVersion: "Versión de lista", madera: "Madera", medida: "Medida",
  modelo: "Modelo", motivo: "Motivo", neto: "Neto", nombre: "Nombre", numero: "N.º", orden: "Orden", origen: "Origen", rechazadas: "Rechazadas",
  reservado: "Reservado", rut: "RUT", stockMinimo: "Mínimo", subtotal: "Subtotal", telefono: "Teléfono", tipo: "Tipo", total: "Total",
  unidades: "Unidades", unidadCodigo: "Unidad", vigenciaHasta: "Vigente hasta", actualizadas: "Actualizadas", aPedidoConfirmados: "A pedido confirmados",
  liberado: "Liberado", insumos: "Insumos", sinCambios: "Sin cambios", archivo: "Archivo",
  monto: "Monto", pagado: "Pagado", saldo: "Saldo", estadoPago: "Estado de pago", medio: "Medio", referencia: "Comprobante", fecha: "Fecha",
  faltaAbono: "Falta de abono", proveedor: "Proveedor", item: "Ítem", materiaPrima: "Materia prima", factor: "Factor", recibidas: "Recibidas",
  porAsociar: "Por asociar", porRevisar: "Por revisar", ignoradas: "Ignoradas", leidas: "Leídas", nuevas: "Nuevas", lineasRecibidas: "Líneas recibidas",
  xmlPendientes: "XML pendientes", avisos: "Avisos", errores: "Errores", desde: "Desde", resultado: "Resultado", folio: "Folio",
  httpStatus: "Respuesta HTTP", codigoError: "Código de error", latenciaMs: "Latencia (ms)", desfaseRelojMs: "Desfase de reloj (ms)", destino: "Destino",
  detalle: "Detalle", bytes: "Tamaño (bytes)",
};
const MONTOS = new Set(["total", "subtotal", "iva", "neto", "descuento", "monto", "pagado", "saldo", "faltaAbono"]);
// Valores de código que se leen mejor en palabras (estado de pago, ADR-0020).
const VALORES: Record<string, string> = { sin_control: "no exige pago", sin_abono: "sin abono", abonado: "abonado", pagado: "pagado" };
// Ids internos y huellas no le dicen nada a quien lee el registro: se omiten del detalle.
const OCULTOS = new Set(["id", "hash", "movimiento", "materiaPrimaId", "rolId", "ref", "creadoEn", "actualizadoEn", "bom", "item", "cotizacion", "eventId", "sha256"]);

// Códigos de error de la API (API.md §2) como los leería una persona.
const ERRORES: Record<string, string> = {
  INSUMOS_INSUFICIENTES: "faltan insumos", VALIDACION: "datos inválidos", SIN_BOM: "sin receta", BOM_INCOMPLETO: "receta incompleta",
  ORDEN_CERRADA: "la orden ya estaba cerrada", STOCK_INSUFICIENTE: "stock insuficiente", ITEMS_POR_CONFIRMAR: "quedan ítems por confirmar",
  NO_APROBADA: "la cotización no está aprobada", VENCIDA: "la cotización venció", YA_TIENE_PEDIDO: "ya tenía nota de pedido",
  NO_EDITABLE: "ya no se puede modificar", CONFLICTO: "otra persona la cambió antes", PROHIBIDO: "sin permiso", NO_ENCONTRADO: "no existe",
  ULTIMO_ADMIN: "es el último usuario que administra", YA_IMPORTADA: "la nota ya se había cargado", LIMITE_IA: "límite de uso de la IA",
  VERSION_OBSOLETA: "otra persona la cambió antes", NOTA_ILEGIBLE: "no se pudo leer la nota", TEXTO_DEMASIADO_LARGO: "texto demasiado largo",
  CAMPO_NO_PERMITIDO: "campo no permitido", IDEMPOTENCIA_CONFLICTO: "envío repetido con otros datos", IDEMPOTENCIA_REQUERIDA: "falta la clave de envío",
  ABONO_PENDIENTE: "falta el abono", SALDO_PENDIENTE: "falta pagar el saldo", SOBREPAGO: "el pago supera el saldo",
  YA_REVERTIDO: "el pago ya se había revertido", INTERNO: "error interno",
};

function valor(clave: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^[A-Z]+(_[A-Z]+)*$/.test(v) && ERRORES[v]) return ERRORES[v];
  if (clave === "estadoPago" && typeof v === "string" && VALORES[v]) return VALORES[v];
  if (typeof v === "boolean") return v ? "sí" : "no";
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
  if (n !== null) return MONTOS.has(clave) ? clp(n) : numero(n);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return fechaHora(v);
    return v.replace(UUID, "…");
  }
  if (Array.isArray(v)) return v.length === 1 ? "1 elemento" : `${numero(v.length)} elementos`;
  return detalle(v).map(([k, x]) => `${k}: ${x}`).join(", ") || "—";
}

/** Pares campo–valor legibles de un objeto del registro (antes o después). */
export function detalle(v: unknown): [string, string][] {
  if (v === null || v === undefined) return [];
  if (typeof v !== "object" || Array.isArray(v)) return [["Valor", valor("", v)]];
  return Object.entries(v as Record<string, unknown>)
    .filter(([k]) => !OCULTOS.has(k))
    .map(([k, x]) => [CAMPOS[k] ?? capital(conTildes(k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase())), valor(k, x)]);
}

/** Resumen de una línea para la tabla: hasta tres campos. */
export function resumenDetalle(v: unknown): string {
  const pares = detalle(v);
  const t = pares.slice(0, 3).map(([k, x]) => `${k}: ${x}`).join(" · ");
  return pares.length > 3 ? `${t} · …` : t;
}
