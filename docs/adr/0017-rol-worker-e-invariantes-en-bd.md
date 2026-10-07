# ADR-0017 — Rol de BD propio del worker e invariantes en la base

**Estado:** aceptado (plan de correcciones de la auditoría aprobado por el usuario, 07-10-2026; Fase 10) · **Fecha:** 07-10-2026 · **Refs:** ADR-0002, ADR-0006, ADR-0009, SECURITY §2 y §6, REQ-STK-4.2, 7.3, REQ-COT-6.1, 8.5 · auditoría M-02.

## Contexto

La auditoría del 07-10-2026 comprobó que la inmutabilidad de `audit_log`, `movimiento` y `precio` sí está en la BD. En cambio, otras reglas solo las protegía TypeScript, y con el rol de la app, por SQL, se podía:

- dejar el stock en negativo (ajuste −50) o reservar más de lo que existe;
- volver una nota de pedido despachada a «pendiente» y cambiar los precios de sus ítems;
- borrar filas de `llamada_ia` (el registro de lo que se envió al LLM).

Además, el worker de IA, el único contenedor con salida a internet que procesa respuestas de un tercero, usaba el mismo rol que la app. Con eso podía leer usuarios, clientes y costos, e incluso darse permisos de administrador (se insertó `usuarios.gestionar` en un rol de solo consulta).

## Decisión

- **Rol `neltume_worker`** con permisos mínimos, que aplica `src/db/migrar.ts` en cada migración:
  - lectura del catálogo resumido, de `parametro`, `lista_precio`, `recargo_tipo` y, de `precio`, solo `lista_id`, `articulo_id` y `precio_neto` (nunca costos ni márgenes);
  - lectura y escritura de `cotizacion`, `cotizacion_item`, `trabajo_ia` y `llamada_ia`, e inserción en `audit_log`;
  - escritura en `parametro` para la caché de catálogos de IA.
  - No ve `usuario`, `sesion`, `cliente`, `movimiento` ni permisos.
  - En Compose, `DATABASE_URL_WORKER` es obligatoria (la revisa `scripts/deploy.sh`). En desarrollo y test, si falta, se deriva de `DATABASE_URL`: mismo servidor, usuario `neltume_worker` y una clave que es un hash de la clave de la app. `npm run db:setup` crea el rol.
- **Migración 0018:**
  - un *constraint trigger* diferido en `movimiento` rechaza al confirmar cualquier transacción que deje un ítem con existencia o disponible negativos; la migración se detiene si los datos actuales ya los tienen;
  - una nota de pedido `despachada` o `cancelada`, y sus ítems, no se modifican ni se borran;
  - `llamada_ia` pasa a ser de solo inserción (trigger y sin UPDATE/DELETE para la app).

## Consecuencias

- Un error de código que salte el chequeo de stock termina en error al confirmar (500), no en un saldo negativo.
- El chequeo de TypeScript (`registrarMovimientos`, con bloqueo por ítem) sigue dando el mensaje claro `STOCK_INSUFICIENTE`.
- Un worker comprometido solo alcanza lo que necesita para interpretar.
- Al desplegar hay que definir `DATABASE_URL_WORKER` en el `.env` de producción. En desarrollo hay que volver a correr `npm run db:setup` una vez (RUNBOOK §1–2).
- El E2E corre el worker con este rol, igual que en producción.
