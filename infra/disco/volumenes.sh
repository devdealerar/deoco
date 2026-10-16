#!/bin/sh
# Separa del disco de la base los archivos de las bandas y las copias locales (bloque D).
#
# Crea dos sistemas de archivos de tamaño FIJO (imágenes ext4 montadas con loop) en el VPS:
#   /srv/deoco/archivos  → volumen de la app (DEOCO_ARCHIVOS_DIR=/data/archivos)
#   /srv/deoco/copias    → destino de las copias locales (DEOCO_COPIA_DESTINO=/copias)
# Llenar uno de los dos llena SU imagen, nunca el disco donde vive Postgres. Además la app deja
# siempre una reserva libre en el de archivos (DEOCO_ARCHIVOS_RESERVA_MB, 2 GB por defecto).
#
# Se corre UNA vez, como root, en el VPS (no desde la app). Idempotente: si ya existen, no toca nada.
#   ARCHIVOS_GB=40 COPIAS_GB=30 sh volumenes.sh
# Después, en Easypanel: montar /srv/deoco/archivos en /data/archivos (app) y /srv/deoco/copias en
# /copias (servicio de copias), como "bind mount". Los pasos: docs/despliegue.md, "Discos".
set -eu
ARCHIVOS_GB=${ARCHIVOS_GB:-40}
COPIAS_GB=${COPIAS_GB:-30}
DIR_IMAGENES=${DIR_IMAGENES:-/var/lib/deoco}

[ "$(id -u)" = 0 ] || { echo "Correlo como root."; exit 1; }
mkdir -p "$DIR_IMAGENES"

volumen() { # nombre gigas punto
  img="$DIR_IMAGENES/$1.img"
  if [ ! -f "$img" ]; then
    libre=$(df -BG --output=avail "$DIR_IMAGENES" | tail -1 | tr -dc 0-9)
    [ "$libre" -gt "$(( $2 + 10 ))" ] || { echo "No hay lugar para $1 ($2 GB) dejando 10 GB libres: hay $libre GB."; exit 1; }
    fallocate -l "${2}G" "$img"
    mkfs.ext4 -q -L "deoco-$1" "$img"
    echo "[volumenes] creada $img ($2 GB)"
  fi
  mkdir -p "$3"
  grep -q " $3 " /etc/fstab || echo "$img $3 ext4 loop,defaults,nofail 0 2" >> /etc/fstab
  mountpoint -q "$3" || mount "$3"
  echo "[volumenes] $1 montado en $3: $(df -h --output=size,avail "$3" | tail -1)"
}

volumen archivos "$ARCHIVOS_GB" /srv/deoco/archivos
volumen copias "$COPIAS_GB" /srv/deoco/copias
echo "[volumenes] listo. Si ya había archivos en el volumen viejo, copiálos: cp -a <viejo>/. /srv/deoco/archivos/"
