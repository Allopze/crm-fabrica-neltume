// Error de la API de la tienda, con su estado HTTP y el código del contrato (`error.code`). Va en un módulo aparte para
// que el dominio puro (firma, esquemas, PDF de prueba) lo use sin arrastrar la lógica de pedidos de `nota.ts`.
export class ErrorIntegracion extends Error {
  constructor(public readonly http: number, public readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "ErrorIntegracion";
  }
}
