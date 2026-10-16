#!/bin/sh
# Restauración DE PRUEBA (o de verdad): baja la última copia de la base, la descifra y la carga en
# una base nueva; después compara cuántas filas tiene cada tabla importante con la de origen.
# Nunca toca la base de producción: crea DEOCO_RESTAURAR_EN (por defecto, deoco_restauracion).
#
# Variables:
#   DEOCO_COPIA_DESTINO     el mismo de copia.sh
#   DEOCO_COPIA_PRIVADA     archivo con la clave privada de age (la que NO vive en el VPS)
#   DATABASE_URL_SERVIDOR   postgres://dueño@host/postgres (para crear la base de prueba)
#   DATABASE_URL_COPIA      la base de origen, para comparar (opcional)
#   DEOCO_RESTAURAR_EN      nombre de la base de prueba (opcional)
#   DEOCO_RESTAURAR_COPIA   un archivo de copia puntual (opcional; si no, la última diaria)
#   DATABASE_URL_APP        postgres://deoco_app@host/<cualquiera>: prueba que la app la puede usar (opcional)
set -eu

: "${DEOCO_COPIA_DESTINO:?falta DEOCO_COPIA_DESTINO}"
: "${DEOCO_COPIA_PRIVADA:?falta DEOCO_COPIA_PRIVADA (archivo con la clave privada de age)}"
: "${DATABASE_URL_SERVIDOR:?falta DATABASE_URL_SERVIDOR}"
base="${DEOCO_RESTAURAR_EN:-deoco_restauracion}"
trabajo=$(mktemp -d)
trap 'rm -rf "$trabajo"' EXIT

case "$DEOCO_COPIA_DESTINO" in
  /*) ultima=${DEOCO_RESTAURAR_COPIA:-$(ls -1 "$DEOCO_COPIA_DESTINO/base/diarias" | sort | tail -1)}; cp "$DEOCO_COPIA_DESTINO/base/diarias/$ultima" "$trabajo/copia.age" ;;
  *) ultima=${DEOCO_RESTAURAR_COPIA:-$(rclone lsf "$DEOCO_COPIA_DESTINO/base/diarias" | sort | tail -1)}; rclone copyto "$DEOCO_COPIA_DESTINO/base/diarias/$ultima" "$trabajo/copia.age" ;;
esac
echo "[restaurar] copia: $ultima"
inicio=$(date +%s)
age -d -i "$DEOCO_COPIA_PRIVADA" -o "$trabajo/copia.dump" "$trabajo/copia.age"

servidor_sin_base=${DATABASE_URL_SERVIDOR%/*}
psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL_SERVIDOR" -c "DROP DATABASE IF EXISTS \"$base\"" -c "CREATE DATABASE \"$base\""
destino="$servidor_sin_base/$base"
# Con los permisos (GRANT) a deoco_app y deoco_admin: sin ellos la app no podría leer la base
# restaurada. Esos roles tienen que existir en el servidor (prisma/sql/crear-rol-*.sql).
pg_restore --no-owner --exit-on-error -d "$destino" "$trabajo/copia.dump"
fin=$(date +%s)
echo "[restaurar] cargada en $base en $((fin - inicio)) s"

# Lo que no se puede perder primero: órdenes, entradas, cobros, auditoría.
TABLAS="tenant usuario membresia dominio tienda_pedido tienda_pedido_item tienda_orden ticketera_compra ticketera_entrada comercial_cobro cobro_duplicado archivo auditoria"
cuenta() { psql -At "$1" -c "SELECT count(*) FROM \"$2\"" 2>/dev/null || echo "-"; }
mal=0
printf '%-22s %12s %12s\n' tabla restaurada origen
for t in $TABLAS; do
  r=$(cuenta "$destino" "$t")
  o=$([ -n "${DATABASE_URL_COPIA:-}" ] && cuenta "$DATABASE_URL_COPIA" "$t" || echo "-")
  printf '%-22s %12s %12s\n' "$t" "$r" "$o"
  [ "$r" = "-" ] && mal=1
  # La copia es de hasta un día antes: la restaurada nunca puede tener MÁS que el origen.
  if [ "$o" != "-" ] && [ "$r" != "-" ] && [ "$r" -gt "$o" ]; then mal=1; fi
done
# La app tiene que poder usarla: deoco_app lee (bajo RLS: sin banda fijada, no ve filas) y no
# puede tocar la auditoría.
if [ -n "${DATABASE_URL_APP:-}" ]; then
  app="${DATABASE_URL_APP%/*}/$base"
  psql -At "$app" -c "SELECT count(*) FROM tienda_pedido" > /dev/null || { echo "[restaurar] FALLÓ: deoco_app no puede leer la base restaurada"; mal=1; }
  psql -At "$app" -c "DELETE FROM auditoria" > /dev/null 2>&1 && { echo "[restaurar] FALLÓ: deoco_app puede borrar la auditoría"; mal=1; }
fi
[ "$mal" = 0 ] && echo "[restaurar] OK" || { echo "[restaurar] FALLÓ: falta una tabla, no cierra o la app no la puede usar"; exit 1; }
