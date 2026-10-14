# Despliegue en Easypanel

Deoco se despliega como **una sola aplicación** (monolito modular) más **un Postgres**, en el
VPS de Hostinger con Easypanel. Los certificados salen de Let's Encrypt con un **comodín
`*.deoco.com` validado por DNS en Cloudflare**.

```
 Cloudflare DNS (nube gris)          VPS · Easypanel
 *.deoco.com ─ A ─▶ IP del VPS ──▶ Traefik (TLS, certificado *.deoco.com)
                                     │  Host original + X-Forwarded-Proto: https
                                     ▼
                       servicio "deoco" (Dockerfile) · Next.js :3000
                         app.deoco.com      → panel y /admin
                         <banda>.deoco.com  → sitio público de la banda
                         /data/archivos     → volumen (fotos, logos, riders)
                                     │ deoco_app (con RLS) · deoco_admin (solo /admin)
                                     ▼
                       servicio "postgres" · base "deoco"
```

## Qué hace la imagen (para entender los logs)

- **Build** (`Dockerfile`): `npm ci` + `next build`. El descubrimiento de módulos corre dentro
  de `next build` y deja afuera los marcados `SOLO_DESARROLLO.md` (el módulo de prueba).
- **Arranque** (`scripts/arrancar.sh`):
  1. verifica que estén `DATABASE_URL`, `DATABASE_URL_MIGRACIONES`, `DATABASE_URL_ADMIN`,
     `AUTH_SECRET`, `DEOCO_DOMINIO_RAIZ` y que el volumen se pueda escribir;
  2. aplica las migraciones pendientes (`prisma migrate deploy`, rol dueño);
  3. levanta Next. Antes de atender el primer pedido, **la app se verifica a sí misma**
     (`src/nucleo/arranque.ts`): variables, que `DATABASE_URL` sea un rol sujeto a RLS y no
     el dueño, que `DATABASE_URL_ADMIN` tenga BYPASSRLS, que el build sea de producción, que
     los módulos sean válidos y que la base esté migrada. Si algo falla, **el contenedor se
     cae** con el motivo en el log; nunca queda sirviendo errores.
- Log de un arranque sano, en este orden:
  `Aplicando migraciones…` → `Levantando Deoco en el puerto 3000…` →
  `[deoco] arranque verificado · módulos: sitio, ticketera, tienda` →
  `[deoco] barrido de pendientes: al arrancar y cada 60 s`.
- **Barrido** (`src/nucleo/barrido.ts`): al arrancar y cada `DEOCO_BARRIDO_SEGUNDOS` (60) retoma
  eventos y correos que quedaron pendientes (un reinicio a mitad, un SMTP caído) y, cada 6 h,
  revisa que los dominios propios verificados sigan apuntando al servidor (nada de las bandas
  archivadas). Cada vuelta que hace algo deja `[barrido] pendientes de N banda(s) …`. Un correo que falla
  se reintenta solo dos veces (a los 2 y a los 15 minutos); después queda FALLIDO, a mano.

## Lo que configurás vos, en orden

### A. Cloudflare (dominio `deoco.com`)

1. **Token de API** (My Profile → API Tokens → Create Token → "Edit zone DNS"):
   permisos **Zone · DNS · Edit** y **Zone · Zone · Read**, limitado a la zona `deoco.com`.
   Guardalo: lo usa Traefik para el desafío DNS.
2. **Registro DNS**: `A` · nombre `*` · IP del VPS · **solo DNS (nube gris)**.
   Cubre `app.deoco.com` y todas las bandas. Empezá con la nube gris: el certificado lo pone
   Traefik y hay una pieza menos que mirar si algo falla. (Si después querés el proxy de
   Cloudflare, nube naranja con SSL/TLS en **Full (strict)**.)
3. Si existen registros `TXT _acme-challenge` viejos, borralos: pueden hacer fallar la
   validación.

### B. Easypanel · Traefik (una vez por servidor)

4. **Settings → Traefik → Environment**: definir un *resolver* de certificados que valide por
   DNS con Cloudflare y reiniciar Traefik. Con un resolver llamado `cloudflare`, las variables
   estándar de Traefik son:

   ```
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_EMAIL=<tu email>
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_STORAGE=<ruta del archivo acme que indica la guía>
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_DNSCHALLENGE_PROVIDER=cloudflare
   TRAEFIK_CERTIFICATESRESOLVERS_CLOUDFLARE_ACME_DNSCHALLENGE_RESOLVERS=1.1.1.1:53,1.0.0.1:53
   CF_DNS_API_TOKEN=<el token del paso 1>
   ```

   **Confirmá los nombres y la ruta de `STORAGE` en la guía oficial de Easypanel
   ("Setting Up a Wildcard Domain", easypanel.io/docs/guides/wildcard-domain)**: desde el
   entorno de desarrollo no se pudo abrir y estos valores son los de Traefik, no los
   verificados en Easypanel.

### C. Easypanel · Postgres

5. Crear un servicio **Postgres** (16 o más nuevo) en el proyecto.
6. En la **consola del servicio Postgres** (`psql` como el usuario administrador), pegar con
   tres claves largas distintas (`openssl rand -base64 24`):

   ```sql
   CREATE ROLE deoco_owner LOGIN PASSWORD '<clave 1>' NOSUPERUSER NOCREATEROLE;
   CREATE ROLE deoco_app   LOGIN PASSWORD '<clave 2>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
   CREATE ROLE deoco_admin LOGIN PASSWORD '<clave 3>' NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
   CREATE DATABASE deoco OWNER deoco_owner;
   ```

   (Es `prisma/sql/preparar-base.sql`.) `deoco_owner` solo corre migraciones; `deoco_app` es la
   app, sujeta a RLS; `deoco_admin` es el back office, ve todas las bandas.
7. Anotá el **host interno** del servicio Postgres (lo muestra Easypanel en sus credenciales).

### D. Easypanel · Aplicación

8. Crear un servicio **App** desde el repositorio de GitHub, rama de producción, build con
   **Dockerfile** (el de la raíz).
9. **Variables de entorno**:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://deoco_app:<clave 2>@<host-postgres>:5432/deoco` |
   | `DATABASE_URL_MIGRACIONES` | `postgresql://deoco_owner:<clave 1>@<host-postgres>:5432/deoco` |
   | `DATABASE_URL_ADMIN` | `postgresql://deoco_admin:<clave 3>@<host-postgres>:5432/deoco` |
   | `AUTH_SECRET` | `openssl rand -base64 32` — **fijo**: si cambia, se cierran todas las sesiones |
   | `DEOCO_DOMINIO_RAIZ` | `deoco.com` |
   | `DEOCO_LIMITE_ALMACENAMIENTO` | opcional: bytes por banda (por defecto 1 GiB) |
   | `DEOCO_CLAVE_SECRETOS` | `openssl rand -base64 32` — cifra las credenciales de las bandas. Hoy opcional; obligatoria cuando se prenda un módulo con credenciales (la tienda). **Fija**: guardala aparte |

   `NODE_ENV`, el puerto y `DEOCO_ARCHIVOS_DIR=/data/archivos` ya los fija la imagen. Si una
   clave tiene caracteres como `@`, `:` o `/`, va codificada en la URL (o generala sin ellos).
10. **Volumen** persistente montado en **`/data/archivos`** (si falta, la app no arranca).
11. **Dominio**: `*.deoco.com` → puerto **3000**, HTTPS, con **"Wildcard domain"** activado y
    el resolver `cloudflare`. Ese único dominio cubre `app.deoco.com` y todas las bandas: la app
    distingue panel y sitios por el `Host`. No hace falta configurar `deoco.com` sola (si llega
    un pedido ahí, responde 404).
12. **Deploy**. En los logs, las cuatro líneas de "arranque sano" de arriba.

### E. Cuota de Deoco (Mercado Pago de Deoco)

La cuota mensual es la única plata que entra a Deoco: se cobra en **la cuenta de Mercado Pago de
Deoco**, con credenciales del entorno (nunca en la tabla de credenciales de las bandas). Las
ventas de las bandas siguen yendo a la cuenta de cada banda.

13. En Mercado Pago (cuenta de Deoco) → **Tus integraciones → Crear aplicación** (producto:
    suscripciones). Copiá el **Access token de producción** → `DEOCO_CUOTA_MP_TOKEN`.
14. En esa aplicación → **Webhooks**: URL
    `https://app.deoco.com/avisos/plataforma/comercial/cuota/mercadopago`, eventos de
    **Suscripciones** (planes y suscripciones, pagos autorizados). Copiá la **clave secreta** →
    `DEOCO_CUOTA_MP_SECRETO_AVISOS`. (La URL exacta también está en `/admin/m/comercial/planes`.)
15. Con tu usuario de staff (paso 16), en `https://app.deoco.com/admin/m/comercial/planes`: poné el **precio en pesos** de
    Esencial, Medium y Premium (sin precio no se pueden elegir) y revisá los plazos (prueba 14
    días de Medium, gracia 3, suspensión a los 10 días de mora).

### F. Primer acceso

16. En la **consola del servicio de la app**:

    ```sh
    CLAVE='<tu clave, 10+ caracteres>' node scripts/crear-staff.mjs vos@deoco.com "Tu Nombre"
    ```

    Es la única vez que se toca algo a mano. Todo lo demás se hace en `https://app.deoco.com/admin`.
17. **Prueba de humo** (en este orden; cada paso prueba algo distinto):
    1. `https://app.deoco.com` → candado válido → ingresar con tu usuario.
    2. `https://app.deoco.com/admin` → listado de bandas (vacío).
    3. Nueva banda de prueba (con un email tuyo como titular) → anotá la clave temporal.
    4. La banda arranca en **prueba (Medium)**: Sitio y Tienda ya prendidos (Cuentas en
       `/admin/m/comercial` la muestra "En prueba").
    5. En otra ventana privada, entrar como titular → te pide elegir clave → entra al panel.
    6. Sitio → cargar bio corta y una imagen (una foto de celular) → Publicar.
    7. `https://<slug>.deoco.com` → se ve publicado, con candado válido.
    8. En `/admin`, pasar la banda de prueba a Archivado (confirmando) → su sitio da 404.
    9. Alta sola: en una ventana privada, `https://app.deoco.com/registro` con otro email tuyo →
       llega el mail → link → ingresar → crear banda → queda en su panel; en `/admin`, filtro
       "Alta: Autogestión", aparece. (Necesita `DEOCO_CORREO=smtp`.)

Después de la prueba de humo, la verificación completa (pagos reales de prueba, mails, puerta,
barrido, carga): **`docs/verificacion-despliegue.md`**.

## Qué puede fallar en el primer despliegue y cómo te das cuenta

| Síntoma | Dónde se ve | Causa probable |
| --- | --- | --- |
| El build falla en `npm ci` o al bajar `node:22` | logs de build | red o límite de Docker Hub en el VPS; reintentar |
| `Falta la variable de entorno …` y el contenedor reinicia | logs de la app | variable sin cargar en el servicio |
| `role "deoco_app" does not exist` al migrar | logs de la app | no se corrió el paso 6 |
| `Deoco no puede arrancar:` + lista | logs de la app | lee la lista: dice exactamente qué (rol equivocado en una URL, volumen, etc.) |
| `No se puede escribir en /data/archivos` | logs de la app | falta el volumen del paso 10 |
| El navegador advierte "certificado no válido" | navegador; logs de Traefik (`acme`, `cloudflare`) | token sin permisos, registro en nube naranja, TXT viejos, o variables de Traefik mal escritas |
| Todo da 404, incluido `app.deoco.com` | navegador | `DEOCO_DOMINIO_RAIZ` mal escrito, o el proxy no pasa el `Host` original |
| **Login: ingresás y volvés a la pantalla de ingresar, sin error** | navegador | la cookie `__Host-deoco.sesion` es `Secure`: solo se guarda por **HTTPS**. Entraste por `http://`, o el certificado no está. Revisá en las herramientas del navegador (Application → Cookies → `app.deoco.com`) si la cookie existe |
| Login: después de un redeploy te saca a todos | — | cambió `AUTH_SECRET`; dejalo fijo |
| Formularios del panel fallan con error genérico | logs de la app (`Server Action`, `origin`) | el proxy reescribe `Host`/`Origin`; Traefik por defecto no lo hace |
| Subir una foto grande falla | mensaje en el formulario o logs | más de 25 MB (límite de Deoco); si es menor, un límite de cuerpo en el proxy |

Dos líneas de los logs que **no** son errores (se vieron en el ensayo, todo funcionó igual):

- `prisma:warn Prisma failed to detect the libssl/openssl version…` al migrar: la imagen slim
  no trae el binario `openssl`; las migraciones corren igual (Prisma 7 no carga OpenSSL).
- `DeprecationWarning: Calling client.query() when the client is already executing a query…`:
  viene de adentro de Prisma (consultas en paralelo en una transacción). Solo importa si se
  sube `pg` a la versión 9: no hacerlo hasta que Prisma lo resuelva (`package.json` fija `^8`).

## Variables de entorno (referencia)

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | sí | la app (rol `deoco_app`, con RLS) |
| `DATABASE_URL_MIGRACIONES` | sí | migraciones al arrancar y `crear-staff.mjs` (rol `deoco_owner`) |
| `DATABASE_URL_ADMIN` | sí | solo el back office `/admin` (rol `deoco_admin`) |
| `AUTH_SECRET` | sí | firma de las sesiones (32+ caracteres, fijo) |
| `DEOCO_DOMINIO_RAIZ` | sí | `deoco.com`: el panel es `app.<raíz>`, las bandas `<slug>.<raíz>` |
| `DEOCO_ARCHIVOS_DIR` | no | `/data/archivos` (valor de la imagen) |
| `DEOCO_ALMACEN` | no | `disco` (único implementado) |
| `DEOCO_LIMITE_ALMACENAMIENTO` | no | espacio por banda en bytes; por defecto 1 GiB |
| `DEOCO_CLAVE_SECRETOS` | si algún módulo guarda credenciales | `openssl rand -base64 32` — **fija**: si cambia sin rotar, las credenciales de las bandas no se pueden leer. Para cambiarla, ver "Rotar la clave de secretos" |
| `DEOCO_CLAVE_SECRETOS_ANTERIOR` | solo durante una rotación | La clave vieja: lo que todavía no se recifró se lee con ella |
| `DEOCO_CORREO` | para que salgan correos | `smtp` (producción) o `memoria` (desarrollo). Sin ella, en producción los correos quedan pendientes |
| `DEOCO_SMTP_URL` | con `DEOCO_CORREO=smtp` | `smtps://resend:<API key>@smtp.resend.com:465` |
| `DEOCO_CORREO_REMITENTE` | con `DEOCO_CORREO=smtp` | `tiendas@deoco.com` (dominio verificado en Resend) |
| `DEOCO_DB_CONEXIONES` | no | Conexiones de la app a Postgres (40). Sumadas a las del back office (5) tienen que quedar bajo `max_connections` (100 por defecto) |
| `DEOCO_BARRIDO_SEGUNDOS` | no | Cada cuánto corre el barrido de pendientes (60; mínimo 5) |
| `DEOCO_IP_PUBLICA` | no | IP a la que apuntan los dominios propios; por defecto, la de `app.<raíz>` |
| `DEOCO_CUOTA_MP_TOKEN` | para cobrar la cuota | Access token de producción de la cuenta de Mercado Pago **de Deoco** (no de una banda). Sin él, la app arranca (aviso en el log) pero nadie puede cargar su forma de pago |
| `DEOCO_CUOTA_MP_SECRETO_AVISOS` | recomendada | Clave secreta de webhooks de esa aplicación: con ella se verifica la firma de cada aviso de la cuota |
| `DEOCO_CUOTA_RESPONDER_A` | no | Casilla a la que responden los titulares los mails de la cuota (mora, suspensión) |

## Correo (Resend por SMTP)

1. Cuenta en Resend → **Domains → Add domain** `deoco.com` (o un subdominio de envío). Resend
   muestra registros DNS (SPF/DKIM, y DMARC recomendado): crealos en Cloudflare, **solo DNS**.
2. **API Keys → Create** con permiso de envío.
3. En la app: `DEOCO_CORREO=smtp`, `DEOCO_SMTP_URL=smtps://resend:<API key>@smtp.resend.com:465`,
   `DEOCO_CORREO_REMITENTE=tiendas@deoco.com`. Si falta algo, la app no arranca y dice qué.

Para cambiar de proveedor (Postmark, SES) solo cambia `DEOCO_SMTP_URL`.

## Rotar la clave de secretos

Para cambiar `DEOCO_CLAVE_SECRETOS` (se filtró, o por rutina) sin que las bandas tengan que
volver a cargar sus credenciales:

1. Generá la nueva: `openssl rand -base64 32`. Guardala aparte junto con la vieja.
2. En Easypanel (servicio de la app → Environment): `DEOCO_CLAVE_SECRETOS_ANTERIOR` = la
   **vieja**, `DEOCO_CLAVE_SECRETOS` = la **nueva**. Deploy. Desde acá la app lee con
   cualquiera de las dos y todo lo que se carga va con la nueva: no hay corte.
3. En la consola del servicio de la app:
   `node scripts/rotar-clave-secretos.mjs`
   Recifra todas las credenciales con la nueva, en una sola transacción. Dice cuántas
   recifró. Si alguna no abre con ninguna de las dos claves, no cambia **nada** y dice cuál
   (banda, módulo, clave; nunca el valor): esa la tiene que volver a cargar la banda (o
   borrarla) y se corre de nuevo. Se puede correr las veces que haga falta.
4. Quitá `DEOCO_CLAVE_SECRETOS_ANTERIOR` y hacé deploy. La vieja ya no sirve para nada.

## Respaldos

Dos cosas, juntas: la **base** `deoco` (backups del servicio Postgres o `pg_dump` programado) y
el **volumen** `/data/archivos` (la base sabe qué archivo es de quién; el volumen tiene los bytes).

## Actualizar

Push a la rama de producción → Easypanel reconstruye → al arrancar se aplican solo las
migraciones nuevas. Si una migración o la verificación de arranque fallan, el contenedor no
levanta y el motivo queda en los logs.

### Una vez: credenciales de cobro al núcleo

Desde la versión con ticketera, el token de Mercado Pago es del núcleo (Credenciales → Cobros) y
lo usan la tienda y la ticketera. Si alguna banda ya lo había cargado en la tienda, después del
primer deploy de esa versión corré una vez, en la consola de la app:
`node scripts/mover-credenciales-de-cobro.mjs` (las recifra en su nuevo lugar; repetible). Si
no, el titular las vuelve a cargar en Credenciales.

## Dominio propio de una banda

1. La banda (el titular, en **Panel → Dominios**) o el staff (en `/admin`, detalle de la banda)
   agrega el dominio. La pantalla muestra dos registros exactos para crear en el DNS del dominio:
   `A <dominio> → <IP del servidor>` y `TXT _deoco.<dominio> → deoco-verificacion=<token>`.
2. La banda los crea y toca **Verificar**: la app consulta el DNS. Hasta que verifica, el
   dominio no muestra el sitio (404).
3. **Vos** agregás ese dominio en Easypanel (servicio de la app → Domains → `<dominio>`, puerto
   3000, HTTPS con el resolver HTTP por defecto, **no** el de Cloudflare: el dominio no es
   tuyo). El certificado lo emite Easypanel; la app no lo toca.
4. Cuando `https://<dominio>` abre con candado, la banda puede tocar **Usar como principal**
   (la app lo comprueba: sin certificado válido no lo deja). Desde ahí el subdominio
   `<slug>.deoco.com` redirige al dominio propio.
5. Si la banda **quita** un dominio (con confirmación; nunca el principal ni el subdominio),
   sacalo también de Easypanel.

6. Cada 6 horas la app revisa que cada dominio propio verificado siga apuntando (registro A) al
   servidor. Si dos revisiones seguidas no apunta, la banda ve un aviso en su panel y el
   dominio queda marcado en la lista (también en `/admin`). **No** se despublica ni pierde la
   verificación: cuando la banda corrige el DNS, la próxima revisión lo desmarca.

La IP que se muestra es `DEOCO_IP_PUBLICA` si está definida; si no, la que resuelve
`app.deoco.com` (con el comodín en "solo DNS" es la del VPS). Si alguna vez ponés la nube
naranja de Cloudflare en `deoco.com`, definí `DEOCO_IP_PUBLICA` con la IP del VPS.

## Qué se verificó antes de este despliegue

**Ensayo con la imagen de producción** (octubre 2026): la imagen del `Dockerfile` construida con
Docker, `scripts/arrancar.sh`, un Postgres 16 **nuevo** preparado con `preparar-base.sql` y
Traefik adelante con HTTPS (dominio `deoco.test`, certificado autofirmado):

- Arranque sano: las 39 migraciones aplicadas sobre la base vacía, las cuatro líneas de arriba.
  Al reiniciar: `No pending migrations to apply`.
- Arranque que falla a la vista: sin `DATABASE_URL_ADMIN`, con el volumen de solo lectura y con
  `DATABASE_URL` en el rol dueño (las dos líneas de la verificación de la app).
- La imagen final no trae herramientas de desarrollo ni el módulo de prueba en el build.
- `crear-staff.mjs` en el contenedor; login del staff y del titular con la cookie
  `__Host-deoco.sesion` (`Secure`, `HttpOnly`, solo `app.`); alta de banda, prender Sitio, Tienda
  y Ticketera, clave temporal → cambio de clave.
- Sitio: bio, foto de celular (4032×3024), publicar, sitio público por HTTPS sin cookies.
- Tienda: proveedor y producto base desde `/admin`, credenciales de cobro, "Probar conexión",
  diseño, producto publicado, compra del fan, vuelta "Estamos confirmando", aviso sin firma → 401,
  aviso firmado (HMAC como Mercado Pago) → pagado, mails al fan y al proveedor por SMTP.
- Entradas: show con cupo 2, compra de las dos, QR, tercer intento "agotada", mail con los QR
  embebidos (`cid:`); puerta con el rol PUERTA: válida, "YA ENTRÓ", código inventado.
- Barrido: con el SMTP caído el mail queda FALLIDO (reintento a los 2 min); con el SMTP bueno,
  `[barrido] pendientes de 1 banda(s)` y sale.
- Archivar la banda: sitio y panel 404.

Lo que el ensayo **no** cubre (va en `verificacion-despliegue.md`): Mercado Pago de verdad (se
usó el falso de las pruebas, por `DEOCO_MERCADOPAGO_API`), mails reales (Resend), el
certificado de Let's Encrypt, la cámara de un celular y la carga en el VPS.

Antes, en el entorno de desarrollo, sin Docker, sobre un Postgres **nuevo y vacío**:

- `npm ci` + `next build` **sin ninguna variable de base**, `npm prune --omit=dev`; la salida
  del build no contiene nada del módulo de prueba.
- `preparar-base.sql`, las migraciones desde cero vía `scripts/arrancar.sh`.
- Arranque que falla a la vista: sin `DATABASE_URL_ADMIN` (lo frena `arrancar.sh`), sin
  `AUTH_SECRET` arrancando Next directo (lo frena la verificación de la app) y con
  `DATABASE_URL` apuntando al rol dueño.
- **Detrás de un proxy HTTPS como Traefik**: login del staff con la cookie
  `__Host-deoco.sesion` (`Secure`, `HttpOnly`, solo `app.`), `/admin`, alta de banda,
  prender Sitio, titular con clave temporal → cambio de clave → panel, subida de una foto de
  11 MB, publicar, sitio público por HTTPS sin cookies.
- `scripts/crear-staff.mjs` contra una base real.

**No verificado**: la emisión del certificado comodín en Easypanel. Se ve en el primer
despliegue, en el candado del navegador.
