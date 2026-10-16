# Copias y monitoreo (C2)

Antes de sumar una banda real hacen falta dos cosas: copias diarias de la base fuera del VPS,
restauradas de verdad al menos una vez, y aviso cuando la app o la base dejan de responder.

**No se contrató nada.** Abajo están la propuesta y lo que cuesta. El código que no depende de
ningún proveedor ya está hecho y probado:

- el servicio de copias (`infra/copias`);
- el endpoint de salud (`/api/salud`);
- el latido del barrido (`DEOCO_LATIDO_URL`).

## Propuesta

| Para qué | Servicio | Costo estimado | Por qué este |
|---|---|---|---|
| Guardar las copias (base y archivos) | **Backblaze B2** | 10 GB gratis; después USD 6,95 por TB por mes. Bajar hasta 3 veces lo guardado en el mes es gratis. Con 100 bandas: menos de USD 2 por mes. | Es otro proveedor que el VPS (Hostinger) y que el DNS (Cloudflare). Si una sola cuenta cae o la comprometen, no se lleva las copias con ella. Es compatible con S3 y rclone lo maneja. |
| Alternativa para las copias | Cloudflare R2 | 10 GB-mes gratis; después USD 0,015 por GB por mes; bajar no se cobra. Con 100 bandas: USD 3 a 5 por mes. | Ya usamos Cloudflare. En contra: queda en la misma cuenta que el DNS. |
| Ver que la app responde (cada 3 min, con aviso) | **Better Stack Uptime**, plan gratis | USD 0, con 10 monitores cada 3 minutos (dato sin verificar en su página). | Revisa `https://app.<raiz>/api/salud`, el subdominio de una banda y un dominio propio. Avisa por mail o Slack. |
| Saber que la copia y el barrido siguen corriendo | **Healthchecks.io**, plan gratis | USD 0, con 20 chequeos. | Funciona al revés: si un día no llega la señal de la copia, o el latido del barrido deja de llegar, avisa. |
| Si el plan gratis de Better Stack no alcanza | UptimeRobot Solo | Entre USD 9 y 13 por mes, según la fuente. | Su plan gratis es solo para uso no comercial desde 2024: no nos sirve. |

**Total: entre USD 0 y 2 por mes al arrancar.**

Los precios salen de páginas de comparación, no de las páginas oficiales. Hay que confirmarlos
antes de contratar:

- [Backblaze B2 (Upstash, oct. 2026)](https://upstash.com/blog/backblaze-b2-pricing-explained-2026.md)
- [egresscost: B2](https://egresscost.com/backblaze-b2)
- [Cloudflare R2 (Filebase)](https://filebase.com/blog/cloudflare-r2-pricing-costs-savings-and-alternatives-in-2026/)
- [Planes de UptimeRobot (Notifier)](https://notifier.so/guides/uptimerobot-pricing-2026/)
- [Monitoreo barato (Notifier)](https://notifier.so/guides/cheap-uptime-monitoring/)
- [Healthchecks.io (Capterra)](https://www.capterra.com/p/249957/Healthchecksio/pricing/)

## Qué queda armado

### `/api/salud`

Responde 200 si la app atiende, la base contesta (con un límite de 3 s) y el volumen de archivos
se puede escribir. Si algo de eso falla, responde 503. No muestra versiones ni errores. La prueba
está en `tests/salud.test.ts`.

### Latido del barrido

Con `DEOCO_LATIDO_URL` (una URL de Healthchecks.io), el barrido avisa como mucho cada 5 minutos
que sigue vivo. Si el proceso se cae o el barrido se cuelga, la señal deja de llegar y el
servicio avisa: se cortarían los correos, la conciliación y la escalera de mora.

### `infra/copias`: un servicio aparte en Easypanel, sin puertos

- **Imagen:** `postgres:16-alpine` con rclone y age.
- **`copia.sh`:** corre todos los días a las 03:15 de Argentina con crond.
  - Guarda la base con `pg_dump` en formato custom, cifrada con age. La clave privada **no vive
    en el VPS**; solo hace falta para restaurar. Se guarda en el gestor de claves del titular y
    en papel.
  - Sincroniza los archivos de las bandas. Lo que se borra va a `archivos-borrados/<día>` y se
    conserva 30 días.
  - Retención: copias diarias por 30 días y la del día 1 de cada mes por 12 meses.
  - Avisa a Healthchecks.io al empezar y al terminar.
- **`restaurar.sh`:**
  - Baja la última copia, la descifra y la carga en una base nueva (`deoco_restauracion`). Nunca
    toca producción.
  - Compara las filas de las tablas que no se pueden perder: bandas, usuarios, pedidos, órdenes,
    compras, entradas, cobros, pagos para devolver, archivos y auditoría.
  - Prueba que `deoco_app` puede leerla y que **no** puede borrar la auditoría.

#### La prueba que corrí (contra la base de pruebas, destino local)

```
[copia] 2026-10-16: base 247655 bytes → …/destino
tabla                    restaurada       origen
tenant                            2            2
usuario                           6            6
tienda_pedido                     2            2
tienda_orden                      2            2
archivo                          25           25
auditoria                        52           52
…
[restaurar] OK
```

Las políticas RLS (76), las tablas con RLS (47) y el disparador de la auditoría quedaron iguales
en la base restaurada.

**La prueba encontró un error que corregí:** con `--no-privileges`, la base restaurada no le daba
permisos a `deoco_app`, así que la app no la podía usar. Ahora se copian los permisos, y la prueba
de `deoco_app` lo verifica.

Esto no reemplaza la restauración de verdad en el VPS, que es lo que pediste: falta hacerla con el
servicio contratado (pasos 5 y 6 de abajo).

## Mientras tanto: copia local rotativa (no cuenta como resuelto)

Hasta contratar el destino de afuera, el mismo servicio guarda una copia diaria **en otro punto de
montaje del VPS** (`/copias`, el volumen `/srv/deoco/copias` de `infra/disco/volumenes.sh`), con
retención de **7 días**:

- La base, cifrada con age, una por día (`/copias/base/diarias/base-<día>.dump.age`).
- Los archivos, en espejo (`/copias/archivos`). Lo que se borra en el origen pasa a
  `/copias/archivos-borrados/<día>` y se guarda 7 días.

**No es "fuera del servidor":** si se pierde el VPS, se pierde también. Cubre un borrado por
error, una migración que sale mal o una base corrupta. Se configura así, en el servicio de copias:

```
DATABASE_URL_COPIA=postgres://<rol dueño>@<host>:5432/deoco
DEOCO_COPIA_DESTINO=/copias
DEOCO_COPIA_PUBLICA=age1…            # la pública; la privada, fuera del VPS
DEOCO_ARCHIVOS_DIR=/data/archivos    # el volumen de la app, montado en solo lectura
```

Probado en local (`sh infra/copias/copia.sh` dos veces, con un archivo borrado en el medio y una
copia de hace 15 días): queda la de hoy y la de hace 4, la de hace 15 se borra, y el archivo
borrado aparece en `archivos-borrados/<día>`.

## Backblaze B2 en menos de quince minutos (cuando lo apruebes)

Todo el código ya está. Son cuentas y variables:

1. **Cuenta** (2 min): <https://www.backblaze.com/sign-up/cloud-storage>. Activá B2 Cloud Storage.
2. **Bucket** (2 min): Buckets → Create a Bucket.
   - Nombre: `deoco-copias-<algo único>`; Files in Bucket: **Private**; Default Encryption: Enable.
   - Lifecycle Settings: **Keep only the last version of the file** (si no, lo que borra la
     retención queda como versión vieja y se sigue pagando).
   - Opcional, contra un borrado malicioso: Object Lock con retención de 30 días.
3. **Clave de acceso** (2 min): Application Keys → Add a New Application Key.
   - Allow access to Bucket(s): **solo ese bucket**; Type of Access: Read and Write.
   - Copiá `keyID` y `applicationKey` (la segunda se ve una sola vez).
4. **Clave de age** (2 min), en tu máquina, no en el VPS: `age-keygen -o deoco-copias.txt`.
   - La línea `# public key: age1…` va a `DEOCO_COPIA_PUBLICA`.
   - Guardá `deoco-copias.txt` en tu gestor de claves y en papel. Sin ella no se restaura nada.
5. **Variables del servicio de copias en Easypanel** (3 min): cambiá el destino local por B2.
   ```
   DEOCO_COPIA_DESTINO=b2:deoco-copias-<algo único>
   RCLONE_CONFIG_B2_TYPE=b2
   RCLONE_CONFIG_B2_ACCOUNT=<keyID>
   RCLONE_CONFIG_B2_KEY=<applicationKey>
   RCLONE_CONFIG_B2_HARD_DELETE=true
   ```
   (Dejá `DEOCO_COPIA_DIAS` sin poner: con destino de afuera son 30 días, más la del día 1 de cada
   mes por 12 meses.)
6. **Primera copia y restauración de verdad** (4 min), en la consola del servicio:
   ```sh
   copia.sh                      # tiene que terminar con "[copia] …: base … bytes → b2:…"
   # Pegá la clave privada en un archivo temporal:
   cat > /tmp/clave.txt          # pegar, Ctrl+D
   DEOCO_COPIA_PRIVADA=/tmp/clave.txt \
     DATABASE_URL_SERVIDOR=postgres://<rol dueño>@<host>:5432/postgres \
     DATABASE_URL_APP=postgres://deoco_app:<clave>@<host>:5432/deoco \
     restaurar.sh                # restaura en deoco_restauracion; nunca toca deoco
   rm /tmp/clave.txt
   ```
   Tiene que terminar en `[restaurar] OK`. Anotá fecha, resultado y tiempo en
   `docs/verificacion-despliegue.md`.
7. **Monitoreo** (sin costo, cuando quieras): Healthchecks.io (dos chequeos: "copia diaria" en
   `DEOCO_COPIA_PING`, cada 1 día con 2 h de gracia; "barrido" en `DEOCO_LATIDO_URL` de la app,
   cada 5 min con 15 de gracia) y Better Stack (monitor HTTP de `https://app.<raiz>/api/salud`).
8. **Una vez por mes**: repetir el paso 6 (el 3.2 pide restauración de prueba mensual).

La copia local puede seguir en paralelo (un segundo servicio con `DEOCO_COPIA_DESTINO=/copias`):
es la más rápida de restaurar si el VPS sigue vivo.

## Lo que esto no cubre

- **Recuperación en el tiempo (PITR):** se pierde, como mucho, lo de un día. Para bajar ese margen
  hacen falta WAL continuos (pgBackRest o wal-g al mismo bucket). Es el paso siguiente si el 3.2
  ("Recuperación ante fallas: tiempo de indisponibilidad y pérdida de datos admisibles") pide
  menos de 24 horas.
- **Un segundo nodo** (3.2 infra I.5): sigue siendo un solo VPS.
