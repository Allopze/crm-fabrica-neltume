// Catálogo de permisos (SECURITY §1). Un rol es solo un conjunto de estos códigos.
export const PERMISOS = {
  "usuarios.gestionar": "Crear, desactivar y asignar roles a usuarios",
  "auditoria.ver": "Consultar el registro de auditoría y métricas",
  "catalogo.editar": "Importar el Excel y editar artículos",
  "stock.ver": "Consultar existencias y movimientos",
  "stock.mover": "Registrar entradas por producción y salidas por despacho",
  "stock.ajustar": "Registrar ajustes de stock con motivo",
  "mp.editar": "Crear y editar materias primas, unidades y BOM",
  "mp.mover": "Registrar recepciones de materias primas",
  "produccion.gestionar": "Crear, cerrar y anular órdenes de producción",
  "precios.editar": "Crear versiones de la lista de precios y recargos",
  "costos.ver": "Ver costos y márgenes",
  "cotizaciones.crear": "Crear y editar borradores de cotización",
  "cotizaciones.aprobar": "Aprobar cotizaciones y descargar su PDF",
  "descuentos.aplicar": "Aplicar descuentos con motivo",
  "pedidos.gestionar": "Crear, cancelar y despachar notas de pedido",
  "pedidos.importes.ver": "Ver precios, totales y pagos de las notas de pedido y el documento comercial de la tienda",
  "pagos.registrar": "Registrar pagos, reversos y excepciones de abono o saldo de las notas de pedido",
  "clientes.ver": "Ver clientes",
  "clientes.editar": "Crear y editar clientes",
  "config.editar": "Editar parámetros: mínimos, vigencia, recargos y proveedor de IA",
} as const;

export type Permiso = keyof typeof PERMISOS;
export const CODIGOS_PERMISO = Object.keys(PERMISOS) as Permiso[];
export const ROL_ADMIN = "administrador";

/**
 * Usuario técnico que firma lo que recibe la API de la tienda (ADR-0023 §5): inactivo (no inicia sesión), con un rol
 * sin permisos y sin contraseña utilizable. Ni se reactiva ni se le cambia la clave desde la administración.
 */
export const USUARIO_INTEGRACION = { email: "integracion-tienda@sistema.neltume", nombre: "Integración tienda", rol: "integracion" } as const;
