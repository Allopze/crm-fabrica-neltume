#!/usr/bin/env bash
# Despliegue a producción (RUNBOOK §2): sube el código al servidor por SSH y levanta Compose.
# Uso: npm run deploy. Host y carpeta se cambian con DEPLOY_HOST y DEPLOY_DIR.
# El .env de producción vive en el servidor ($DIR/.env) y es la fuente de verdad: el deploy NUNCA lo sobrescribe.
# Solo en la primera instalación, si el servidor aún no tiene .env, se sube la copia local (DEPLOY_ENV_FILE), que
# vive FUERA del repositorio (auditoría H-15): dentro, `next dev` la cargaría y `next build` la copiaría a .next/standalone.
set -euo pipefail

HOST="${DEPLOY_HOST:-server}"
DIR="${DEPLOY_DIR:-/server/crm_fabrica_puertas}"
ENV_FILE="${DEPLOY_ENV_FILE:-$HOME/.config/neltume/produccion.env}"
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo "Aviso: hay un .env en la raíz del repo. Bórralo: next dev lo carga y next build lo copia a .next/standalone (RUNBOOK §2)." >&2
fi

ssh "$HOST" "mkdir -p '$DIR'"
if ssh "$HOST" "test -f '$DIR/.env'"; then
  echo "→ Se usa el .env que ya está en $HOST:$DIR (no se sobrescribe)."
else
  # Primera instalación: se sube la copia local una sola vez, con permisos 600 (umask 077; el openrsync de macOS no
  # acepta --chmod). Desde ahí se edita directamente en el servidor.
  if [ ! -f "$ENV_FILE" ]; then
    echo "El servidor no tiene $DIR/.env y no hay copia local en $ENV_FILE (o define DEPLOY_ENV_FILE)." >&2
    echo "Créalo en el servidor desde .env.example (RUNBOOK §2) y vuelve a desplegar." >&2
    exit 1
  fi
  echo "→ El servidor no tiene .env: se sube $ENV_FILE (solo esta vez)."
  ssh "$HOST" "umask 077 && cat > '$DIR/.env'" < "$ENV_FILE"
fi

# El .env del servidor debe ser de producción: el worker usa su propio rol de BD (ADR-0017) y todo apunta a @db:5432.
if ! ssh "$HOST" "grep -Eq '^DATABASE_URL_WORKER=.*@db:5432/' '$DIR/.env'"; then
  echo "$HOST:$DIR/.env no define DATABASE_URL_WORKER (rol neltume_worker @db:5432, ADR-0017; RUNBOOK §2)." >&2
  exit 1
fi
if ! ssh "$HOST" "grep -Eq '^DATABASE_URL=.*@db:5432/' '$DIR/.env'"; then
  echo "$HOST:$DIR/.env no parece de producción: DATABASE_URL debe apuntar a @db:5432 (RUNBOOK §2)." >&2
  exit 1
fi

echo "→ Subiendo el código a $HOST:$DIR"
# Se sube lo que versiona git. Lo demás del servidor se borra (código obsoleto), salvo lo protegido con P: respaldos
# locales por defecto (BACKUP_DESTINO_EXTERNO), datos/ y el .env.
rsync -az --delete \
  -f 'P /respaldos-externos/' -f 'P /datos/' -f 'P /.env' \
  --exclude=/.git/ --exclude=/.claude/ \
  -f ':- .gitignore' \
  ./ "$HOST:$DIR/"

echo "→ Levantando Docker Compose"
# Los perfiles opcionales (p. ej. el worker de IA) se activan con COMPOSE_PROFILES en el .env.
ssh "$HOST" "cd '$DIR' && chmod 600 .env && docker compose up -d --build --remove-orphans && docker compose ps"
