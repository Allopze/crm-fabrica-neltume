#!/bin/sh
# Respaldo diario de la BD de la app (DESIGN.md §6). La copia externa y la prueba
# de restauración se completan en TASKS T2.3.
set -eu
RETENCION="${BACKUP_RETENCION_DIAS:-30}"
while true; do
  ahora=$(date +%H%M)
  if [ "$ahora" = "0200" ]; then
    archivo="/backups/neltume-$(date +%Y%m%d-%H%M).dump"
    pg_dump -Fc -d neltume -f "$archivo"
    find /backups -name 'neltume-*.dump' -mtime +"$RETENCION" -delete
    sleep 60
  fi
  sleep 30
done
