import { recrearBaseDePrueba } from "../tests/bd-de-prueba";

// TESTING §4: la BD de E2E se recrea al inicio; las suites comparten su estado en orden.
export default async function setup() {
  await recrearBaseDePrueba("neltume_e2e");
}
