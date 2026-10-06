# ADR-0006 — Cola de trabajos de IA en PostgreSQL

**Estado:** aceptado · **Fecha:** 05-10-2026 · **Refs:** REQ-COT-2.1, 2.7, REQ-NFR-1, DESIGN §3, §5

## Contexto
La interpretación llama a un servicio externo con latencia variable (hasta 15 s) y puede fallar. Una petición HTTP abierta todo ese tiempo complica los timeouts del túnel y los reintentos, y además obligaría a tener la clave del LLM en `app`.

## Decisión
- La tabla `trabajo_ia` funciona como cola. `app` encola en la misma transacción que crea el borrador.
- El `worker` toma trabajos con `SELECT … FOR UPDATE SKIP LOCKED`, con un máximo de 3 intentos, y reintenta los trabajos `en_curso` de más de 60 s.
- La UI hace polling del estado de la cotización (1 s, hasta 30 s).
- Solo `worker` tiene la clave del LLM y salida a internet.

## Consecuencias
- No hace falta Redis ni otro broker: un servicio menos que operar y respaldar.
- La cola queda respaldada y es transaccional con los datos.
- El throughput está limitado por un worker, suficiente para el volumen esperado; se pueden levantar más réplicas sin cambios.

## Alternativas
Llamada síncrona en el route handler (más simple, pero expone la clave en `app` y sufre con los timeouts) · Redis + BullMQ (otro servicio para un volumen bajo).
