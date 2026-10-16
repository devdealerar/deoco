#!/bin/sh
# Copia diaria FUERA del VPS (3.2 infra: copias en otro proveedor, con restauración probada).
#
#   1. La base: pg_dump en formato custom, cifrado con age (la clave privada NO vive en el VPS:
#      se guarda aparte, solo hace falta para restaurar).
#   2. Los archivos de las bandas (/data/archivos): sincronizados al mismo destino.
#   3. Subido con rclone al destino (Backblaze B2 o Cloudflare R2, S3 compatible), o a una carpeta
#      local si DEOCO_COPIA_DESTINO empieza con "/" (para probar).
#   4. Retención: diarias 30 días; la del día 1 de cada mes, 12 meses.
#   5. Si todo salió bien, avisa a DEOCO_COPIA_PING (Healthchecks.io): si un día no llega, avisan.
#
# Variables:
#   DATABASE_URL_COPIA      postgres://… del rol dueño (o uno con permiso de lectura de todo)
#   DEOCO_COPIA_DESTINO     "b2:deoco-copias" (remoto de rclone) o "/ruta/local"
#   DEOCO_COPIA_PUBLICA     clave pública de age (age1…) con la que se cifra
#   DEOCO_ARCHIVOS_DIR      /data/archivos (opcional: sin ella, solo la base)
#   DEOCO_COPIA_PING        URL de Healthchecks.io (opcional)
set -eu

: "${DATABASE_URL_COPIA:?falta DATABASE_URL_COPIA}"
: "${DEOCO_COPIA_DESTINO:?falta DEOCO_COPIA_DESTINO}"
: "${DEOCO_COPIA_PUBLICA:?falta DEOCO_COPIA_PUBLICA (clave pública de age)}"

dia=$(date -u +%Y-%m-%d)
trabajo=$(mktemp -d)
trap 'rm -rf "$trabajo"' EXIT
ping() { [ -n "${DEOCO_COPIA_PING:-}" ] && wget -q -O /dev/null -T 10 "$DEOCO_COPIA_PING$1" || true; }
ping /start

archivo="base-$dia.dump.age"
pg_dump --format=custom --no-owner "$DATABASE_URL_COPIA" | age -r "$DEOCO_COPIA_PUBLICA" -o "$trabajo/$archivo"
tamano=$(wc -c < "$trabajo/$archivo")
[ "$tamano" -gt 1000 ] || { echo "[copia] la copia de la base salió vacía ($tamano bytes)"; ping /fail; exit 1; }

subir() { # origen destino-relativo
  case "$DEOCO_COPIA_DESTINO" in
    /*) mkdir -p "$DEOCO_COPIA_DESTINO/$(dirname "$2")" && cp "$1" "$DEOCO_COPIA_DESTINO/$2" ;;
    *) rclone copyto "$1" "$DEOCO_COPIA_DESTINO/$2" ;;
  esac
}
subir "$trabajo/$archivo" "base/diarias/$archivo"
[ "$(date -u +%d)" = "01" ] && subir "$trabajo/$archivo" "base/mensuales/$archivo"

if [ -n "${DEOCO_ARCHIVOS_DIR:-}" ] && [ -d "$DEOCO_ARCHIVOS_DIR" ]; then
  case "$DEOCO_COPIA_DESTINO" in
    /*) mkdir -p "$DEOCO_COPIA_DESTINO/archivos" && cp -a "$DEOCO_ARCHIVOS_DIR/." "$DEOCO_COPIA_DESTINO/archivos/" ;;
    # Los borrados van a una carpeta del día (se pueden recuperar 30 días), no se pierden.
    *) rclone sync "$DEOCO_ARCHIVOS_DIR" "$DEOCO_COPIA_DESTINO/archivos" --backup-dir "$DEOCO_COPIA_DESTINO/archivos-borrados/$dia" ;;
  esac
fi

# Retención.
case "$DEOCO_COPIA_DESTINO" in
  /*)
    find "$DEOCO_COPIA_DESTINO/base/diarias" -name 'base-*.dump.age' -mtime +30 -delete
    find "$DEOCO_COPIA_DESTINO/base/mensuales" -name 'base-*.dump.age' -mtime +366 -delete 2>/dev/null || true ;;
  *)
    rclone delete "$DEOCO_COPIA_DESTINO/base/diarias" --min-age 30d
    rclone delete "$DEOCO_COPIA_DESTINO/base/mensuales" --min-age 366d
    rclone purge "$DEOCO_COPIA_DESTINO/archivos-borrados" --min-age 30d 2>/dev/null || true ;;
esac

echo "[copia] $dia: base $tamano bytes → $DEOCO_COPIA_DESTINO"
ping ""
