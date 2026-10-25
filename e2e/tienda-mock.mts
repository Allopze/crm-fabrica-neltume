// Tienda simulada para E2E 22 (ADR-0024): recibe las pruebas de conexión que envía el servicio de enlace, verifica la firma
// como la ruta real de la tienda y responde según el modo que fije la prueba con POST /control. Nunca se llama a la tienda real.
import { crearTiendaSimulada } from "../tests/fixtures/tienda/simulada";

await crearTiendaSimulada({ puerto: Number(process.env.E2E_TIENDA_PUERTO) });
