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

## Pasos cuando se apruebe

1. Crear en Backblaze un bucket privado `deoco-copias`, con una application key que solo tenga
   acceso a ese bucket.
2. Generar la clave de age en una máquina que no sea el VPS: `age-keygen -o deoco-copias.txt`.
   - La línea `public key` va a `DEOCO_COPIA_PUBLICA`.
   - El archivo completo se guarda fuera del VPS. Sin él no se puede restaurar.
3. En Easypanel, crear un servicio desde `infra/copias/Dockerfile`, con:
   - `DATABASE_URL_COPIA` (rol dueño), `DEOCO_COPIA_DESTINO=b2:deoco-copias` y
     `DEOCO_COPIA_PUBLICA`;
   - `DEOCO_ARCHIVOS_DIR=/data/archivos`, con el mismo volumen montado en solo lectura;
   - `DEOCO_COPIA_PING` y la configuración de rclone del remoto `b2` (`RCLONE_CONFIG_B2_TYPE=b2`,
     `RCLONE_CONFIG_B2_ACCOUNT`, `RCLONE_CONFIG_B2_KEY`).
4. Correr `copia.sh` a mano una vez desde la consola del servicio.
5. **Restauración de verdad:** en la misma consola, copiar la clave privada a un archivo temporal
   y correr `restaurar.sh` con `DATABASE_URL_APP`. Anotar en `docs/verificacion-despliegue.md` la
   fecha, el resultado y cuánto tardó. Después, borrar el archivo de la clave.
6. Repetir la restauración de prueba una vez por mes: el 3.2 pide "restauración de prueba mensual".
7. En Better Stack, crear monitores HTTP para `https://app.<raiz>/api/salud` (esperar 200), para
   el subdominio de una banda y para un dominio propio, con aviso por mail al staff.
8. En Healthchecks.io, crear dos chequeos:
   - "copia diaria", cada 1 día con 2 horas de gracia, en `DEOCO_COPIA_PING`;
   - "barrido", cada 5 minutos con 15 minutos de gracia, en `DEOCO_LATIDO_URL` de la app.

## Lo que esto no cubre

- **Recuperación en el tiempo (PITR):** se pierde, como mucho, lo de un día. Para bajar ese margen
  hacen falta WAL continuos (pgBackRest o wal-g al mismo bucket). Es el paso siguiente si el 3.2
  ("Recuperación ante fallas: tiempo de indisponibilidad y pérdida de datos admisibles") pide
  menos de 24 horas.
- **Un segundo nodo** (3.2 infra I.5): sigue siendo un solo VPS.
