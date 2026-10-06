# TASKS.md — Plan de implementación

Formato: `- [ ] ID (min) Tarea · Refs · Test · Dep · [P]` (paralelizable). Cada tarea dura ≤ 90 min. Al final de cada fase hay un **checkpoint de revisión humana**: me detengo y espero tu OK. "Test" nombra la prueba de TESTING.md que la valida. Ninguna tarea se da por terminada sin `npm test` verde (AGENTS.md).

## Fase UI — Prototipo navegable (pedido por el usuario antes de la Fase 0)

Solo interfaz con datos simulados (precios ficticios, nunca los del Excel); sin BD, auth ni IA reales. Valida UX.md antes de construir la lógica; sus pantallas se reutilizan en la Fase 1.

- [x] TU.1 (60) Proyecto Next.js + Tailwind, sistema de diseño (tokens, tipografías, componentes base) · UX §2 · `npm run build` y `npm run lint` verdes · —
- [x] TU.2 (75) Shell (navegación lateral, barra superior), login y panel de inicio · UX §1 · revisión visual · TU.1
- [x] TU.3 (90) Cotizador: nueva, revisión lado a lado (pantalla clave), aprobada y vista del PDF · UX §3 · revisión visual · TU.2
- [x] TU.4 (90) Stock, materias primas, producción y BOM · UX §1, §4 · revisión visual · TU.2 · [P]
- [x] TU.5 (75) Pedidos, precios e importación, clientes, administración y auditoría · UX §1 · revisión visual · TU.2 · [P]

**Checkpoint UI:** recorrido del prototipo contigo. Espero tu OK antes de la Fase 0.

## Fase 0 — Esqueleto que camina

- [x] T0.1 (60) Proyecto Next.js + TS con npm, estructura de AGENTS.md, ESLint y versiones fijadas con lockfile · ADR-0005 · `npm run lint` y `npm run build` verdes · — 
- [x] T0.2 (45) Vitest y Playwright (`workers:1`, `fullyParallel:false`); `npm test` = lint → unit → integración → e2e, con un test trivial por nivel · TESTING §1 · `npm test` verde · T0.1
- [x] T0.3 (75) Dockerfile multi-target (`app`, `worker`) y `docker-compose.yml` con db, app, worker, proxy, tunnel, backup y redes internas; `.env.example` descrito sin valores · DESIGN §4, SECURITY §6 · chequeo "sin puertos 0.0.0.0" · T0.1 · [P]
- [x] T0.4 (45) Entorno local sobre Postgres instalado: `npm run db:setup` (roles y BD), `npm run dev` (migra + semilla + app) y recreación de las BD de test al inicio de `npm test` · TESTING §4 · `npm test` contra Postgres local · T0.2
- [x] T0.5 (75) Drizzle y migración base: `permiso`, `rol`, `rol_permiso`, `usuario`, `sesion`, `intento_login`, `audit_log`, `idempotencia`; triggers solo-INSERT y grants del rol de la app · REQ-ADM-3.3 · I `audit.trigger` · T0.4
- [x] T0.6 (45) Semilla de los 18 permisos y del rol `administrador`; `npm run crear-admin` (contraseña por consola) · REQ-ADM-2.2 · I `usuarios.semilla` · T0.5
- [x] T0.7 (90) Sesiones propias en BD (ADR-0005), argon2id, sesión de 8 h, logout, límite de 5 intentos/15 min y auditoría de login · REQ-ADM-1.1–1.3, SECURITY T7 · I `auth.login` · T0.6
- [x] T0.8 (75) `conPermiso` y `publico`, CSRF, formato de error único, `correlacion_id` y 404 ante falta de lectura · REQ-ADM-2.2, 2.3, API §1–2 · I `politica` · T0.7
- [x] T0.9 (60) `registrarAuditoria` en la misma transacción, incluidas las denegaciones · REQ-ADM-3.1, 3.5 · I `audit.denegaciones` · T0.8
- [x] T0.10 (45) Middleware de `Idempotency-Key` (24 h, 422 si el cuerpo es distinto) · API §1 · I `idempotencia` · T0.8 · [P]
- [x] T0.11 (45) Logger JSON con redacción de cabeceras y datos de cliente · SECURITY T5 · U `logger` · T0.1 · [P]
- [x] T0.12 (60) Chequeos estructurales: rutas con `conPermiso`, sin `/webhooks`, archivos ≤ 500 líneas, escaneo de secretos, puertos de Compose · AGENTS, SECURITY §2, REQ-NFR-7 · I `estructura` · T0.8
- [x] T0.13 (60) Usuarios y roles: API y UI (crear, desactivar, permisos, último admin) · REQ-ADM-2.1–2.4 · I `usuarios` · T0.9
- [x] T0.14 (75) Layout, navegación, login y estados comunes (vacío, carga, error, sin permiso, sin conexión, conflicto) · UX §1–2, REQ-NFR-6 · E `02-login-roles` (parcial) · T0.7 · [P]
- [x] T0.15 (45) Caddyfile, `/salud`, healthchecks y runbook de túnel + Cloudflare Access (sin secretos) · SECURITY §6, DESIGN §5 · I `salud` · T0.3 · [P]

**Checkpoint F0:** `docker compose up -d` levanta todo, el login funciona, una denegación se audita y `npm test` está verde. Espero tu OK.

## Fase 1 — Demo (todas las historias P1)

### Catálogo, precios e importación
- [x] T1.1 (60) Migración del catálogo: `modelo`, `madera`, `rango_ancho`, `alto`, `tipo_puerta`, `articulo`, `bodega`, `parametro`, `feriado` · DATA-MODEL §2 · I `migraciones` · T0.5
- [x] T1.2 (45) Migración de precios: `lista_precio`, `precio`, `recargo_tipo` · REQ-COT-1.1 · I `migraciones` · T1.1
- [x] T1.3 (60) Fixtures `cotizador-mini.xlsx` y `-v2` (anónimos, 1 fila inválida) · TESTING §4 · usados por E 01 y 10 · — · [P]
- [x] T1.4 (75) Importador, parte 1: lectura y mapeo de `Categorias` con normalización de tildes · REQ-STK-1.4, DESIGN C3 · U `importar.mapeo` · T1.1, T1.3
- [x] T1.5 (90) Importador, parte 2: `Precio` → artículos y lista versionada, rechazos por fila, idempotencia por hash, recargos al 0 % · REQ-STK-1.1–1.3, REQ-COT-1.1 · I `importacion` · T1.2, T1.4
- [x] T1.6 (60) POST `/importaciones` y UI de importación con informe · REQ-STK-1.1, 1.5 · E `01-seed-importacion` · T1.5
- [x] T1.7 (60) `formato.cl`: CLP, números y fechas · REQ-STK-2.3, REQ-NFR-9 · U `formato.cl` · T0.1 · [P]
- [x] T1.8 (60) `precios.calcular`: unitario redondeado, línea, subtotal, descuento, IVA y total · REQ-COT-1.2, 1.3, 2.2 · U `precios.calcular` · T1.2 · [P]
- [x] T1.9 (45) Días hábiles con `feriado` y cálculo de vigencia · REQ-COT-6.4 · U `vigencia.dias-habiles` · T1.1 · [P]
- [x] T1.10 (75) API y UI de listas de precio: versiones, edición que crea versión, recargos, `costos.ver` · REQ-COT-1.1, 1.4, 1.5 · I `listas-precio` · T1.8

### Stock de puertas
- [x] T1.11 (60) Migración `movimiento`: trigger inmutable, CHECKs y vista `v_stock` · ADR-0002, REQ-STK-5.3 · I `movimiento.trigger` · T1.1
- [x] T1.12 (45) Dominio de stock: existencia, reservado, disponible y regla de no negativo · REQ-STK-2.1, 4.2 · U `stock.calculo` · T1.11
- [x] T1.13 (75) API de entradas, salidas y ajustes con idempotencia · REQ-STK-3.x, 4.x, 5.x · I `movimientos.*` · T1.12, T0.10
- [x] T1.14 (75) UI de consulta de stock con filtros, detalle con movimientos y formularios · REQ-STK-2.x · E `05-stock-movimientos` · T1.13, T1.7

### Materias primas y producción
- [x] T1.15 (45) Migración `unidad`, `materia_prima`, `bom`, `bom_linea`, `orden_produccion`, `orden_linea` · DATA-MODEL §2 · I `migraciones` · T1.11
- [x] T1.16 (75) API y UI de materias primas y recepción · REQ-MP-1.x, 2.x · E `03-materias-primas-recepcion` · T1.15 · [P]
- [x] T1.17 (60) API y UI de BOM con vigencia y origen; semilla de 3 BOM demo · REQ-MP-3.x · I `bom` · T1.15 · [P]
- [x] T1.18 (90) Órdenes: crear y cerrar (consumo + entrada atómica e idempotente; sin BOM o faltantes → 409) · REQ-MP-4.x · I `produccion.cierre` · T1.17, T1.13
- [x] T1.19 (60) UI de órdenes con vista previa de consumos y etiqueta DEMO · REQ-MP-4.1 · E `04-produccion-entrada` · T1.18

### Clientes
- [x] T1.20 (75) Migración, validación de RUT, API y UI de clientes · REQ-COT-9.x · U `rut`, I `clientes` · T0.9 · [P]

### Cotizador
- [x] T1.21 (60) Migración `cotizacion`, `cotizacion_item`, `trabajo_ia`, `llamada_ia` y trigger de solo lectura tras aprobar · DATA-MODEL §2 · I `cotizacion.inmutable` · T1.2
- [x] T1.22 (60) `src/ai`: interfaz, esquema Zod estricto y `redaccion` (RUT, correo, teléfono, URL) · REQ-COT-2.8, 2.9, REQ-NFR-5 · U `esquema`, `redaccion` · T0.1 · [P]
- [x] T1.23 (45) Doble del LLM y `ia-respuestas.json` (válido, dudas, timeout, 500, inválido, sin ZDR, injection) · AI §5, TESTING §2 · U `doble` · T1.22
- [x] T1.24 (90) Proveedor Command Code: chat/completions con herramienta forzada, `x-cmd-zdr`, timeout, reintentos y costo · ADR-0001 · U con HTTP simulado · T1.22
- [x] T1.25 (45) `normalizar` y `mapear` (exacto, `por_confirmar`, `a_pedido` con referencia superior) · REQ-COT-2.3–2.5 · U `mapear` · T1.1 · [P]
- [x] T1.26 (90) Worker: cola con SKIP LOCKED, estados, reintentos, recuperación tras 60 s, topes de costo y registro en `llamada_ia` · ADR-0006, REQ-COT-2.7 · I `worker.reintentos` · T1.21, T1.23, T1.25
- [x] T1.27 (60) API de interpretaciones (202, límite 429, texto ≤ 4.000) y GET de cotización con avisos de stock · REQ-COT-2.1, 2.2, 2.6, 2.10 · I `interpretacion`, `interpretacion.privacidad` · T1.26, T1.12
- [x] T1.28 (75) UI nueva cotización con polling, estado `ia_fallida` y "Cotizar a mano" · REQ-COT-2.7 · E `13-ia-caida-manual` · T1.27, T0.14
- [x] T1.29 (90) UI de revisión lado a lado con resaltado del texto fuente, alertas e ítems `por_confirmar`/`a_pedido` · REQ-COT-3.1, UX §3 · E `06-cotizacion-lenguaje-natural` · T1.28
- [x] T1.30 (75) API de ítems (agregar, editar, eliminar, fijar precio `a_pedido`) con versión optimista y recálculo auditado · REQ-COT-3.2–3.4 · I `cotizacion.items` · T1.27, T1.8
- [x] T1.31 (60) Cotización manual (API y UI) con el mismo cálculo · REQ-COT-5.x · U igualdad IA/manual · T1.30
- [x] T1.32 (60) Aprobar: bloqueo si hay pendientes, congelado, vigencia y aprobador · REQ-COT-4.1, 4.4, 4.5, 6.1, 6.2, 6.5 · I `aprobar` · T1.30, T1.9
- [x] T1.33 (90) PDF de cotización (logo, totales, vigencia, "flete aparte") · ADR-0004, REQ-COT-4.2, 4.3, 4.5 · U `pdf.contenido`, I `pdf` · T1.32
- [x] T1.34 (45) Banner de lista desactualizada y "Recalcular" · REQ-COT-6.3 · E `10-precios-congelados` · T1.30, T1.10

### Pedidos y reservas
- [x] T1.35 (45) Migración `nota_pedido` y `pedido_item` · DATA-MODEL §2 · I `migraciones` · T1.21
- [x] T1.36 (90) Dominio y API de pedidos: crear desde una cotización aprobada y vigente, reservar lo disponible, marcar faltante, cancelar y liberar · REQ-STK-7.x, REQ-COT-8.x · U `reserva`, I `pedidos` · T1.35, T1.13, T1.32
- [x] T1.37 (75) UI de pedidos y PDF de nota de pedido · REQ-COT-8.1 · E `09-pedido-reserva` · T1.36, T1.33

### Auditoría, panel y E2E
- [x] T1.38 (60) API y UI de auditoría con filtros y paginación · REQ-ADM-3.2, 3.4 · E `14-auditoria` · T0.9 · [P]
- [x] T1.39 (45) Panel de inicio: borradores, alertas y pedidos con faltante · UX §1 · E 06 (navegación) · T1.36
- [x] T1.40 (90) E2E 01–05 encadenadas · TESTING §3 · `npm test` · T1.6, T1.14, T1.16, T1.19, T0.13
- [x] T1.41 (90) E2E 06–10 encadenadas · TESTING §3 · `npm test` · T1.29–T1.37
- [x] T1.42 (90) E2E 11–14 (otro rol, injection, IA caída, auditoría) · TESTING §3 · `npm test` · T1.41
- [x] T1.43 (60) Guion de demo, clientes ficticios, recargos configurados y Excel real importado en el entorno de demo · SPEC §2 · prueba manual guiada · T1.42

**Checkpoint F1 (demo):** recorrido completo del guion delante tuyo y `npm test` verde. Espero tu OK antes de presentarlo a las encargadas.

## Fase 2 — Puesta en producción (P1 + requisitos no funcionales)

- [x] T2.1 (75) `eval/casos.json` (24 casos de AI.md) y `npm run eval:ia` con informe · AI §6, REQ-NFR-1, 2 · el propio informe · T1.24
- [x] T2.2 (90) Correr la evaluación con 2–3 modelos de `/models`, fijar `CMD_MODEL` y actualizar ADR-0001 · ADR-0001 · criterio de AI §6 · T2.1
- [x] T2.3 (75) Servicio `backup` con copia externa y runbook de restauración probado · REQ-NFR-4 · prueba de restauración · T0.3
- [x] T2.4 (60) Pantalla de métricas de IA y alerta al 80 % del tope · DESIGN §5, SECURITY T4 · I `metricas` · T1.26 · [P]
- [ ] T2.5 (90) Despliegue en el hosting: túnel real, política de Access y verificación de exposición · SECURITY §6, REQ-NFR-3 · chequeo externo de puertos · T0.15
- [x] T2.6 (45) Prueba de volumen: importar ~8.800 filas en ≤ 60 s y consulta en ≤ 1 s · REQ-NFR-8 · I `importacion.volumen` · T1.5 · [P]
- [ ] T2.7 (60) Carga de BOM reales cuando Producción los entregue (reemplazan los demo) · REQ-MP-3.1 · I `bom` · T1.17

**Checkpoint F2:** producción con datos reales, evaluación aprobada y restauración probada. Espero tu OK.

## Fase 3 — P2

- [x] T3.1 (60) Mínimos y alertas de stock de puertas · REQ-STK-6.x · I `stock.alertas` · — · [P]
- [x] T3.2 (45) UI de ajuste de materias primas · REQ-MP-5.x · I `mp.ajuste` · — · [P]
- [x] T3.3 (45) Alertas de reposición de materias primas · REQ-MP-6.x · I `mp.alertas` · — · [P]
- [x] T3.4 (75) Descuento manual con motivo, en el servidor e ignorado si viene del texto o de la IA · REQ-COT-7.x · I `descuento`, E 12 · —
- [x] T3.5 (60) Historial y búsqueda de cotizaciones, paginado y con anti-IDOR · REQ-COT-10.x · I `cotizaciones.lista` · — · [P]

**Checkpoint F3.**

## Fase 4 — P3

Entrada por correo o mensajería: fuera de alcance (ADR-0003). Antes de planificar tareas exige un ADR nuevo, que el cotizador interno pase la evaluación de AI.md y tu aprobación.

Estado (06-10-2026): **descartada**. ADR-0007 (entrada por correo, Gmail) fue rechazado porque la empresa no usa Google Workspace; el único canal sigue siendo la webapp (ADR-0003).

## Fase 5 — Lo útil del cotizador de la tienda (`referencia/`)

Aprobada el 06-10-2026. La tienda le envía a la fábrica notas de pedido en PDF con los mismos códigos; sus piezas probadas (feriados, correcciones del Excel, alias, verificación de cifras, accesorios) se portan aquí. Precio a la tienda: venta de la lista vigente sin recargo (NC-12).

### A — Base
- [x] T5.1 (60) Feriados de Chile calculados por ley + adicionales editables · REQ-COT-6.6 · U `feriados`, I `feriados` · — · [P]
- [x] T5.2 (60) Marca real (logo oficial y datos de la empresa) en web y PDF · REQ-COT-4.2 · U `pdf.contenido` · — · [P]
- [x] T5.3 (60) Importador que corrige filas inconsistentes por dos hipótesis · REQ-STK-1.6 · U `importar.mapeo`, I `importacion`, E 01 · — · [P]

### B — Pedidos
- [x] T5.4 (90) Ciclo del pedido: producción, completar reserva, lista y despacho · REQ-STK-4.4, 7.5, REQ-COT-8.5 · I `pedidos.ciclo` · —
- [x] T5.5 (120) Pedido directo desde el PDF de la nota de la tienda · REQ-COT-8.6–8.9, ADR-0008 · U `nota-tienda`, I `pedido-directo`, E 15 · T5.4

### C — IA
- [ ] T5.6 (60) Alias de modelos (seguros y posibles) · REQ-COT-2.11 · U `mapear`, I `alias` · —
- [ ] T5.7 (45) Medidas en m/cm/mm y vano/hoja · REQ-COT-2.12 · U `mapear` · —
- [ ] T5.8 (90) Accesorios: marcos, piezas T y molduras · REQ-COT-2.13, REQ-STK-1.4 · U `mapear`, E 16 · T5.7
- [ ] T5.9 (75) Verificación de cifras y cobertura del pedido · REQ-COT-2.14 · U `anclaje` · T5.7
- [ ] T5.10 (60) Evaluación ampliada con los casos reales de la tienda · AI §6 · el propio informe · T5.6–T5.9

**Checkpoint F5:** flujo PDF de la tienda → pedido → producir faltante → lista → despacho, evaluación en verde y `npm test` verde. Espero tu OK.
