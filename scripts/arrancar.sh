#!/bin/sh
# Arranque del contenedor: migraciones pendientes y después el servidor.
# Las migraciones usan DATABASE_URL_MIGRACIONES (rol dueño); la app, DATABASE_URL (deoco_app).
set -e

for v in DATABASE_URL DATABASE_URL_MIGRACIONES DATABASE_URL_ADMIN AUTH_SECRET DEOCO_DOMINIO_RAIZ; do
  eval "valor=\${$v:-}"
  if [ -z "$valor" ]; then
    echo "Falta la variable de entorno $v (ver docs/despliegue.md)." >&2
    exit 1
  fi
done

mkdir -p "${DEOCO_ARCHIVOS_DIR:-/data/archivos}"
if ! touch "${DEOCO_ARCHIVOS_DIR:-/data/archivos}/.escritura" 2>/dev/null; then
  echo "No se puede escribir en ${DEOCO_ARCHIVOS_DIR:-/data/archivos}: revisá el volumen." >&2
  exit 1
fi

echo "Aplicando migraciones…"
node_modules/.bin/prisma migrate deploy

echo "Levantando Deoco en el puerto ${PORT:-3000}…"
exec node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
