# Despliegue en Easypanel

Deoco se despliega como **una sola aplicación** (monolito modular) más **un Postgres**,
en el VPS de Hostinger con Easypanel.

```
                 ┌───────────────────────── VPS (Easypanel) ─────────────────────────┐
 app.deoco.com ─┐│  ┌──────────────── servicio "deoco" (Dockerfile) ───────────────┐  │
 *.deoco.com  ──┼┼─▶│ Next.js :3000  ──▶ /data/archivos (volumen: fotos, riders…)    │  │
 labanda.com  ──┘│  │      │ DATABASE_URL (deoco_app, con RLS)                       │  │
                 │  └──────┼───────────────────────────────────────────────────────┘  │
                 │  ┌──────▼──────── servicio "postgres" ───────┐                     │
                 │  │ base "deoco"  · roles deoco_owner / deoco_app                  │
                 │  └───────────────────────────────────────────┘                     │
                 └────────────────────────────────────────────────────────────────────┘
```

## Qué hace la imagen

- `Dockerfile` construye con `next build`. El descubrimiento de módulos corre solo en ese
  paso (desde `next.config.ts`) y deja afuera los módulos marcados `SOLO_DESARROLLO.md`
  (el de prueba): no importa qué comando de build use Easypanel.
- Al arrancar, `scripts/arrancar.sh`:
  1. verifica que estén las variables obligatorias y que el volumen de archivos se pueda escribir;
  2. aplica las migraciones pendientes (`prisma migrate deploy`, con el rol dueño);
  3. levanta el servidor en el puerto 3000.
- Cada despliegue nuevo aplica solo las migraciones que falten. No hace falta correr nada a mano.

## Paso a paso

### 1. Postgres

1. En el proyecto de Easypanel, crear un servicio **Postgres** (16 o más nuevo).
2. Con el usuario administrador de ese servicio, conectado a la base `postgres`, correr
   `prisma/sql/preparar-base.sql` (desde la consola del servicio o con `psql`):

   ```sh
   psql "postgresql://<admin>:<clave-admin>@<host-postgres>:5432/postgres" \
     -v clave_duena="'<clave larga 1>'" -v clave_app="'<clave larga 2>'" \
     -f prisma/sql/preparar-base.sql
   ```

   Crea la base `deoco`, el rol `deoco_owner` (dueño: **solo** migraciones) y `deoco_app`
   (la aplicación: sin `BYPASSRLS`, no es dueño de nada). Si el archivo no está a mano en el
   servidor, se pueden pegar las tres sentencias en la consola reemplazando `:clave_duena` y
   `:clave_app` por las claves entre comillas simples.

### 2. Aplicación

1. Crear un servicio **App** desde el repositorio de GitHub, rama de producción.
2. Build: **Dockerfile** (el de la raíz del repo).
3. Puerto interno (proxy): **3000**.
4. Volumen: montar un volumen persistente en **`/data/archivos`**. Ahí quedan las fotos,
   logos y riders que suben las bandas. Si no se monta, se pierden en cada despliegue.
5. Variables de entorno (ver tabla abajo).
6. Desplegar. En los logs tiene que aparecer `Aplicando migraciones…` y después
   `Levantando Deoco en el puerto 3000…`.

### 3. Dominios y DNS

En el DNS de `deoco.com` (donde esté registrado):

| Registro | Nombre | Apunta a |
| --- | --- | --- |
| A | `app` | IP del VPS |
| A | `*` (comodín) | IP del VPS |

En el servicio de la aplicación en Easypanel, agregar los dominios con HTTPS:

- `app.deoco.com` → puerto 3000 (el panel).
- Las bandas: `<slug>.deoco.com` → puerto 3000. Hay dos formas, a confirmar en Easypanel:
  - **Un dominio por banda**: se agrega cada subdominio al dar de alta una banda. El
    certificado se emite solo (Let's Encrypt). Es lo más simple; hay que confirmar el límite
    de dominios por proyecto (pendiente que ya marca la spec).
  - **Comodín `*.deoco.com`**: un solo certificado para todas las bandas. Let's Encrypt solo
    emite comodines validando por DNS, así que requiere que Easypanel/Traefik tenga acceso
    al proveedor de DNS (p. ej. Cloudflare).
- Dominio propio de una banda (`labanda.com`): la banda crea un registro A a la IP del VPS, se
  agrega el dominio en Easypanel y se carga en la tabla `dominio` (todavía sin pantalla).

La app distingue panel y sitios **por el host**: es importante que Easypanel pase el `Host`
original (lo hace por defecto).

### 4. Primer acceso

Todavía no existe el back office, así que el staff y las bandas se dan de alta por SQL, con el
rol dueño (`DATABASE_URL_MIGRACIONES`). Primero, el hash de la clave (en la consola del
contenedor de la app; la clave nunca se guarda en claro):

```sh
node -e "require('@node-rs/argon2').hash(process.argv[1]).then(console.log)" 'la-clave'
```

- Staff de Deoco: `prisma/sql/alta-staff.sql`
- Banda + titular (el módulo sitio nace prendido): `prisma/sql/alta-banda.sql`

Las instrucciones exactas están en el encabezado de cada archivo. Después: entrar a
`https://app.deoco.com`, cargar el sitio en el panel, publicar, y verlo en
`https://<slug>.deoco.com`.

## Variables de entorno

| Variable | Obligatoria | Valor en producción |
| --- | --- | --- |
| `DATABASE_URL` | sí | `postgresql://deoco_app:<clave 2>@<host-postgres>:5432/deoco` |
| `DATABASE_URL_MIGRACIONES` | sí | `postgresql://deoco_owner:<clave 1>@<host-postgres>:5432/deoco` |
| `AUTH_SECRET` | sí | 32+ bytes aleatorios: `openssl rand -base64 32` |
| `DEOCO_DOMINIO_RAIZ` | sí | `deoco.com` |
| `DEOCO_ARCHIVOS_DIR` | no | `/data/archivos` (ya es el valor de la imagen) |
| `DEOCO_ALMACEN` | no | `disco` (único implementado) |
| `DEOCO_LIMITE_ALMACENAMIENTO` | no | bytes por banda si no tiene límite propio; por defecto 1 GiB |

`<host-postgres>` es el nombre interno del servicio Postgres en Easypanel (lo muestra el
propio servicio). `NODE_ENV=production` y el puerto ya los fija la imagen.

**Nunca** apuntar `DATABASE_URL` a `deoco_owner` ni al administrador: la app tiene que
conectarse con `deoco_app` para que RLS aísle a las bandas.

## Respaldos

Hay dos cosas que respaldar, y van juntas:

1. **La base** `deoco` (backups del servicio Postgres en Easypanel, o `pg_dump` programado).
2. **El volumen** `/data/archivos` (la base guarda qué archivo es de quién; el volumen, los bytes).

## Actualizar

Push a la rama de producción → Easypanel reconstruye (o "Deploy" a mano) → al arrancar se
aplican las migraciones nuevas. Si una migración falla, el contenedor no levanta y el error
queda en los logs del servicio.

## Qué se verificó y qué no

- **Verificado** (sin Docker, en un Postgres nuevo): `npm ci` y `next build` sin ninguna
  variable de base, `npm prune --omit=dev`, `preparar-base.sql`, las 10 migraciones desde cero
  vía `scripts/arrancar.sh`, `alta-staff.sql` y `alta-banda.sql`, y el servidor en modo
  producción respondiendo panel, sitio público y 404.
- **No verificado**: la construcción de la imagen Docker en sí (desde el entorno de desarrollo
  no se puede descargar la imagen base de Node: Docker Hub y su espejo están bloqueados), y el
  login en producción, que necesita HTTPS (la cookie `__Host-deoco.sesion` es `Secure`).
  Las dos cosas se ven en el primer despliegue.
