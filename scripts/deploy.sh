#!/usr/bin/env bash
# Despliegue a producción (RUNBOOK §2): sube el código y el .env al servidor por SSH y levanta Compose.
# Uso: npm run deploy. Host y carpeta se cambian con DEPLOY_HOST y DEPLOY_DIR.
# El .env de producción vive FUERA del repositorio (DEPLOY_ENV_FILE, auditoría H-15): dentro, `next dev` lo cargaría
# y `next build` lo copiaría a .next/standalone.
set -euo pipefail

HOST="${DEPLOY_HOST:-server}"
DIR="${DEPLOY_DIR:-/server/crm_fabrica_puertas}"
ENV_FILE="${DEPLOY_ENV_FILE:-$HOME/.config/neltume/produccion.env}"
cd "$(dirname "$0")/.."

if [ ! -f "$ENV_FILE" ]; then
  echo "Falta el .env de producción en $ENV_FILE (o define DEPLOY_ENV_FILE)." >&2
  if [ -f .env ]; then
    echo "Hay un .env en la raíz del repo: muévelo fuera con" >&2
    echo "  mkdir -p ~/.config/neltume && mv .env ~/.config/neltume/produccion.env && chmod 600 ~/.config/neltume/produccion.env" >&2
  fi
  exit 1
fi
if [ -f .env ]; then
  echo "Aviso: hay un .env en la raíz del repo. Bórralo: next dev lo carga y next build lo copia a .next/standalone (RUNBOOK §2)." >&2
fi
# El worker de IA usa su propio rol de BD (ADR-0017): sin esta variable no arranca.
if ! grep -Eq '^DATABASE_URL_WORKER=.*@db:5432/' "$ENV_FILE"; then
  echo "$ENV_FILE no define DATABASE_URL_WORKER (rol neltume_worker @db:5432, ADR-0017; RUNBOOK §2)." >&2
  exit 1
fi
# Evita subir por error la configuración de desarrollo (.env.local apunta a localhost).
if ! grep -Eq '^DATABASE_URL=.*@db:5432/' "$ENV_FILE"; then
  echo "$ENV_FILE no parece de producción: DATABASE_URL debe apuntar a @db:5432 (RUNBOOK §2)." >&2
  exit 1
fi

echo "→ Subiendo a $HOST:$DIR"
ssh "$HOST" "mkdir -p '$DIR'"
# Se sube lo que versiona git. Lo demás del servidor se borra (código obsoleto), salvo lo protegido con P: respaldos
# locales por defecto (BACKUP_DESTINO_EXTERNO), datos/ y el .env, que se sube aparte desde fuera del repo.
rsync -az --delete \
  -f 'P /respaldos-externos/' -f 'P /datos/' -f 'P /.env' \
  --exclude=/.git/ --exclude=/.claude/ \
  -f ':- .gitignore' \
  ./ "$HOST:$DIR/"
# Por ssh y con umask 077: el .env nace con permisos 600 (el openrsync de macOS no acepta --chmod).
ssh "$HOST" "umask 077 && cat > '$DIR/.env'" < "$ENV_FILE"

echo "→ Levantando Docker Compose"
# Los perfiles opcionales (p. ej. el worker de IA) se activan con COMPOSE_PROFILES en el .env.
ssh "$HOST" "cd '$DIR' && chmod 600 .env && docker compose up -d --build --remove-orphans && docker compose ps"
