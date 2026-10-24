# README.md — Qué es este proyecto y cómo trabajar en él

Webapp **interna** de la fábrica de puertas Neltume (no de la tienda). Une en un solo lugar:

- Catálogo y **stock de puertas** (movimientos inmutables; el saldo es la suma de movimientos).
- **Materias primas** con receta/BOM por modelo y órdenes de **producción**.
- **Cotizador con IA**: se pega el pedido del cliente en lenguaje natural y el sistema propone ítems del catálogo, calcula precios desde la lista y deja lo dudoso "por confirmar" para revisión humana.
- **Nota de pedido**: conversión de una cotización aprobada (o del PDF que manda la tienda) en pedido, con reserva de stock, producción del faltante y despacho.

Un solo rol hoy (`administrador`, que hace todo y ve costos y márgenes) con **autorización por permiso**, pensada para sumar perfiles sin refactor. El único canal de entrada es esta webapp (no hay correo, webhooks ni portal de clientes).

Español en UI y documentos; CLP como enteros; precios con y sin IVA (19 %); números y fechas en formato chileno (1.234,56 · dd-mm-aaaa). El contrato de trabajo del proyecto (reglas, "terminado significa", qué no tocar) está en `AGENTS.md`: léelo antes de tocar código.

## Stack

| Pieza | Elección | ADR |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript estricto | ADR-0005 |
| Estilos | Tailwind v4 + variables CSS semánticas (`src/app/globals.css`), lucide-react | — |
| BD | PostgreSQL + Drizzle ORM (esquema en `src/db/esquema/`) | ADR-0005 |
| Validación | Zod estricto (`strictObject`; campos de importe se rechazan en la entrada) | API.md |
| Sesiones | Propias, cookie HttpOnly + CSRF; contraseñas argon2id | ADR-0005 |
| PDF | `@react-pdf/renderer`; lectura de PDFs con `pdfjs-dist` (solo texto) | ADR-0004, ADR-0008 |
| IA | Command Code detrás de una interfaz agnóstica en `src/ai/`; cola en la BD | ADR-0001, ADR-0006, ADR-0009, ADR-0022 |
| Pruebas | Vitest (unit + integración) y Playwright (E2E secuencial) | TESTING.md |
| Producción | Docker Compose + Cloudflare Tunnel (sin proxy; ningún puerto publicado) | ADR-0010, ADR-0011 |

Node 24 (`.nvmrc`) y npm ≥ 11.

## Arquitectura en una imagen

```
Navegador → Cloudflare → túnel (cloudflared, saliente) → app (Next.js: UI + /api/v1) → PostgreSQL
                                                          worker (src/ai/worker.ts) ─┘   ↑
                                                          Command Code         ← ────────┘
```

- **app**: páginas y route handlers `/api/v1`. No tiene claves del LLM.
- **worker** (perfil `ia` de Compose): toma trabajos de la cola `trabajo_ia` (`FOR UPDATE SKIP LOCKED`), llama al LLM y guarda la propuesta. Es el único servicio que recibe `CMD_API_KEY` y usa un rol de BD con permisos mínimos.
- **db**: única fuente de verdad, con triggers de inmutabilidad y la vista `v_stock`.
- **tunnel / backup**: única entrada desde internet y `pg_dump` diario con copia externa.

Detalle completo en `DESIGN.md`.

## Reglas de dominio que no se negocian

Antes de tocar el cotizador, el stock o los precios, estas reglas se cumplen siempre (cada una con test):

1. **La IA no inventa precios, productos ni stock.** El esquema de salida no tiene campos de importe ni descuento (`src/ai/esquema.ts`, `additionalProperties: false`); los precios, el IVA y los totales los calcula `src/domain/precios/calcular.ts` desde la BD. Un monto escrito en el texto ("$50.000") nunca llega a una cotización.
2. **Solo hay certeza si código y medida coinciden exactamente con una fila de la BD.** Todo lo demás queda `por_confirmar` (visible, sin precio, no aprobable) o `a_pedido` con precio de referencia del rango/altura superior, que una persona fija. Nunca se completa en silencio.
3. **Los movimientos de inventario son inmutables.** El saldo no se guarda: es la vista `v_stock` (suma de movimientos). Corregir = movimiento de ajuste con motivo. Se reserva al pasar a nota de pedido; si falta stock se cotiza igual con aviso.
4. **Toda cotización guarda** texto original, interpretación de la IA, ítems finales, versión de lista usada y quién aprobó/modificó. Los precios quedan congelados al aprobar (triggers de solo lectura).
5. **Toda mutación se audita** en `audit_log` (misma transacción; también denegaciones y errores) y los POST sensibles exigen `Idempotency-Key`.
6. **Datos personales al mínimo**: RUT, correo y teléfono se enmascaran antes de enviar el texto al LLM; nunca se envían nombre ni datos del cliente.
7. **Sin aprobación humana no hay PDF ni salida.** Un descuento es una excepción manual con motivo, auditada; la IA nunca lo decide.
8. **Autorización en el backend**: cada endpoint declara su permiso en `conPermiso` (denegado por defecto); la UI solo oculta.

## Mapa del código

```
src/app/            Páginas y rutas API (App Router)
  (auth)/login      Login (público)
  (app)/            Área con sesión: panel, cotizaciones, pedidos, stock, materias-primas,
                    producción, precios, clientes, administración (usuarios, auditoría,
                    métricas IA, feriados, ajustes de IA)
  api/v1/**/route.ts  ~60 endpoints; todos envueltos en conPermiso/publico
src/domain/         Lógica del negocio (la mayor parte de la app)
  auth/             politica.ts (conPermiso, CSRF, idempotencia, formato de error),
                    sesiones, permisos (18 códigos), password (argon2id)
  cotizaciones/     mapear (IA → catálogo), anclaje/correcciones (verificación contra el
                    texto), calculo, edicion, aprobacion, manual, accesorios, alias
  precios/          calcular (redondeo a peso entero, IVA), listas versionadas,
                    feriados de Chile calculados por ley, dias-habiles
  pedidos/          pedidos, reserva (repartirReserva), ciclo, completar, nota-tienda
  stock.ts bom.ts ordenes.ts materias-primas.ts alertas.ts … (escrituras con auditoría)
  pdf/              Cotización y nota de pedido (react-pdf)
  importacion/      Lector/mapeador del Excel del cotizador y carga transaccional
src/ai/             Único módulo que habla con el LLM
  interfaz.ts       Contrato InterpreteIA + tipos de error
  proveedores/      commandcode.ts (herramienta forzada proponer_items)
  esquema.ts        Esquema Zod estricto de la salida (sin importes)
  prompt.ts revision.ts reintentos.ts redaccion.ts (enmascarado) procesar.ts worker.ts
  doble.ts          Doble determinista para tests (LLM_PROVEEDOR=doble)
  ajustes.ts catalogos.ts costo-estimado.ts evaluacion.ts
src/db/             Drizzle: esquema/ (5 archivos, ~37 tablas), migraciones/ (0000–0018),
                    conexion.ts (bd(), Tx), migrar.ts (grants + triggers), semilla.ts
src/components/     shell/ (navegación, sesión) y ui/ (base, tabla, estados, niveles de stock)
src/lib/            formato.ts (CLP, fechas), api-cliente.ts (fetch con CSRF e idempotencia),
                    registro.ts (logs JSON con redacción), marca.ts
scripts/            dev.mts, db-setup.mts, migrar.mts, crear-admin.mts, preparar-demo.mts,
                    cargar-bom-real.mts, eval-ia.mts, deploy.sh, backup.sh, …
tests/integracion/  ~40 tests con PostgreSQL real (una BD por archivo; plantilla migrada)
e2e/                17 suites Playwright secuenciales con estado compartido
eval/               casos.json (62 casos) e informes de `eval:ia` con el modelo real
docs/adr/           ADR-0001…0018 (decisiones; se leen antes de cambiar diseño)
datos/              Excel real del cotizador: solo lectura, fuera de git (no copiar sus
                    costos ni márgenes a docs, fixtures ni logs)
referencia/         Cotizador de la tienda (proyecto aparte, solo lectura, fuera de git)
```

Convenciones del código: identificadores y mensajes en español; alias `@/* → src/*`; los route handlers validan con Zod, abren `bd().transaction(...)` y llaman funciones de `src/domain` que escriben su fila de auditoría en la misma transacción. No hay `middleware.ts`: el guard es por página (`requerirSesion()`) y por endpoint (`conPermiso`). Archivos: ideal ≤ 300 líneas, límite duro 500.

## Cómo funciona el cotizador (flujo real)

1. `POST /cotizaciones/interpretaciones` guarda el texto (≤ 4.000 caracteres) como borrador `interpretando` y encola un `trabajo_ia` (202 con el id).
2. La UI hace polling; el worker toma el trabajo, enmascara RUT/correo/teléfono/URL (`src/ai/redaccion.ts`) y llama al LLM con el catálogo resumido (sin precios ni stock) y la herramienta forzada `proponer_items`.
3. La salida se valida con Zod estricto; luego corre el pipeline determinista: correcciones contra la línea literal, anclaje de cifras y medidas al texto, segunda pasada si la IA omitió fragmentos, y mapeo al catálogo (`ok` / `a_pedido` / `por_confirmar`).
4. El backend calcula precio de lista + recargo por tipo, redondea a peso, y arma subtotal/IVA/total. La revisión muestra el texto original al lado de los ítems.
5. Al aprobar (sin pendientes) se congelan precios y vigencia (10 días hábiles por defecto, feriados de Chile calculados por ley) y se habilita el PDF. Si el LLM falla, el borrador queda `ia_fallida` y sigue disponible la cotización manual.

Timeout por intento 12 s; reintentos acotados solo ante error transitorio (1 s y 3 s; respeta `Retry-After` hasta 30 s); topes diarios `LLM_TOPE_DIARIO_USD` y `LLM_TOPE_DIARIO_LLAMADAS`; alerta al 80 % del presupuesto mensual. Detalle en `AI.md`.

## Levantarlo en desarrollo

Requisitos: Node 24 y PostgreSQL local (p. ej. Postgres.app en `localhost:5432`).

```bash
npm install
cp .env.example .env.local          # completa DATABASE_ADMIN_URL, DATABASE_URL_OWNER y DATABASE_URL
cp .env.worker.example .env.worker.local   # claves de IA (solo el worker y eval:ia leen este archivo)
npm run db:setup                    # crea roles neltume_owner/neltume_app/neltume_worker y las bases dev/test/e2e
npm run crear-admin                 # primer usuario (la contraseña se pide por consola)
npm run dev                         # migra, levanta la app en :3000 y el worker
```

Con el doble determinista no necesitas proveedor: `LLM_PROVEEDOR=doble` hace que el worker responda según `tests/fixtures/ia-respuestas.json` (reconoce, por ejemplo, "simular IA caída"). Para el modelo real se elige proveedor y modelo en **Ajustes de IA** (`/administracion/ia`). Datos de demo: `npm run demo:preparar` (importa el Excel real, clientes ficticios, BOM demo y stock inicial; idempotente).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Migra la BD y levanta Next + worker con recarga |
| `npm test` | Suite completa: `lint → typecheck → unit → integración → E2E` (se corre entera, sin filtros) |
| `npm run lint` · `npm run typecheck` | ESLint (`--max-warnings=0`) · `next typegen && tsc --noEmit` |
| `npm run db:setup` · `db:migrar` · `db:generar` | Roles y bases · aplica migraciones + permisos · genera SQL desde el esquema |
| `npm run crear-admin` | Crea el primer usuario por consola |
| `npm run demo:preparar` | Deja el entorno de demo listo (idempotente) |
| `npm run eval:ia` | Evalúa el intérprete con el **modelo real** (no es parte de `npm test`); escribe informe en `eval/informes/` |
| `npm run worker` | Worker suelto (lee `.env.worker.local`) |
| `npm run integracion:enviar-prueba` | Envía una nota de la tienda de prueba, firmada, a la app local (ADR-0023, RUNBOOK §8) |
| `npm run build` · `npm run deploy` | Build de producción · despliegue por SSH + Compose (RUNBOOK §2) |

## Pruebas

- **Unit** (`src/**/*.test.ts`, Vitest): lógica pura de `src/domain` y `src/ai`. **Integración** (`tests/integracion/`): route handlers contra PostgreSQL real, una BD por archivo creada desde una plantilla migrada; el LLM se sustituye por `src/ai/doble.ts` (`procesarSiguiente(new DobleIA())`).
- **E2E** (`e2e/NN-*.spec.ts`, Playwright): 17 suites **secuenciales con estado compartido** (1 worker, orden por nombre); levantan su propio `next dev` (:3200, `NEXT_DIST_DIR=.next-e2e`), el worker (:3201) y un **Command Code simulado** (:3202). Nunca ejecutar una suite suelta.
- **Estructurales** (en integración): toda ruta exporta handlers con `conPermiso`/`publico`, no existen `/webhooks`, ningún archivo supera 500 líneas, Compose no publica puertos, escaneo de secretos.
- `eval:ia` llama al proveedor real y **no** forma parte de `npm test`; sus umbrales (≥ 90 % de acierto exacto, 100 % sin sobrantes, p90 ≤ 15 s, ≤ US$ 0,10 por cotización) son orientativos y no habilitan envío automático.

Regla: un test que falla no se marca `skip`/`only`; se arregla o se propone cambiar la especificación (SPEC/DESIGN/ADR) y se espera aprobación.

## Documentación del proyecto

| Archivo | Contenido |
|---|---|
| `AGENTS.md` | Contrato de trabajo: reglas, comandos, estructura, "terminado significa", qué no tocar (incluye reglas para agentes de IA; `CLAUDE.md` apunta aquí) |
| `SPEC.md` | Qué y por qué: objetivos, alcance demo/producto, historias con IDs `REQ-<MÓDULO>-n.m` |
| `DESIGN.md` | Arquitectura, servicios Compose, flujo del cotizador, errores/cola/observabilidad, respaldos |
| `AI.md` | Uso del LLM: esquema, pipeline, límites, costos, evaluación |
| `API.md` | Contratos HTTP: convenciones, errores y todos los endpoints |
| `DATA-MODEL.md` | Tablas, tipos de movimiento, cálculo de una línea e importación del Excel |
| `SECURITY.md` | Permisos, auditoría, datos personales, amenazas (T1–T9) y exposición de red |
| `UX.md` | Pantallas, estados comunes y la revisión lado a lado |
| `TESTING.md` | Pirámide, suites E2E, datos semilla y trazabilidad REQ → tests |
| `TASKS.md` | Plan por fases con checkpoints de revisión humana |
| `RUNBOOK.md` | Operación: dev, producción, túnel, respaldos, incidentes y guion de demo |
| `PRODUCT.md` | Ficha de producto (contexto, usuarios, principios) para trabajo de interfaz |
| `docs/adr/` | Decisiones de arquitectura ADR-0001…0018 |

Nota: `docs/PLAN.md` es un borrador obsoleto que contradice la guía vigente; si difiere, manda `AGENTS.md`.

## Reglas de convivencia con el repo

- `datos/` y `referencia/` son **solo lectura**, fuera de git; nunca copiar costos, márgenes ni datos privados a documentación, fixtures, logs ni ejemplos.
- No hay secretos en el repo ni en docs: `.env` y `.env.worker.local` están ignorados; `.env.example` solo lleva nombres.
- Las migraciones ya aplicadas no se editan: se crea una nueva (`npm run db:generar` genera el SQL desde `src/db/esquema/`; las migraciones de solo triggers/vistas se escriben a mano).
- `audit_log`, `movimiento` y `precio` son de solo inserción (triggers + grants); no se editan filas ni se toca el saldo directamente.
- El código de aplicación avanza **una fase de TASKS.md a la vez**, citando los `REQ` que cubre y deteniéndose en cada checkpoint; un cambio de requisito o decisión se propone en SPEC/DESIGN/AI/ADR antes de implementarlo.
- Producción: `docker compose up -d --build` (servicio `migrar` incluido) y el worker de IA con `COMPOSE_PROFILES=ia`; guía completa en `RUNBOOK.md`.
