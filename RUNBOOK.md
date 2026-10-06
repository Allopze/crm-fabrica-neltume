# RUNBOOK.md — Operación

Pasos para levantar y operar el sistema. Nunca escribas secretos en este archivo ni en el repositorio: van en `.env.local` (dev) o `.env` (producción), ambos ignorados por git.

## 1. Desarrollo local (sin Docker)

Requisitos: Node 24 (`.nvmrc`) y PostgreSQL local (Postgres.app en `localhost:5432`).

1. `npm install`
2. `cp .env.example .env.local` y completa:
   - `DATABASE_ADMIN_URL`: superusuario local (Postgres.app: `postgres://<tu-usuario>@localhost:5432/postgres`).
   - `DATABASE_URL_OWNER`: `postgres://neltume_owner:<clave>@localhost:5432/neltume_dev`.
   - `DATABASE_URL`: `postgres://neltume_app:<clave>@localhost:5432/neltume_dev`.
   - Claves aleatorias: `openssl rand -hex 18`.
3. `npm run db:setup`: crea los roles y las bases `neltume_dev`, `neltume_test` y `neltume_e2e`. Es idempotente.
4. `npm run crear-admin`: primer usuario. La contraseña se pide por consola.
5. `npm run dev`: migra la BD y levanta la app en `http://localhost:3000`.

Pruebas: `npm test` (lint → typecheck → unit → integración → E2E). Siempre se corre completo. Recrea `neltume_test` y `neltume_e2e` y usa el Chrome instalado.

## 2. Producción (Docker Compose)

1. En el servidor: `cp .env.example .env` y completa todas las variables. `DATABASE_URL_OWNER` y `DATABASE_URL` apuntan a `@db:5432/neltume`.
2. `docker compose up -d --build`. El servicio `migrar` crea los roles y la base, aplica las migraciones y termina; luego arranca `app`.
3. Primer usuario: `docker compose run --rm -it migrar npx tsx scripts/crear-admin.mts`.
4. Cotizador con IA (desde la Fase 1): `docker compose --profile ia up -d worker`.
5. Verifica la exposición:
   - `docker compose ps` no debe mostrar puertos publicados.
   - En el host, `ss -tlnp` no debe mostrar 5432 ni 3000 en `0.0.0.0`.

Acceso administrativo a la BD, solo desde el host: `docker compose -f docker-compose.yml -f docker-compose.admin.yml up -d db`. Expone `127.0.0.1:5432`. Ciérralo al terminar.

## 3. Cloudflare Tunnel y Access

1. Cloudflare Zero Trust → Networks → Tunnels → crear un túnel de tipo *cloudflared*. Copia el token a `TUNNEL_TOKEN` en `.env`.
2. En el túnel, agrega un *Public hostname*. Por ejemplo, `fabrica.<dominio>` → servicio `http://proxy:80`. Es la única ruta de entrada.
3. Access → Applications → *Self-hosted* para ese hostname, con una política *Allow* que liste los correos autorizados. La app exige además su propio login.
4. Comprueba desde fuera de la red:
   - El hostname pide primero Cloudflare Access.
   - `curl -I https://fabrica.<dominio>/api/v1/salud` sin Access debe ser rechazado por Cloudflare.

## 4. Salud, logs y respaldos

- Salud: `GET /api/v1/salud` responde `ok`, o `degradado` (503) si la BD no responde. Lo usan los healthchecks.
- Logs: JSON en stdout (`docker compose logs app`), con datos sensibles redactados. Cada error lleva su `correlacion_id`, que también se ve en pantalla y en `audit_log`.
- Respaldos: el servicio `backup` hace `pg_dump` diario a las 02:00 en el volumen `backups`. La copia externa y la prueba de restauración mensual quedan en TASKS T2.3.

## 5. Incidentes frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `npm run dev` dice "No se pudo migrar" | PostgreSQL apagado o falta `db:setup` | Abre Postgres.app y ejecuta `npm run db:setup` |
| Login responde "Demasiados intentos" | 5 fallos en 15 min (por correo o IP) | Esperar 15 min; queda auditado |
| La app no arranca en producción | `migrar` falló | `docker compose logs migrar` |
| Un usuario quedó sin acceso | Desactivado o rol sin permisos | Otro administrador lo reactiva en Usuarios y permisos |
