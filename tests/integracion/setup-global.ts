import { recrearBaseDePrueba } from "../bd-de-prueba";

// TESTING §4: la BD de integración se recrea desde las migraciones al inicio de la capa.
export default async function setup() {
  await recrearBaseDePrueba("neltume_test");
}
