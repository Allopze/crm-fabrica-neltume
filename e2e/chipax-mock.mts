// Chipax simulado para E2E 19 (ADR-0021): trae una factura (tablón y flete); cuando la prueba hace POST
// /control/segunda, también otra con el mismo tablón, que debe entrar sola. Fechas de hoy en Santiago.
import { hoySantiago } from "../src/domain/precios/dias-habiles";
import { crearChipaxSimulado } from "../tests/fixtures/chipax/simulado";
import { PROVEEDOR_CHIPAX } from "./datos";

const rut = PROVEEDOR_CHIPAX.rut.replace(/\./g, "");
const base = { rut, razon: PROVEEDOR_CHIPAX.nombre, tipo: 33 };
await crearChipaxSimulado((control) => [
  { ...base, id: 1, folio: 5001, fecha: hoySantiago(), lineas: [
    { codigo: "TAB-01", nombre: "Tablón pino oregón 2x8", cantidad: 2, unidad: "M3", precio: 180000 },
    { nombre: "Flete a Panguipulli", cantidad: 1, unidad: "UN", precio: 35000 },
  ] },
  ...(control.marcas.segunda ? [{ ...base, id: 2, folio: 5002, fecha: hoySantiago(), lineas: [{ codigo: "TAB-01", nombre: "Tablón pino oregón 2x8", cantidad: 1.5, unidad: "M3", precio: 180000 }] }] : []),
], Number(process.env.E2E_CHIPAX_PUERTO));
