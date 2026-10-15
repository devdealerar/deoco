# Despliegue en Easypanel

Deoco se despliega como **una sola aplicación** (monolito modular) más **un Postgres**, en el
VPS de Hostinger con Easypanel. Los certificados salen de Let's Encrypt con un **comodín
`*.deocoartist.com` validado por DNS en Cloudflare**.

```
 Cloudflare DNS (nube gris)          VPS · Easypanel
 *.deocoartist.com ─ A ─▶ IP del VPS ──▶ Traefik (TLS, certificado *.deocoartist.com)
                                     │  Host original + X-Forwarded-Proto: https
                                     ▼
                       servicio "deoco" (Dockerfile) · Next.js :3000
                         app.deocoartist.com      → panel y /admin
                         <banda>.deocoartist.com  → sitio público de la banda
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

### A. Cloudflare (dominio `deocoartist.com`)

1. **Token de API** (My Profile → API Tokens → Create Token → "Edit zone DNS"):
   permisos **Zone · DNS · Edit** y **Zone · Zone · Read**, limitado a la zona `deocoartist.com`.
   Guardalo: lo usa Traefik para el desafío DNS.
2. **Registro DNS**: `A` · nombre `*` · IP del VPS · **solo DNS (nube gris)**.
   Cubre `app.deocoartist.com` y todas las bandas. Empezá con la nube gris: el certificado lo pone
   Traefik y hay una pieza menos que mirar si algo falla. Para los dominios propios de las
   bandas todo pasa después a nube naranja: sección "Todo detrás de Cloudflare".
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
   | `DEOCO_DOMINIO_RAIZ` | `deocoartist.com` |
   | `DEOCO_LIMITE_ALMACENAMIENTO` | opcional: bytes por banda (por defecto 1 GiB) |
   | `DEOCO_CLAVE_SECRETOS` | `openssl rand -base64 32` — cifra las credenciales de las bandas. Hoy opcional; obligatoria cuando se prenda un módulo con credenciales (la tienda). **Fija**: guardala aparte |

   `NODE_ENV`, el puerto y `DEOCO_ARCHIVOS_DIR=/data/archivos` ya los fija la imagen. Si una
   clave tiene caracteres como `@`, `:` o `/`, va codificada en la URL (o generala sin ellos).
10. **Volumen** persistente montado en **`/data/archivos`** (si falta, la app no arranca).
11. **Dominio**: `*.deocoartist.com` → puerto **3000**, HTTPS, con **"Wildcard domain"** activado y
    el resolver `cloudflare`. Ese único dominio cubre `app.deocoartist.com` y todas las bandas: la app
    distingue panel y sitios por el `Host`. No hace falta configurar `deocoartist.com` sola (si llega
    un pedido ahí, responde 404).
12. **Deploy**. En los logs, las cuatro líneas de "arranque sano" de arriba.

### E. Cuota de Deoco (Mercado Pago de Deoco)

La cuota mensual es la única plata que entra a Deoco: se cobra en **la cuenta de Mercado Pago de
Deoco**, con credenciales del entorno (nunca en la tabla de credenciales de las bandas). Las
ventas de las bandas siguen yendo a la cuenta de cada banda.

13. En Mercado Pago (cuenta de Deoco) → **Tus integraciones → Crear aplicación** (producto:
    suscripciones). Copiá el **Access token de producción** → `DEOCO_CUOTA_MP_TOKEN`.
14. En esa aplicación → **Webhooks**: URL
    `https://app.deocoartist.com/avisos/plataforma/comercial/cuota/mercadopago`, eventos de
    **Suscripciones** (planes y suscripciones, pagos autorizados). Copiá la **clave secreta** →
    `DEOCO_CUOTA_MP_SECRETO_AVISOS`. (La URL exacta también está en `/admin/m/comercial/planes`.)
15. Con tu usuario de staff (paso 16), en `https://app.deocoartist.com/admin/m/comercial/planes`: poné el **precio en pesos** de
    Esencial, Medium y Premium (sin precio no se pueden elegir) y revisá los plazos (prueba 14
    días de Medium, gracia 3, suspensión a los 10 días de mora).

### F. Primer acceso

16. En la **consola del servicio de la app**:

    ```sh
    CLAVE='<tu clave, 10+ caracteres>' node scripts/crear-staff.mjs vos@deocoartist.com "Tu Nombre"
    ```

    Es la única vez que se toca algo a mano. Todo lo demás se hace en `https://app.deocoartist.com/admin`.
17. **Prueba de humo** (en este orden; cada paso prueba algo distinto):
    1. `https://app.deocoartist.com` → candado válido → ingresar con tu usuario.
    2. `https://app.deocoartist.com/admin` → listado de bandas (vacío).
    3. Nueva banda de prueba (con un email tuyo como titular) → anotá la clave temporal.
    4. La banda arranca en **prueba (Medium)**: Sitio y Tienda ya prendidos (Cuentas en
       `/admin/m/comercial` la muestra "En prueba").
    5. En otra ventana privada, entrar como titular → te pide elegir clave → entra al panel.
    6. Sitio → cargar bio corta y una imagen (una foto de celular) → Publicar.
    7. `https://<slug>.deocoartist.com` → se ve publicado, con candado válido.
    8. En `/admin`, pasar la banda de prueba a Archivado (confirmando) → su sitio da 404.
    9. Alta sola: en una ventana privada, `https://app.deocoartist.com/registro` con otro email tuyo →
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
| Todo da 404, incluido `app.deocoartist.com` | navegador | `DEOCO_DOMINIO_RAIZ` mal escrito, o el proxy no pasa el `Host` original |
| **Login: ingresás y volvés a la pantalla de ingresar, sin error** | navegador | la cookie `__Host-deoco.sesion` es `Secure`: solo se guarda por **HTTPS**. Entraste por `http://`, o el certificado no está. Revisá en las herramientas del navegador (Application → Cookies → `app.deocoartist.com`) si la cookie existe |
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
| `DEOCO_DOMINIO_RAIZ` | sí | `deocoartist.com`: el panel es `app.<raíz>`, las bandas `<slug>.<raíz>` |
| `DEOCO_ARCHIVOS_DIR` | no | `/data/archivos` (valor de la imagen) |
| `DEOCO_ALMACEN` | no | `disco` (único implementado) |
| `DEOCO_LIMITE_ALMACENAMIENTO` | no | espacio por banda en bytes; por defecto 1 GiB |
| `DEOCO_CLAVE_SECRETOS` | si algún módulo guarda credenciales | `openssl rand -base64 32` — **fija**: si cambia sin rotar, las credenciales de las bandas no se pueden leer. Para cambiarla, ver "Rotar la clave de secretos" |
| `DEOCO_CLAVE_SECRETOS_ANTERIOR` | solo durante una rotación | La clave vieja: lo que todavía no se recifró se lee con ella |
| `DEOCO_CORREO` | para que salgan correos | `smtp` (producción) o `memoria` (desarrollo). Sin ella, en producción los correos quedan pendientes |
| `DEOCO_SMTP_URL` | con `DEOCO_CORREO=smtp` | `smtps://resend:<API key>@smtp.resend.com:465` |
| `DEOCO_CORREO_REMITENTE` | con `DEOCO_CORREO=smtp` | `tiendas@deocoartist.com` (dominio verificado en Resend) |
| `DEOCO_DB_CONEXIONES` | no | Conexiones de la app a Postgres (40). Sumadas a las del back office (5) tienen que quedar bajo `max_connections` (100 por defecto) |
| `DEOCO_BARRIDO_SEGUNDOS` | no | Cada cuánto corre el barrido de pendientes (60; mínimo 5) |
| `DEOCO_CLOUDFLARE_TOKEN` / `DEOCO_CLOUDFLARE_ZONA` | para dominios propios | Token de API de Cloudflare y el id de la zona de `DEOCO_DOMINIO_RAIZ` (custom hostnames). Las dos o ninguna |
| `DEOCO_CLOUDFLARE_CUENTA` / `DEOCO_IP_PUBLICA` | con las dos anteriores | Id de la cuenta de Cloudflare (ahí se crean las zonas de los dominios delegados) e IP del VPS (a la que apuntan, con proxy) |
| `DEOCO_CUOTA_MP_TOKEN` | para cobrar la cuota | Access token de producción de la cuenta de Mercado Pago **de Deoco** (no de una banda). Sin él, la app arranca (aviso en el log) pero nadie puede cargar su forma de pago |
| `DEOCO_CUOTA_MP_SECRETO_AVISOS` | recomendada | Clave secreta de webhooks de esa aplicación: con ella se verifica la firma de cada aviso de la cuota |
| `DEOCO_CORREO_DIAS_ADJUNTOS` / `_CUERPO` / `_BORRAR` | no | Limpieza de correos enviados: días hasta vaciar adjuntos (7), cuerpo (90) y borrar la fila (365). Lo pendiente o fallido no se toca |
| `DEOCO_CUOTA_RESPONDER_A` | recomendada | Casilla de Deoco a la que responden las bandas los mails de Deoco (alta sola, mora, suspensión). Sin ella, esos mails no ofrecen "respondé este mail" |

## Correo (Resend por SMTP)

1. Cuenta en Resend → **Domains → Add domain** `deocoartist.com` (o un subdominio de envío). Resend
   muestra registros DNS (SPF/DKIM, y DMARC recomendado): crealos en Cloudflare, **solo DNS**.
2. **API Keys → Create** con permiso de envío.
3. En la app: `DEOCO_CORREO=smtp`, `DEOCO_SMTP_URL=smtps://resend:<API key>@smtp.resend.com:465`,
   `DEOCO_CORREO_REMITENTE=tiendas@deocoartist.com`. Si falta algo, la app no arranca y dice qué.

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

## Todo detrás de Cloudflare (Deoco en nube naranja)

Decisión (docs/diseno-dominios.md §1, opción A **acotada**): Deoco (`app.`, los subdominios de
banda y los dominios propios) pasa por Cloudflare; los **otros servicios del VPS no se tocan**
(siguen en gris con Let's Encrypt) y las opciones TLS `default` de Traefik **no se cambian**.

> **⚠️ ANTES DE EMPEZAR: los dominios de Deoco tienen que salir de Easypanel.**
> **Si en Easypanel queda cargado `app.deocoartist.com` (o `*.deocoartist.com`) en el servicio
> de la app, Easypanel genera su propia ruta para ese host. Con dos rutas para el mismo host y
> opciones TLS distintas, Traefik usa `default` para las dos: el certificado de cliente de
> `app.` (`aop`) se pierde EN SILENCIO. Todo sigue andando y nada avisa en pantalla; solo queda
> una línea en el log de Traefik ("Found different TLS options for routers on the same host").**
> **Es el error más fácil de cometer y el más difícil de ver. Sacalos (paso 7) y revisá el log
> (sección "Verificar").**

Lo que dijo tu Easypanel: Traefik **3.6.7**; en `/etc/easypanel/traefik/config/` solo está
`main.yaml` (lo regenera Easypanel) y no define ninguna opción TLS; el editor de
"Configuración personalizada" escribe el YAML propio.

**Lo que mostró el ensayo** (Traefik 3.6.7, imagen oficial; detalle en el diseño §1):

- Una opción TLS con nombre propio (`aop`) en una ruta solo se aplica si la ruta nombra un host
  exacto (`Host(...)`). En `app.<raíz>` exige el certificado de Cloudflare (sin él, o con otro,
  la conexión se corta). En las rutas `HostRegexp` (subdominios de banda y dominios propios,
  que no se pueden enumerar) **no se aplica**: Traefik usa `default` y lo avisa en el log.
- Por eso esas rutas llevan además una **lista de IPs de Cloudflare** (`ipAllowList`): no
  depende del SNI. Quien entra directo a la IP recibe 403; el servicio ajeno no se entera.
- Si la ruta que genera Easypanel para `app.<raíz>` queda, hay dos rutas con el mismo host y
  opciones distintas: Traefik usa `default` para las dos y **`aop` se pierde sin avisar** (solo
  en el log). Por eso los dominios de Deoco **se sacan de Easypanel** y sus rutas quedan solo
  en el YAML propio.

Resultado: `app.` (panel, back office, webhooks de pagos) con certificado de cliente **y**
lista de IPs; los sitios de las bandas (públicos) con la lista de IPs. Lo que queda abierto:
alguien con su propia cuenta de Cloudflare apuntando a nuestra IP pasa la lista, pero solo
llega a hosts que la app no conoce (404): no puede usar el host de una banda (esas zonas y
custom hostnames son nuestros).

### Una vez, en orden

1. **Anotá dos datos de `main.yaml` antes de tocar nada** (en la consola del VPS):

   ```sh
   grep -n "entryPoints" /etc/easypanel/traefik/config/main.yaml | sort -u | head
   grep -n -B2 -A6 "app.deocoartist.com" /etc/easypanel/traefik/config/main.yaml
   ```

   El nombre del entrypoint del 443 (en el YAML de abajo, `https`) y la URL del servicio de la
   app (`url: "http://<proyecto>_<servicio>:3000/"` o parecida). Si son distintos, cambialos
   en el YAML.
2. **Dónde ve Traefik los archivos**: `/etc/easypanel/traefik/certs/` tiene que estar montado
   en el contenedor de Traefik. Confirmalo y anotá la ruta de adentro:

   ```sh
   docker inspect $(docker ps -q -f name=traefik) --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
   ```

   El YAML usa `/etc/easypanel/traefik/certs/...`; si adentro es otra ruta, usá esa.
3. **Certificado de origen de Cloudflare** (lo que presenta el VPS a Cloudflare para Deoco):
   - Cloudflare → `deocoartist.com` → SSL/TLS → Origin Server → **Create Certificate** →
     "Generate private key and CSR with Cloudflare", RSA (2048), hostnames
     `deocoartist.com` y `*.deocoartist.com`, validez 15 años → Create.
   - Copiá el **certificado** (PEM) a `/etc/easypanel/traefik/certs/deocoartist-origen.pem` y la
     **clave** a `/etc/easypanel/traefik/certs/deocoartist-origen.key` (`chmod 600` la clave). La
     clave se muestra una sola vez.
   - Bajá el certificado de la CA de **Authenticated Origin Pulls** (zone-level) de la
     documentación de Cloudflare ("Zone-level authenticated origin pulls", archivo
     `authenticated_origin_pull_ca.pem`) a
     `/etc/easypanel/traefik/certs/cloudflare-origin-pull-ca.pem`.

   Este certificado solo lo acepta Cloudflare (un navegador directo lo rechaza): sirve
   únicamente con la nube naranja. Para los dominios propios Traefik presenta el suyo por
   defecto; por eso esas zonas van en modo **Full** (no estricto), que la app pone sola en las
   zonas que crea.
4. **Lista de IPs de Cloudflare**, generada en el VPS (la de abajo es la que conocíamos al
   escribir esto; desde el entorno de desarrollo no se pudo bajar: compará antes de pegar):

   ```sh
   curl -s https://api.cloudflare.com/client/v4/ips | jq -r '.result.ipv4_cidrs[], .result.ipv6_cidrs[]'
   ```
5. **Configuración personalizada** de Traefik en Easypanel (el editor): pegá esto, con los
   datos de los pasos 1, 2 y 4.

   ```yaml
   http:
     routers:
       # Panel, back office y webhooks: host exacto → acá sí se exige el certificado de Cloudflare.
       deoco-app:
         rule: "Host(`app.deocoartist.com`)"
         entryPoints: [https]
         service: deoco
         middlewares: [deoco-solo-cloudflare]
         tls:
           options: aop
       # Subdominios de banda y dominios propios: no se pueden enumerar (HostRegexp), así que
       # el certificado de cliente no aplica; los protege la lista de IPs de Cloudflare.
       deoco-sitios:
         rule: "HostRegexp(`.+`)"
         priority: 1
         entryPoints: [https]
         service: deoco
         middlewares: [deoco-solo-cloudflare]
         tls: {}
     middlewares:
       deoco-solo-cloudflare:
         ipAllowList:
           sourceRange:
             - 173.245.48.0/20
             - 103.21.244.0/22
             - 103.22.200.0/22
             - 103.31.4.0/22
             - 141.101.64.0/18
             - 108.162.192.0/18
             - 190.93.240.0/20
             - 188.114.96.0/20
             - 197.234.240.0/22
             - 198.41.128.0/17
             - 162.158.0.0/15
             - 104.16.0.0/13
             - 104.24.0.0/14
             - 172.64.0.0/13
             - 131.0.72.0/22
             - 2400:cb00::/32
             - 2606:4700::/32
             - 2803:f800::/32
             - 2405:b500::/32
             - 2405:8100::/32
             - 2a06:98c0::/29
             - 2c0f:f248::/32
     services:
       deoco:
         loadBalancer:
           servers:
             - url: "http://<proyecto>_<servicio>:3000/"   # la del paso 1
   tls:
     options:
       aop:
         clientAuth:
           caFiles:
             - /etc/easypanel/traefik/certs/cloudflare-origin-pull-ca.pem
           clientAuthType: RequireAndVerifyClientCert
     certificates:
       - certFile: /etc/easypanel/traefik/certs/deocoartist-origen.pem
         keyFile: /etc/easypanel/traefik/certs/deocoartist-origen.key
   ```

   `deoco-sitios` tiene la prioridad mínima: los servicios ajenos (con su `Host(...)`) le ganan
   siempre. No hay `tls.options.default` en ningún lado.
6. **Cloudflare, zona `deocoartist.com`**:
   - SSL/TLS → modo **Full (strict)** (el VPS presenta el certificado de origen para
     `deocoartist.com` y `*.deocoartist.com`). Los custom hostnames de las bandas usan la
     configuración de esta zona: si en el ensayo real Cloudflare no acepta el certificado por
     defecto de Traefik para ellos, una **Configuration Rule** con SSL "Full" para los hosts que
     no terminan en `.deocoartist.com`.
   - SSL/TLS → Origin Server → **Authenticated Origin Pulls**: prendido.
   - `A app` y `A *` → nube **naranja**. `A origen` (naranja, **fallback origin** de Custom
     Hostnames) y `CNAME customers` → `origen.deocoartist.com` (naranja).
   - El token de API (`DEOCO_CLOUDFLARE_TOKEN`), con: en la zona `deocoartist.com`, *SSL and
     Certificates · Edit* (custom hostnames); en la cuenta, *Zone · Edit*, *Zone Settings ·
     Edit* y *DNS · Edit* sobre todas las zonas (crear las de los dominios delegados, ponerlas
     en Full y cargar sus registros). Id de la zona → `DEOCO_CLOUDFLARE_ZONA`; id de la cuenta
     → `DEOCO_CLOUDFLARE_CUENTA`; IP del VPS → `DEOCO_IP_PUBLICA`.
7. **Easypanel, servicio de la app**: sacá sus dominios (`app.deocoartist.com` y
   `*.deocoartist.com`). Así Easypanel no genera rutas para Deoco (que pisarían `aop`) ni pide
   certificados a Let's Encrypt para ellos. Los otros servicios, igual que antes.
8. **El resolver de Let's Encrypt por DNS** (sección B) **se queda** (decidido). Ya no lo usa
   Deoco, pero es lo que hace rápida la vuelta atrás (abajo): con él, Traefik vuelve a sacar el
   certificado de `*.deocoartist.com` en un par de minutos.

### Verificar

- `https://app.deocoartist.com` y el sitio de una banda abren (por Cloudflare).
- Directo a la IP, salteando Cloudflare, **no** se entra:

  ```sh
  curl -sk --resolve app.deocoartist.com:443:<IP del VPS> https://app.deocoartist.com/      # corta en TLS
  curl -sk --resolve labanda.deocoartist.com:443:<IP del VPS> https://labanda.deocoartist.com/  # 403
  ```
- **Que la lista vea la IP real**: si Traefik recibe las conexiones por la red interna de Docker
  (puertos publicados en modo "ingress"), vería una IP interna y **todo** daría 403. Si al
  aplicar el YAML los sitios dan 403 por Cloudflare, sacá `middlewares` (vuelta atrás, paso 1)
  y avisame: hay que publicar los puertos de Traefik en modo `host`.
- En los logs de Traefik no tiene que aparecer "Found different TLS options for routers on the
  same host app.deocoartist.com" (señal de que quedó una ruta de Easypanel para `app.`).
- Los servicios ajenos, igual que antes (gris, Let's Encrypt).

### Vuelta atrás rápida (si Cloudflare se cae)

Con Deoco detrás de Cloudflare, si Cloudflare se cae, Deoco se cae (los otros servicios no). Para
servir Deoco directo (minutos, más lo que tarde el DNS):

1. **Editor de Traefik**: reemplazá el YAML propio por la versión **directa** (sin `aop`, sin
   lista de IPs y con el certificado de Let's Encrypt por el resolver de la sección B):

   ```yaml
   http:
     routers:
       deoco-app:
         rule: "Host(`app.deocoartist.com`)"
         entryPoints: [https]
         service: deoco
         tls:
           certResolver: cloudflare
           domains:
             - main: deocoartist.com
               sans: ["*.deocoartist.com"]
       deoco-sitios:
         rule: "HostRegexp(`.+`)"
         priority: 1
         entryPoints: [https]
         service: deoco
         tls:
           certResolver: cloudflare
           domains:
             - main: deocoartist.com
               sans: ["*.deocoartist.com"]
     services:
       deoco:
         loadBalancer:
           servers:
             - url: "http://<proyecto>_<servicio>:3000/"
   ```

   (`cloudflare` es el nombre del resolver de la sección B. Pide el certificado por DNS, que
   anda aunque el proxy de Cloudflare esté caído, si la API de Cloudflare responde.)
2. **Cloudflare, zona `deocoartist.com`**: `A app`, `A *` y `A origen` a **nube gris**. Si el
   panel y la API de Cloudflare no responden, no hay cómo cambiar el DNS (lo sirve Cloudflare):
   la única salida es cambiar los nameservers de `deocoartist.com` en el registrador (horas).
3. Mirá que `https://app.deocoartist.com` abra con candado (Let's Encrypt).
4. **Dominios propios de las bandas**: no tienen certificado sin Cloudflare (abren con
   advertencia hasta volver). El subdominio de cada banda sigue con candado: si la caída va
   para largo, el staff puede pasar las bandas afectadas a su subdominio como principal.
5. La app no necesita cambios: sin Cloudflare lee la IP del visitante de `x-forwarded-for`.

Para volver a Cloudflare: nube naranja y después el YAML de arriba (con `aop` y la lista).

## Dominio propio de una banda

Dos caminos. **Delegar** (recomendado; también el `.com.ar`):

1. La banda escribe `labanda.com` en "Delegar un dominio". La app crea la zona en la cuenta de
   Cloudflare (Cloudflare trae los registros que el dominio ya tenía, por ejemplo el MX del
   correo), le pone los registros del sitio (`labanda.com` con proxy a `DEOCO_IP_PUBLICA`,
   `www` como CNAME) y agrega `labanda.com` y `www.labanda.com` a la banda. Muestra los dos
   nameservers y la lista de lo que trajo.
2. La banda cambia los nameservers donde lo registró (en nic.ar, "Delegar"). Si el `.com.ar`
   todavía no está registrado, el panel lo dice y espera.
3. El barrido mira cada 10 minutos: cuando Cloudflare activa la zona, los dos quedan
   verificados solos. El certificado universal lo emite Cloudflare; con él activo, "Usar como
   principal". Si en 14 días nadie cambió los nameservers, el pedido vence: se borran la zona y
   el dominio (queda libre para otra banda); el panel lo avisa 2 días antes.
4. Un dominio conectado por CNAME se pasa a delegado con "Pasarme a delegar", sin corte: sigue
   andando por CNAME hasta que la zona se activa.

**Conectar por CNAME** (la banda conserva su DNS; solo con `www`):

1. La banda (el titular, en **Panel → Dominios**) o el staff (en `/admin`, detalle de la banda)
   agrega el dominio, por ejemplo `www.labanda.com`. La app crea su **custom hostname** en
   Cloudflare y muestra dos registros exactos para el DNS del dominio:
   `CNAME <dominio> → customers.deocoartist.com` y `TXT _deoco.<dominio> → deoco-verificacion=<token>`.
2. La banda los crea y toca **Verificar**: la app pregunta a Cloudflare si ve el CNAME (custom
   hostname activo) y busca el TXT de esa banda. Hasta que verifica, el dominio no muestra el
   sitio (404).
3. El certificado lo emite Cloudflare solo. Cuando está activo, la banda puede tocar **Usar como
   principal** (la app se lo pregunta a Cloudflare en ese momento). Desde ahí el subdominio
   `<slug>.deocoartist.com` redirige al dominio propio. **Nadie toca Easypanel.**
4. Si la banda **quita** un dominio (con confirmación; nunca el principal ni el subdominio), la
   app borra su custom hostname en Cloudflare.
5. Cada 6 horas la app revisa, según Cloudflare, que cada dominio propio verificado siga
   llegando y con certificado. Si dos revisiones seguidas no, la banda ve un aviso en su panel y
   el dominio queda marcado en la lista (también en `/admin`). **No** se despublica ni pierde la
   verificación: cuando se corrige, la próxima revisión lo desmarca.

Sin `DEOCO_CLOUDFLARE_TOKEN` y `DEOCO_CLOUDFLARE_ZONA`, el panel dice que los dominios propios
todavía no están habilitados. El dominio sin www (`labanda.com`) por CNAME no lo soporta
Cloudflare for SaaS: la banda usa `www.`; delegar los nameservers (para el dominio sin www)
llega en una parte siguiente (D3).

## Qué se verificó antes de este despliegue

**Segundo ensayo con la imagen de producción** (planes, cuotas y autogestión): imagen nueva del
`Dockerfile`, Postgres 16 **vacío** preparado con `preparar-base.sql`, Traefik con HTTPS
(`deoco.test`), Mercado Pago y SMTP falsos:

- Arranque sano: las 46 migraciones sobre la base vacía; módulos `comercial, sitio, ticketera,
  tienda` (el de prueba, afuera); `crear-staff.mjs` en el contenedor.
- El staff pone los precios en pesos (Planes); la URL de avisos de la cuota se ve ahí.
- Alta sola: `/ingresar` → "Creá tu banda" → registro → **sin usuario hasta confirmar** → mail por
  SMTP con el link (token después de "#") → confirmar → ingresar → crear banda "Los del Ensayo"
  eligiendo **Premium** → pasarela de **Deoco** (token del entorno, referencia = la banda, primer
  cobro al terminar la prueba) → vuelve a Plan y pago con Premium y "Mercado Pago · Visa"; el menú
  ya tiene Entradas; el sitio responde en su subdominio.
- Cuota: aviso sin firma → 401; cobro aprobado firmado → "Pagado hasta" un mes, el cobro en
  `comercial_cobro`; nada en las tablas de ventas ni en `secreto`.
- Vender: sitio publicado; credenciales de cobro **de la banda** (otra cuenta); proveedor y producto
  base del staff; producto publicado; compra del fan → pagado; show con cupo 2 → entradas con QR,
  tercer intento "agotada". Mails al fan, al proveedor y con QR (`cid:`).
- Mora: cobro rechazado → MOROSO, aviso en el panel, mail "no pudimos cobrar la cuota". Diez días
  después (reinicio: la tarea corre al arrancar) → SUSPENDIDO, mail; panel 403 salvo Plan y pago;
  sitio público y tienda 200. Cobro aprobado → ACTIVO al instante, panel 200.
- Capturas: `docs/capturas/20-…` a `27-…`.

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
