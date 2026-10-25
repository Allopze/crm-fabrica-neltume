# ADR-0024 — Prueba de conexión con la tienda (botón en Ajustes, en los dos sentidos)

**Estado:** aceptado (aprobado por el usuario el 25-10-2026, con D1–D3 en sus valores por defecto; Fase 21) · **Refs:** REQ-COT-8.18–8.24, REQ-ADM-3.1, REQ-NFR-7, AGENTS reglas 6, 7 y 10, SECURITY §6, T6 y T8 · **Complementa:** ADR-0023 (suma una ruta firmada y su contrato) · **Modifica:** SECURITY §6 (suma un egreso) · **Contrato:** [`docs/contratos/prueba-conexion-v1.md`](../contratos/prueba-conexion-v1.md), acordado con el agente del repo de la tienda el 25-10-2026

## Contexto

- El usuario pidió (25-10-2026) un botón en Ajustes de cada app que mande un PDF de prueba a la otra: lo que se aprieta en la fábrica se ve en la tienda, y al revés.
- Hoy la integración solo se prueba creando una nota real en la tienda, o con `npm run integracion:enviar-prueba`, que apunta a una app local. En producción ya falló una vez sin que nadie lo viera: el build no copiaba `pdf.worker.mjs` y pdfjs rechazaba todo PDF (T19.12).
- El contrato v1 va solo de la tienda a la fábrica. La fábrica no tiene ninguna ruta hacia la tienda, y la tienda no tiene ninguna que reciba de la fábrica.
- En producción la app de la fábrica **no puede llamar a internet**: `app` solo está en las redes `backend` y `datos`, ambas `internal`. Solo `worker`, `compras` y `tunnel` salen (DESIGN §4; lo comprueba `compose.test.ts`).
- Una prueba útil ejercita el mismo camino que un pedido real (firma, tamaño, PDF, base de datos) sin crear un pedido, reservar stock ni dejar nada en producción.

**Qué se reutiliza:**

| Necesidad | Lo que existe |
|---|---|
| Firma, ventana y secreto | `firmar`, `verificarFirma` y `configIntegracion` (`src/domain/integracion-tienda/firma.ts`) |
| Ruta pública firmada | Envoltura `integracion()` y su auditoría de rechazos (ADR-0023 §1–§2) |
| Validar un PDF ajeno | `decodificarBase64`, `esPdf` y `fragmentosPdf` (`documentos.ts`, `pedidos/pdf-texto.ts`) |
| PDF | react-pdf con los componentes de `src/domain/pdf/comun.tsx` |
| Servicio con salida y rol mínimo | El patrón de `compras` (ADR-0021) y del worker (ADR-0017) |
| Pantalla | Ajustes de IA (`/administracion/ia`) con el permiso `config.editar` |
| Auditoría | `registrarAuditoria` y las denegaciones anónimas agregadas (ADR-0016) |

## Decisión

### 1. Una familia de eventos nueva, aditiva y simétrica
- `POST /api/integrations/neltume/connection-tests`, la misma ruta en las dos apps; evento `connection.test` con un PDF. No sube `schemaVersion` ni toca `/orders` ni `/attachments`.
- Firma, ventana de ±300 s e idempotencia como el v1. `source` y `eventType` van dentro del cuerpo firmado y cada receptor exige el `source` de la otra parte: un mensaje capturado no sirve en el sentido contrario ni en `/orders`.
- Un intento por pulsación, sin reintentos ni bandeja: es una prueba puntual y visible.
- 2xx solo después de guardar. El receptor dice quién es (`receiver`), para que el emisor note si le contestó otra app.
- El PDF (≤ 1 MiB; más es 413) se valida como los de los pedidos: base64 canónico, sha256, `%PDF-` y que pdfjs lo abra. Así la prueba cubre justo lo que falló en T19.12. La tienda no trae pdfjs en producción y comprueba la estructura del PDF; el contrato pide «PDF íntegro» y deja el método a cada app.

### 2. Recepción (tienda → fábrica)
- Ruta bajo `src/app/api/integrations/**` con `integracion()` (cuerpo ≤ 2 MiB, solo JSON). Orden del contrato §3:
  - las comprobaciones baratas (405, 503, 415, 413), sin orden fijo entre ellas porque la envoltura se comparte con `/orders`, que ya está en producción;
  - la firma sobre los bytes crudos, antes de parsear;
  - el JSON y `schemaVersion`;
  - el esquema estricto, con `source = neltume-store` y la clave de idempotencia;
  - `factoryCode` = la fábrica;
  - el tamaño y la validez del PDF;
  - y, al final, la idempotencia.
- Guarda una fila en `prueba_conexion` (`direccion = recibida`) y su auditoría (`actor = sistema`, `origen = api`) en una sola transacción. Un candado por evento serializa los envíos simultáneos y el único (`direccion`, `event_id`) es la red de seguridad: mismo evento y contenido → 200 `duplicate`; otro contenido → 409.
- **No crea nota, reserva ni movimiento, y no toca `recepcion_tienda`.**
- Conserva las últimas 20 recibidas (D3).

### 3. Envío (fábrica → tienda)
1. El botón llama a `POST /api/v1/integracion/tienda/pruebas` (`config.editar`). La **app** genera el PDF, arma el mensaje y lo firma con el secreto (`firmar`). Deja la solicitud ya firmada en `prueba_conexion` (`direccion = enviada`, `estado = pendiente`) y la audita. Una prueba en curso a la vez: con otra de menos de 60 s, 409; una pendiente de más de 60 s es una que `enlace` no tomó, y se da por reemplazada (`vencida`) para no acumular filas ni mandar una prueba vieja junto con la nueva.
2. El servicio `enlace` (D1) toma la fila y **reenvía esos mismos bytes**. No conoce el secreto: por eso `INTEGRACION_TIENDA_*` sigue siendo solo de `app`.
   - Destino: `ENLACE_TIENDA_URL` + la ruta fija; nada de lo que haya en la fila cambia el destino, y solo se reenvían las tres cabeceras de la firma.
   - Plazo de 15 s, sin seguir redirecciones, TLS válido (HTTP solo para `localhost`, `127.0.0.1` y `[::1]`), respuesta leída hasta 64 KB.
3. Cuenta como éxito solo un 2xx con `receiver = neltume-store` y el mismo `eventId`. Cualquier otra cosa es un fallo con su diagnóstico (contrato §6). Un 2xx cuyo cuerpo no termina de llegar es un fallo de red, y lo que diga la tienda se sanea antes de guardarlo (sin caracteres de control; desfase de reloj acotado).
4. Resultados: `aceptada`, `duplicada`, `rechazada` (con el `error.code`), `sin_respuesta`, `no_configurada` o `vencida` (la firma tiene más de 4 min: no se envía, porque la tienda la rechazaría). Guarda `http_status`, `latencia_ms`, el host de destino y el desfase de reloj que se deduce de `receivedAt`, y audita el resultado (`actor = sistema`).
5. Una fila `enviando` que quedó a medias (caída del servicio) pasa a `sin_respuesta`; **nunca se reenvía sola**.
6. Si en 20 s nadie tomó la fila, la pantalla dice «el servicio de enlace no responde» (no es un fallo de la tienda).

Rutas de la app, todas con `config.editar` y `cache-control: private, no-store`:
- `GET /api/v1/integracion/tienda/pruebas`: estado de la conexión y las últimas pruebas de ambos sentidos, sin los PDF.
- `GET /api/v1/integracion/tienda/pruebas/:id`: estado de una prueba (la pantalla lo consulta cada segundo mientras espera).
- `GET /api/v1/integracion/tienda/pruebas/:id/pdf`: el PDF, en el visor (`inline`), con `x-content-type-options: nosniff`.
  - **Sin `content-security-policy: sandbox`**: aquí no aporta (el PDF es propio o verificado y va con `nosniff`) y su efecto en el visor de Safari y Firefox no está probado. En Chrome 155 no impidió abrirlo (lo probó el agente de la tienda). Los documentos de la tienda (ADR-0023 §6) siguen en descarga con `sandbox`.
  - Es un PDF que la fábrica generó o que verificó al recibirlo (base64, sha256, `%PDF-` y pdfjs), sin datos de clientes.

### 4. Pantalla
- «Conexión con la tienda» en `/administracion/tienda`, bajo Configuración y con `config.editar`.
- Tres bloques:
  - **Estado:** recepción activa o apagada (falta el secreto) y la fábrica; destino del último envío.
  - **Probar:** botón «Enviar PDF de prueba a la tienda» y el resultado con su diagnóstico. Aclara que la tienda lo verá en sus Ajustes y que no crea pedidos ni mueve stock.
  - **Últimas pruebas:** fecha (dd-mm-aaaa hh:mm), sentido, resultado, detalle y «Ver PDF».
- Los textos dicen «la tienda»; la Fase 20 los cambia junto con el resto.

### 5. El PDF de prueba
Una página A4 con el rótulo «PRUEBA DE CONEXIÓN — no es un pedido», el emisor, la fecha y hora de Chile, el código corto del evento (8 caracteres, para cruzar lo enviado con lo visto) y dos líneas de ejemplo con datos inventados. Sin precios, clientes ni nada de `datos/`.

### 6. Configuración

| Variable | Servicio | Uso |
|---|---|---|
| `INTEGRACION_TIENDA_SECRETO` | `app` | Ya existe: firma el envío y verifica la recepción |
| `ENLACE_TIENDA_URL` | `enlace` | Origen de la app de la tienda, sin ruta; https (http solo `localhost`). Vacía = `no_configurada` |
| `ENLACE_TIENDA_TIMEOUT_MS` | `enlace` | Plazo (1.000–60.000; 15.000 por omisión) |
| `DATABASE_URL_ENLACE` | `enlace` | Rol `neltume_enlace`; derivable de la URL de la app, como `compras` |

Compose: servicio `enlace` con perfil `tienda`, redes `datos` y `salida` (no `backend`) y sin puertos; se activa con `COMPOSE_PROFILES=ia,chipax,tienda`. Rol de BD `neltume_enlace`: lee y actualiza solo los campos de resultado de `prueba_conexion` e inserta en `audit_log`, sin permiso sobre ninguna secuencia. En desarrollo el servicio no carga `.env.local`: lee solo su `DATABASE_URL` para derivar el rol.

### 7. Lo que no cambia
- El contrato v1 de pedidos, `/orders` y `/attachments`.
- El secreto sigue solo en `app`.
- La fábrica no lee la base de la tienda ni comparte usuarios con ella.
- La IA no participa.

## Requisitos nuevos (propuestos para SPEC §4.1, junto a REQ-ADM-4.x)

- REQ-ADM-5.1: WHEN un usuario con `config.editar` pide una prueba de conexión THE SYSTEM SHALL generar un PDF de ejemplo sin datos de clientes ni importes, firmarlo, enviarlo a la tienda, mostrar el resultado con su diagnóstico y auditarlo; nada se crea como pedido ni mueve stock.
- REQ-ADM-5.2: WHEN la tienda envía una prueba firmada, dentro de ±300 s y con un PDF válido, THE SYSTEM SHALL guardarla, mostrarla en Ajustes a quien tenga `config.editar` y auditar la recepción; IF la firma, el esquema, el origen o el PDF no son válidos THEN THE SYSTEM SHALL rechazarla (401, 400, 413 o 422) sin guardar nada y auditar el rechazo sin secretos.
- REQ-ADM-5.3: THE SYSTEM SHALL conservar las últimas 20 pruebas de cada sentido y mostrar su PDF solo a quien tenga `config.editar`; WHEN llega la misma prueba otra vez THE SYSTEM SHALL responder éxito sin duplicarla.
- REQ-ADM-5.4: IF el servicio de enlace no responde, la tienda no está configurada o la tienda rechaza la prueba THEN THE SYSTEM SHALL decir cuál es la causa y no afectar al resto de la aplicación.

## Decisiones (aprobadas el 25-10-2026, con su valor por defecto entre paréntesis)

- **D1 — Cómo sale la fábrica hacia la tienda** (servicio `enlace`).
  - Por defecto: un servicio nuevo con salida, el patrón de `compras`. Reenvía lo que la app firmó y no conoce el secreto.
  - Alternativa A: poner `app` en la red `salida`. Es una tarea menos, pero cambia SECURITY §6 y rompe la prueba de Compose «db y app solo están en redes internas», y deja con salida a internet al proceso que lee PDF ajenos con pdfjs.
  - Alternativa B: que la tienda recoja las pruebas de la fábrica. No abre ninguna salida, pero la prueba tarda lo que tarde el sondeo de la tienda y el contrato crece con «recoger» y «confirmar».
- **D2 — Un secreto para los dos sentidos** (el mismo que ya comparten).
  - Seguro porque `source`, `eventType` y la ruta separan los sentidos, y cada receptor valida el esquema antes de usar el mensaje.
  - Alternativa: un secreto por sentido. Es una variable más en cada app, y cada una tendría que probarse por separado.
- **D3 — Qué se conserva** (las últimas 20 pruebas por sentido, con su PDF).
  - Se cuentan las 20 más recientes del sentido, incluida la que se acaba de insertar; las anteriores se borran, salvo las que esperan o se están enviando. La auditoría conserva para siempre quién probó y cuándo.
  - Alternativa: conservar solo el resultado, sin PDF.

## Pendientes (no bloquean)

- **P1 (resuelto el 25-10-2026):** la URL de la tienda es `https://cotizador.puertasneltume.cl`, la de `ENLACE_TIENDA_URL`. La tienda debe tener ese hostname en su `NELTUME_HOSTS`: si no, responde 403 a la fábrica.
- **P2 (resuelto el 25-10-2026):** el usuario confirmó que la tienda **no** está detrás de Cloudflare Access, aunque su README lo describe como una opción. No hace falta una regla Bypass ni un service token. Si algún día se activa Access, `/api/integrations/*` necesitaría un Bypass (la protege la firma) o un service token que `enlace` enviaría (`CF-Access-Client-Id` y `CF-Access-Client-Secret`); sin eso, la pantalla diría «redirección inesperada (¿Cloudflare Access?)». La fábrica tampoco tiene Access (ADR-0010).
- **P3:** ninguna app filtra `/api/integrations/*` por IP. Si el usuario quiere filtrar, es una regla de Cloudflare con la IP de salida del otro lado.
- **P4:** en desarrollo, fábrica en `http://localhost:3000` y tienda en `http://127.0.0.1:3001` (con `127.0.0.1` y no `localhost`: el `next dev` de la tienda escucha solo en IPv4).

## Cambios en documentos (hechos en la Fase 21, T21.0)

| Documento | Cambio |
|---|---|
| AGENTS.md | Canales de entrada: suma «y la prueba de conexión firmada (ADR-0024)» |
| SPEC | REQ-ADM-5.1–5.4 nuevos (enviar y recibir la prueba, conservarlas, avisar si no hay enlace); NC-17 |
| API | «Integraciones»: la ruta nueva y sus rutas de la app |
| SECURITY | §6: ruta pública nueva y egreso de `enlace`; T6 con el evento nuevo; T12 «abuso de la ruta de prueba» (tope de 2 MiB, PDF verificado, retención); matriz de permisos |
| DATA-MODEL | `prueba_conexion` y el rol `neltume_enlace` |
| DESIGN | §4: servicio `enlace`, «solo `borde` y `salida` (worker, compras y enlace) tienen egreso» y el flujo del envío |
| UX | Pantalla «Conexión con la tienda» |
| TESTING | `I conexion-tienda`, `I enlace-tienda`, E2E `22-conexion-tienda` y `compose.test` |
| RUNBOOK, `.env.example`, Compose | Variables de §6, perfil `tienda`, prueba cruzada y qué hacer ante cada diagnóstico |
| ADR-0023 | Anotado «complementado por ADR-0024» |

## Fase 21 (en TASKS.md)

Ver el detalle en TASKS.md. En resumen: documentos, migración y rol, dominio, ruta de recepción, rutas de la app, servicio `enlace`, pantalla y E2E con una tienda falsa. La puesta en marcha (URL de la tienda, perfil `tienda`, prueba cruzada) queda fuera del código.

## Consecuencias

- \+ El usuario comprueba la integración sin crear un pedido, en los dos sentidos, y ve por qué falla cuando falla.
- \+ Si el PDF no se puede abrir en producción (como en T19.12), la prueba lo muestra al instante.
- \+ `enlace` deja listo el camino para avisar a la tienda del estado de sus notas (hoy «Abierto» en su contrato, §8) sin abrir salida desde `app`.
- − Un servicio más en Compose y un rol de BD más.
- − Una ruta pública más sin sesión. Se mitiga con firma, tope de 2 MiB, PDF verificado, retención y auditoría.
- − El contrato nuevo se versiona en dos repos: un cambio exige coordinarlos.

## Alternativas

- **Probar con una cotización real:** hay que crearla y aprobarla, y deja una nota en producción. Descartado.
- **Mandar un pedido de prueba por `/orders`:** crearía una nota y reservaría stock. Descartado.
- **Un «ping» sin PDF:** no ejercita pdfjs, el tamaño ni la base, que es lo que falló en T19.12. Descartado.
- **Que el navegador envíe a la tienda:** expondría el secreto y chocaría con CORS. Descartado.
