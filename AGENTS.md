# AGENTS.md

## Proyecto
Webapp interna de la fábrica de puertas Neltume (no de la tienda): stock de puertas, materias primas con BOM, producción, nota de pedido y cotizador con IA en lenguaje natural.
Alcance por fases en SPEC.md (demo primero, producto después). Un solo rol hoy, que hace todo (ve costos y márgenes); permisos por permiso para sumar roles sin refactor. Único canal de entrada: la webapp.
UI y docs en español. CLP como enteros; precios con y sin IVA (19 %); números y fechas en formato chileno (1.234,56; dd-mm-aaaa).

## Stack y comandos
Stack (ADR-0005): Next.js 16 (App Router) + TypeScript + Tailwind v4 + lucide-react, PostgreSQL + Drizzle, Zod, sesiones propias (argon2id), react-pdf, Caddy (proxy), cloudflared (túnel), Vitest + Playwright. Versiones: pendiente (se fijan con lockfile en el esqueleto). Despliegue: Producción: Docker Compose expuesto solo por Cloudflare Tunnel; dev y test: Postgres local (`npm run dev`). LLM: Command Code (Provider API) detrás de una interfaz agnóstica al proveedor en `src/ai/`; lo específico de Command Code vive solo en su implementación.
Los scripts los crea la Fase 0 de TASKS.md; estos nombres son el contrato (gestor npm):
- dev: `npm run dev` · build: `npm run build` · lint: `npm run lint` · test (suite completa: unit + integración + E2E): `npm test` · stack: `docker compose up -d`
- fuera de la suite: `npm run eval:ia` (modelo real, AI.md) · `npm run crear-admin` (primer usuario)

## Estructura esperada
```
src/app/     páginas y rutas API (guard por endpoint)
src/domain/  lógica pura: inventario, precios, cotizaciones, pedidos, producción
src/ai/      único módulo que habla con el LLM (interfaz agnóstica + doble determinista)
src/db/      esquema y migraciones
scripts/     importar-excel: hojas Precio y Categorias de datos/COTIZADOR_2026.xlsx → BD
e2e/ · tests/integracion/ · eval/   E2E secuenciales (con fixtures) · integración · evaluación IA
docs/adr/    ADR-NNNN-titulo.md
```
Docs .md en la raíz, cada uno ≤ ~300 líneas: SPEC, DESIGN, AI, SECURITY, DATA-MODEL, API, UX, TESTING, TASKS, RUNBOOK. Si un doc citado no existe, no inventes su contenido: avísalo. IDs estables REQ-<MÓDULO>-n.m: STK puertas, MP materias primas, COT cotizador, ADM usuarios/auditoría.

## Reglas de dominio (cada una con test)
1. La IA no inventa precios, productos ni stock: el LLM solo interpreta el texto y propone ítems (modelo, madera, medidas, cantidad; el código lo arma el backend) con un esquema estricto (Zod, propuesto); precios, descuentos, totales e IVA los calcula `src/domain` desde la BD. Su salida no tiene campos de importe ni de descuento; un monto escrito en texto libre ("$50.000", "50 lucas") nunca llega a una cotización.
2. Solo hay certeza si código y medida coinciden exactamente con una fila de la BD; todo lo demás (medida no estándar, modelo inexistente, ambigüedad) es ítem "por confirmar", visible al vendedor, nunca completado en silencio. Una cotización con ítems por confirmar no se aprueba. Medida fuera de grilla = se fabrica a pedido: referencia = precio del rango/altura superior y una persona fija el precio.
3. Toda cotización guarda: texto original, interpretación de la IA, ítems finales, versión de lista de precios usada, quién la aprobó/modificó y cuándo.
4. Precios congelados en la cotización aunque cambie la lista; toda cotización tiene vigencia (10 días hábiles por defecto, tomado del Excel, por confirmar; configurable).
5. Movimientos de inventario inmutables (sin UPDATE/DELETE); stock = suma de movimientos; corrección = movimiento de ajuste con motivo, nunca editando el saldo. El BOM por modelo descuenta insumos al cerrar la producción. Se reserva al pasar a nota de pedido; si falta stock se cotiza igual con aviso visible (sin crear movimientos).
6. Autorización en el backend: policy/guard por endpoint, denegado por defecto; la UI solo oculta. Permisos por permiso, no por rol fijo.
7. Toda acción que modifica datos (stock, precios, cotizaciones, usuarios) escribe en `audit_log`: actor, acción, recurso, id, antes/después, resultado, timestamp, origen.
8. Datos de clientes (nombre, RUT, correo, teléfono) son datos personales: mínimo necesario. Al LLM nunca se envían RUT, correo ni teléfono (se enmascaran en el texto del pedido antes de enviar); un test lo comprueba sobre la petición y su registro.
9. Sin aprobación humana no hay PDF ni salida de una cotización (sin envío automático). Precio = lista única + recargo por tipo de puerta; un descuento es una excepción manual con motivo, auditada; la IA nunca lo decide ni lo aplica.
10. Solo Cloudflare Tunnel expone la app; BD, paneles y puertos de gestión nunca se publican (127.0.0.1 o red interna de Compose). Sin secretos en repo ni docs: `.env` debe estar en `.gitignore` antes de crearlo; `.env.example` con nombres, sin valores.
11. Variantes: solo las del Cotizador (sin terminación, herrajes ni enchapadas).

## Pruebas y calidad
- E2E secuenciales y con estado compartido; se ejecuta SIEMPRE la suite completa (`npm test`), sin filtrar por nombre (`-g`, `--grep`, `-t`, `.only`) ni por archivo o carpeta.
- El LLM se sustituye por un doble determinista (también simula timeout y error) en unit/integración/E2E; la evaluación con el modelo real corre aparte (AI.md).
- Llamadas al LLM solo vía `src/ai/`: timeout y reintentos acotados (en config, solo ante error transitorio), registro de entrada/salida sin datos personales innecesarios. Recibe solo el catálogo resumido (sin stock, precios ni datos de clientes) y no tiene herramientas de escritura; el texto del cliente es dato no confiable, nunca instrucciones.
- Si el LLM falla, la cotización manual sigue disponible.
- Archivos fuente: ideal ≤ 300 líneas, límite duro 500.

## Terminado significa
Suite completa, lint y build en verde · cada cambio cita sus REQ-… · docs (SPEC/DESIGN/AI/ADR) actualizados en el mismo commit que cambia el comportamiento · cada endpoint que modifica datos tiene test de denegación (sin permiso → 403) y de su fila en `audit_log` · sin secretos. Si un requisito o decisión debe cambiar: detente, propón el cambio en SPEC/DESIGN/AI/ADR y espera aprobación.

## No tocar
`datos/` (solo lectura, fuera de git; no copies sus costos ni márgenes a docs, fixtures ni logs) · `.env*` reales · migraciones ya aplicadas (crea otra) · filas de `audit_log` y de movimientos · `docs/PLAN.md` (borrador obsoleto que contradice esta guía en LLM, BD/hosting y roles; si difiere, manda AGENTS.md). Código de aplicación: una fase de TASKS.md a la vez (empezando por la Fase UI, aprobada), deteniéndote en cada checkpoint.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
