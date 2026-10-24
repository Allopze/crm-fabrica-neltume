// Envía una nota de pedido de PRUEBA, firmada como la tienda, a la app de la fábrica (ADR-0023, T19.10). Sirve para
// probar la integración en desarrollo sin el cotizador de la tienda. Datos inventados; nunca apuntar a producción.
// Uso: npm run integracion:enviar-prueba -- [url-base] [n.º de nota]   (por omisión http://localhost:3000 y 9001)
import { claveDe, mensajeListo, cabecerasFirmadas } from "../tests/fixtures/tienda/mensaje";

const base = process.argv[2] ?? "http://localhost:3000";
const numero = process.argv[3] ?? "9001";
const secreto = process.env.INTEGRACION_TIENDA_SECRETO;
if (!secreto) {
  console.error("Falta INTEGRACION_TIENDA_SECRETO en .env.local (el mismo que usa la app).");
  process.exit(1);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error("Solo se envían pruebas a una app local (http://localhost…).");
  process.exit(1);
}
const m = await mensajeListo({ numero });
const cuerpo = new TextEncoder().encode(JSON.stringify(m));
const res = await fetch(`${base}/api/integrations/neltume/orders`, { method: "POST", body: cuerpo, headers: cabecerasFirmadas(cuerpo, claveDe(m), { secreto }) });
console.log(res.status, await res.text());
