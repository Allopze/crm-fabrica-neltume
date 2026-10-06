# ADR-0005 — Stack: monolito Next.js + PostgreSQL en Docker Compose

**Estado:** aceptado (OK fase 4) · **Fecha:** 05-10-2026 · **Refs:** AGENTS.md (stack y comandos), DESIGN §1, §4

## Contexto
El equipo es pequeño, el volumen es de 50–200 cotizaciones al mes, el despliegue es Docker Compose detrás de Cloudflare Tunnel y el hosting ya está resuelto. El docs/PLAN.md previo proponía Next.js con Supabase/Neon y PGlite, lo que es incompatible con el despliegue fijado.

## Decisión
| Capa | Elección |
|---|---|
| App (UI + API) | Next.js (App Router) + TypeScript, route handlers para toda mutación |
| UI | Tailwind CSS v4 con tokens propios (sistema "Taller editorial", src/app/globals.css) + lucide-react; sin kit de componentes genérico |
| Worker IA | Mismo código, entrypoint `src/ai/worker.ts` |
| BD | PostgreSQL (versión mayor fija en Compose) + Drizzle ORM y migraciones |
| Validación | Zod |
| Auth | Sesiones propias en BD: cookie HttpOnly con token aleatorio, hash SHA-256 en `sesion`, contraseñas argon2id (`@node-rs/argon2`), revocación inmediata. Sin Cloudflare Access delante: el login propio es la barrera (ADR-0010). Se descartó Auth.js porque con credenciales obliga a JWT no revocable (decisión del usuario, Fase 0) |
| Entornos | Producción: Docker Compose. Dev y test: PostgreSQL local (Postgres.app); `npm run dev` migra y levanta la app (decisión del usuario, Fase 0) |
| PDF | @react-pdf/renderer (ADR-0004) |
| Proxy / túnel | cloudflared directo a la app (Caddy retirado: ADR-0011) |
| Tests | Vitest (unit e integración) · Playwright (E2E, 1 worker, secuencial) |
| Gestor | npm |

Las versiones exactas se fijan en la Fase 0 de TASKS.md con lockfile e imágenes por digest.

## Consecuencias
- Un solo lenguaje y repositorio. Dev y test usan la misma BD que producción (sin PGlite).
- Se requieren Docker y Postgres en local.

## Alternativas
Backend separado (NestJS o FastAPI) + SPA (más piezas para el tamaño del equipo) · Supabase/Neon (contradice "BD nunca publicada" y el hosting propio).
