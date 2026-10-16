# Lista de verificación · el día del despliegue

Lo que no se puede probar en el entorno de desarrollo (pasarela real, mails reales, certificados,
un celular, el VPS). Se hace **después** de `docs/despliegue.md` (pasos A–E y la prueba de humo),
en este orden: cada paso usa lo que dejó el anterior.

Cada punto: **qué hago**, **qué tiene que pasar**, **si falla**. Anotá al lado fecha y resultado.

Datos que vas a usar:

- Una **banda de prueba** creada desde `/admin` (slug `prueba-deploy`, titular con un email tuyo),
  con **Sitio**, **Tienda** y **Ticketera** prendidos. Al terminar, se archiva.
- Su id (lo pide la URL de los avisos): en la consola de Postgres,
  `SELECT id FROM tenant WHERE slug = 'prueba-deploy';`
- Dos casillas de correo tuyas: una **Gmail** y una **Outlook/Hotmail**.
- Un **celular Android** (Chrome) y, si podés, un **iPhone** (Safari).

---

## 1. Arranque y barrido

**Qué hago.** Deploy. En los logs de la app, buscar:

1. `[deoco] arranque verificado · módulos: sitio, ticketera, tienda` (sin `prueba`).
2. `[deoco] barrido de pendientes: al arrancar y cada 60 s`.

**Qué tiene que pasar.** Las dos líneas, en ese orden, y el contenedor sigue arriba (no
reinicia). Las migraciones aplicadas sin error justo antes.

**Si falla.**
- Sin la primera línea: arriba aparece `Deoco no puede arrancar:` con la lista de qué falta
  (variable, rol, volumen). Corregir eso; ver la tabla de `despliegue.md`.
- Con la primera pero sin la segunda: el barrido no se inició (`src/instrumentation.ts`). No
  sigas con los pagos: un aviso o un mail que quede pendiente no se retomaría nunca.

La prueba de que el barrido **retoma** algo de verdad está en el punto 8.

## 2. Certificado comodín (`*.deocoartist.com`)

**Qué hago.**
```sh
curl -sI https://app.deocoartist.com/ingresar | head -1
curl -sI https://prueba-deploy.deocoartist.com/ | head -1
echo | openssl s_client -connect prueba-deploy.deocoartist.com:443 -servername prueba-deploy.deocoartist.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName -dates
```
Y abrir las dos direcciones en el celular (no solo en la compu).

**Qué tiene que pasar.** `HTTP/2 200` en las dos; el certificado con `DNS:*.deocoartist.com` en el
SAN, emitido por Let's Encrypt, vigente. Candado sin advertencias en el celular.

**Si falla.** Logs de Traefik (`acme`, `cloudflare`). Lo usual: el token de Cloudflare sin
permiso de DNS, el registro `*` en nube naranja, `TXT _acme-challenge` viejos, o los nombres de
variables de Traefik mal escritos (`despliegue.md`, paso B). Sin esto no sigas: la cámara de la
puerta, la cookie de sesión y la vuelta de Mercado Pago necesitan https.

## 3. Credenciales de cobro al núcleo (una sola vez)

**Qué hago.** En la consola de la app, una vez:
```sh
node scripts/mover-credenciales-de-cobro.mjs
```

**Qué tiene que pasar.** `Listo: N credenciales movidas a Cobros, M ya estaban.` En un servidor
nuevo, `0 … 0` (no había nada). Si lo corrés de nuevo, `0 movidas` y las mismas `ya estaban`:
es repetible.

**Si falla.**
- `Faltan DEOCO_CLAVE_SECRETOS … o DATABASE_URL_MIGRACIONES`: la consola no tiene las
  variables del servicio; correlo desde la consola **del servicio de la app**.
- Un error de descifrado: la `DEOCO_CLAVE_SECRETOS` no es la misma con la que se cargaron.
  No cambies la clave: avisá a la banda que vuelva a cargar el token en Credenciales → Cobros.

## 4. Mails de verdad (Resend)

**Qué hago.**
1. En Resend → Domains: el dominio en **Verified** (SPF y DKIM en verde; DMARC creado).
2. Los mails de verdad salen con las compras: hacé los puntos 5 y 6 con el comprador usando
   **tu Gmail** una vez y **tu Outlook** otra, y volvé acá con cada mail recibido.
3. Para cada mail recibido:
   - ¿Llegó a la **bandeja de entrada** (no a Spam/Promociones/Correo no deseado)?
   - Gmail → ⋮ → **Mostrar original**: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
   - El remitente se ve como **el nombre de la banda**, la dirección es la de Deoco.
   - **Responder**: el "Para" tiene que ser el email de la banda (titular o el contacto de la
     tienda), **nunca** una dirección de Deoco.
4. En [mail-tester.com](https://www.mail-tester.com): hacer una compra con el email que da la
   página como comprador; puntaje.

**Qué tiene que pasar.** Inbox en las dos, PASS en las tres, responder va a la banda, mail-tester
9/10 o más.

**Si falla.**
- No llega y en `/admin` (o en la tabla `correo`) queda `FALLIDO` con `error`: leer el error
  (usuario/clave SMTP, remitente de un dominio no verificado). Se reintenta solo a los 2 y a los
  15 minutos; después, a mano.
- Llega a spam: casi siempre falta DMARC o DKIM. Revisar los registros en Cloudflare (nube
  **gris**). Si siguen en spam con todo PASS, es reputación del dominio nuevo: mandar pocos
  mails los primeros días y pedir a quien lo recibe que lo marque como "no es spam".
- Responder va a Deoco: es un bug (desde G3 no debería pasar). Anotá el mail y frená.

## 5. Mercado Pago · tienda, de punta a punta

**Preparación (una vez).** En Mercado Pago Developers:
1. **Cuentas de prueba**: crear un usuario de prueba **vendedor** y uno **comprador**.
2. Entrar como el **vendedor de prueba**, crear una aplicación (Checkout Pro) y copiar su
   **Access token** (`APP_USR-…`, son las credenciales "de producción" de la cuenta de prueba).
3. En esa aplicación → **Webhooks**: activar notificaciones de **Pagos**, URL
   `https://app.deocoartist.com/avisos/<id de la banda>/tienda/pago/mercadopago`, y copiar la
   **clave secreta**.
4. En el panel de la banda de prueba (como titular) → **Credenciales → Cobros**: pegar el
   access token y la clave secreta. **Probar conexión**: tiene que mostrar el nombre del
   vendedor de prueba.

**Qué hago.**
1. Desde `/admin` (o el staff en el back office de la tienda): un proveedor y un producto base.
   Como titular: un producto en la tienda, publicado.
2. En una ventana privada, en `https://prueba-deploy.deocoartist.com/tienda`: agregar al carrito,
   checkout con tu Gmail, **Pagar**. En Mercado Pago, entrar con el **comprador de prueba** y
   pagar con una tarjeta de prueba aprobada (titular `APRO`).
3. Volver al sitio (botón de Mercado Pago o redirección).
4. Repetir con titular `OTHE` (rechazado).
5. Firma: con la clave secreta cargada,
   ```sh
   curl -si -X POST "https://app.deocoartist.com/avisos/<id>/tienda/pago/mercadopago?data.id=1&type=payment" \
     -H 'x-signature: ts=1,v1=00' -H 'x-request-id: x' -H 'content-type: application/json' -d '{}' | head -1
   ```

**Qué tiene que pasar.**
- Al pagar: Mercado Pago muestra el nombre de la banda / el vendedor de prueba, el total igual
  al del checkout (productos + un envío por proveedor).
- Al volver: la página del pedido muestra **"Estamos confirmando tu pago"** y se actualiza sola
  hasta **"¡Pago recibido!"** (el aviso tarda segundos). La URL de vuelta **no** tiene el token (`?resultado=exito`
  y nada más).
- En el panel → Pedidos: **Pagado**; en Deuda, la del proveedor; el proveedor ve su orden en
  `app.deocoartist.com/portal/tienda`.
- Mails: al fan (confirmación, con link a su pedido) y al proveedor (orden, sin montos de venta).
- Rechazado: el pedido sigue esperando el pago; la página dice **"El pago no se completó"**
  ("No se te cobró nada. Podés intentar de nuevo.").
- El `curl` con firma falsa: `HTTP/2 401`.
- Logs: ningún `Error` ni stack trace del aviso.

**Si falla.**
- **"La banda no tiene la pasarela conectada"** al pagar: faltan credenciales (paso 4 de la
  preparación).
- **Vuelve y queda en "Estamos confirmando tu pago" para siempre**: el aviso no llega o no se registra. En los
  logs de Traefik/app buscar `POST /avisos/…`. Sin línea: la URL del webhook está mal o Mercado
  Pago no notifica (Webhooks → historial de notificaciones muestra el código que recibió). Con
  `401`: la clave secreta cargada no es la de esa aplicación. Con `409`: la banda no tiene
  credenciales. Con `500`: la API de Mercado Pago no respondió (reintenta sola).
- **Pagado pero sin mails**: punto 4 (correo).
- **Queda EN_REVISION**: monto o moneda distintos. Mirar la observación del pedido; si el
  total de Mercado Pago no coincide con el del checkout, es un bug: anotar los dos montos.

## 6. Mercado Pago · entradas, de punta a punta

**Qué hago.**
1. Como titular → **Entradas**: un show con fecha futura, un tipo "General" con cupo **2**,
   publicado. En el sitio aparece en **Fechas**.
2. Ventana privada → comprar **2** entradas (dos nombres y documentos), email de **Outlook**,
   pagar con `APRO` con el comprador de prueba. Volver al sitio.
3. Otra ventana privada → intentar comprar 1 más.
4. Abrir el mail de entradas en **Gmail web, Gmail en el celular y Outlook** (web y, si tenés,
   la app de escritorio).

**Qué tiene que pasar.**
- La vuelta muestra "Estamos confirmando tu pago. Esta página se actualiza sola." y después
  las **dos entradas con su QR**, sin pedir nada (la
  cookie del sitio). La URL de vuelta no tiene el token.
- El tercer intento: **`"General" está agotada.`** (no un error técnico).
- El mail: un QR por entrada **visible** en los cuatro clientes (no como adjunto suelto ni
  bloqueado), el código de 10 letras abajo, el link "Tus entradas están siempre en…" abre las
  entradas en un navegador nuevo (el link lleva el token después de `#`).
- Panel → el show: 2 vendidas, 0 disponibles.

**Si falla.**
- **QR no se ve en Outlook**: Outlook a veces bloquea imágenes hasta "Mostrar imágenes"; las
  `cid:` igual tienen que estar como imágenes del mail, no como adjuntos sin mostrar. Si solo se
  ven como adjuntos, anotar cliente y versión: hay que probar otra forma de embeber.
- **El link del mail no abre las entradas**: probar en otro navegador; si sigue, anotar la URL
  (sin el token) y el estado de la compra.
- Lo demás, como en el punto 5.

## 7. La puerta, con un celular de verdad

**Qué hago.**
1. En `/admin` → la banda de prueba → **Miembros**: sumar a alguien con rol **PUERTA** (o usar
   al titular).
2. En el **celular**, por **https**, entrar con ese usuario a
   `https://app.deocoartist.com/b/prueba-deploy/puerta` y elegir el show.
3. Aceptar el permiso de la cámara. Escanear la entrada 1 desde **otra pantalla** (el mail en
   la compu) y la entrada 2 **impresa** en papel.
4. Escanear la entrada 1 otra vez.
5. Tipear el código de la entrada 2 a mano (con el teclado de la pantalla).
6. Modo avión, escanear, sacar el modo avión.
7. Repetir 2–4 en el otro celular (iPhone/Safari si tenés).

**Qué tiene que pasar.**
- El navegador pide la cámara (cámara trasera) y la imagen se ve.
- Entrada válida: pantalla **verde** con nombre, documento y tipo.
- Segunda vez: **"YA ENTRÓ"** con la hora de la primera.
- Código tipeado: igual que escanear.
- Sin señal: **"Sin señal: reintentando (n)…"**, nunca verde; al volver la señal, valida **una**
  vez (no "YA ENTRÓ" por su propio reintento).
- Lectura rápida con luz normal (menos de 2 s apuntando).

**Si falla.**
- **No pide la cámara**: no estás en https (punto 2) o el navegador la tiene bloqueada para el
  sitio (ajustes del sitio → Cámara → Permitir).
- **"No se pudo abrir la cámara. Tipeá el código."**: otra app la está usando, o el permiso
  quedó denegado.
- **Pide pero no lee**: probar con más luz / la pantalla con más brillo. Si no lee nunca en un
  modelo, anotarlo: la puerta igual funciona tipeando el código.
- **"Tu rol no valida entradas"**: el usuario no tiene PUERTA ni TITULAR en esa banda.

## 8. El barrido retoma de verdad

**Qué hago.**
1. En Easypanel, cambiar `DEOCO_SMTP_URL` por una con la clave mal escrita. Deploy.
2. Hacer una compra de una entrada (punto 6, con `APRO`).
3. Ver en la tabla `correo`: `SELECT estado, intentos, "reintentarEn", error FROM correo ORDER BY "creadoEn" DESC LIMIT 1;`
4. Volver a poner la `DEOCO_SMTP_URL` buena. Deploy. Esperar 2–3 minutos.

**Qué tiene que pasar.**
- Paso 3: `FALLIDO`, `intentos = 1`, `reintentarEn` ≈ 2 minutos después, un error de
  autenticación.
- Paso 4: en los logs, `[barrido] pendientes de 1 banda(s) …` y el mail llega. En la tabla,
  `ENVIADO`.

**Si falla.** Si la fila sigue `FALLIDO` con `reintentarEn` vencido y no hay línea `[barrido]`:
el barrido no corre (punto 1). Si hay línea y sigue fallando: la URL de SMTP sigue mal.

## 9. Dominio propio por CNAME (Cloudflare for SaaS)

Antes: `docs/despliegue.md`, "Todo detrás de Cloudflare" y la preparación única de dominios
(fallback origin `customers.deocoartist.com`, token, Email Routing, Worker y KV).

**Qué hago.** Con un dominio tuyo, en el panel de la banda de prueba → Dominios → "Conectar por
CNAME": `www.<tu-dominio>`. Crear en tu DNS el CNAME a `customers.deocoartist.com` y el TXT
`_deoco.www.<tu-dominio>` que muestra la tarjeta. **Verificar**. Esperar el candado. **Usar como
principal**.

**Qué tiene que pasar.**
- En Cloudflare (zona `deocoartist.com` → Custom Hostnames) aparece `www.<tu-dominio>`; pasa a
  *Active* con certificado *Active*.
- Verificar: "verificado" apenas el custom hostname está activo y el TXT propagó.
- `https://www.<tu-dominio>`: candado válido emitido por Cloudflare. Nadie toca Easypanel.
- "Usar como principal" solo con el certificado activo; después,
  `https://prueba-deploy.deocoartist.com/cualquier/ruta` → **307** a `https://www.<tu-dominio>/cualquier/ruta`.
- Quitarlo (después de volver al subdominio como principal) borra el custom hostname.

**Si falla.** Custom hostname en *pending*: falta el CNAME o tiene la nube naranja en tu
Cloudflare (tiene que ir en gris). TXT no encontrado: `dig TXT _deoco.www.<tu-dominio>`.

## 10. Carga en el VPS

Para comparar con lo medido acá (`npm run test:carga`): 300 pedidos simultáneos a la página de
un show → **p95 ≈ 5 s** en el contenedor de desarrollo (limitado por CPU, no por la base). Toda
la plataforma mezclada (sitio, tienda, fechas, panel): **~65 pedidos/s por proceso**, p95 < 2 s
hasta 50 a la vez (`docs/decisiones-pendientes.md`, P4).

**Qué hago.** Desde **otra máquina** (no desde el VPS: el que mide le sacaría CPU al servidor), con el show
del punto 6 (con cupo, publicado):
```sh
npx autocannon -c 300 -a 300 -t 60 https://prueba-deploy.deocoartist.com/fechas/<id del show>
```
Repetir 3 veces. Mientras tanto, en el VPS: `top` (CPU de node y de postgres).
Después, lo mismo con `-a 3000` (diez tandas).

**Qué tiene que pasar.**
- 0 errores, 0 timeouts; todo `2xx`.
- Latencia 97,5 % (autocannon no da el 95; el 97,5 es más exigente) **por debajo de 5 s**. Si
  queda mucho por debajo (1–2 s), el VPS tiene margen para la apertura de una venta.
- En los logs, ninguna línea de pool (`P2024`, "timeout") ni de error.

**Si falla.**
- Latencia alta con CPU de node al 100 % y postgres tranquilo: falta CPU (más núcleos, o más
  instancias de la app más adelante: el bus de eventos todavía es de un solo proceso, ver
  `src/nucleo/eventos/bus.ts`).
- Errores de pool / "Hay mucha gente comprando": subir `DEOCO_DB_CONEXIONES` (sin pasar
  `max_connections` de Postgres menos las del back office y las migraciones).
- Al terminar, archivar la banda de prueba desde `/admin`.

## 11. Después: el primer mes

**Qué hago.** Una vez por semana el primer mes:
```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 8;
SELECT estado, count(*) FROM correo GROUP BY 1;
SELECT estado, count(*) FROM evento GROUP BY 1;
```

**Qué tiene que pasar.** `correo` y `evento` crecen con las ventas, nada más. Sin `FALLIDO`
acumulándose.

**Si falla.** `FALLIDO` acumulándose: mirar `error` (correo) o `fallos` (evento) y reprocesar
desde `/admin` → Eventos fallidos. `correo` ya se limpia solo una vez por día (adjuntos a los 7
días, cuerpo a los 90, fila al año: `DEOCO_CORREO_DIAS_*`); en los logs, una línea
`[barrido] correos: …` cuando toca algo. Si igual crece rápido, bajar esos plazos.

## 12. La cuota de Deoco con Mercado Pago de verdad

Lo que el ensayo hizo con el Mercado Pago falso: los campos de `/preapproval` y
`/authorized_payments` se leen a la defensiva y hay que confirmarlos con la cuenta real.

**Qué hago.**
1. En `/admin/m/comercial/planes`, poner temporalmente el precio de Esencial en **$ 100** (el
   mínimo que acepte Mercado Pago para suscripciones).
2. Con un email tuyo, alta sola en `https://app.deocoartist.com/registro` → mail → link → ingresar →
   crear banda eligiendo **Esencial**. Te lleva a Mercado Pago (cuenta de **Deoco**): pagá con
   una tarjeta tuya (o con un usuario de prueba de esa aplicación).
3. Al volver a "Plan y pago": forma de pago "Mercado Pago · <tarjeta>", plan Esencial.
4. En Mercado Pago (cuenta de Deoco) → Suscripciones: está la de la banda, con la referencia =
   id de la banda. Webhooks → historial: avisos `subscription_preapproval` respondidos **200**.
5. Cuando llegue el primer cobro (el primer día después de la prueba de 14 días; para no esperar,
   repetir con `diasPrueba` en 0 en Planes → Plazos): aviso `subscription_authorized_payment`
   200, y en `/admin/m/comercial/bandas/<id>` un cobro "aprobado" y "Pagado hasta" un mes más.
6. "Cancelar la suscripción" en Plan y pago → en Mercado Pago queda cancelada.
7. Volver el precio de Esencial al real.

**Qué tiene que pasar.** Todo lo de arriba, y en los logs ninguna línea `[comercial]` de error.

**Si falla.**
- Al elegir el plan: "No pudimos conectar con Mercado Pago" → `DEOCO_CUOTA_MP_TOKEN` (token de
  producción de la aplicación de Deoco) y el log `[comercial] pasarela de la cuota`.
- Avisos 401: `DEOCO_CUOTA_MP_SECRETO_AVISOS` no es la clave secreta de esa aplicación.
- El cobro llega pero la cuenta no cambia: mirar la respuesta de
  `GET https://api.mercadopago.com/authorized_payments/<id>` con el token de Deoco y comparar con
  lo que lee `src/nucleo/pagos/mercadopago.ts` (`suscripciones.consultarCobro`): `preapproval_id`,
  `payment.status`, `transaction_amount`.

## 13. Alta sola con mails de verdad

**Qué hago.** `https://app.deocoartist.com/registro` con una casilla Gmail y otra Outlook.

**Qué tiene que pasar.** El mail "Confirmá tu email…" llega (no a spam), remitente "Deoco"; el
link abre `/registro/verificar` y confirma; la banda nueva aparece en `/admin` con el filtro
"Alta: Autogestión". Registrarse dos veces con el mismo email: la segunda vez llega "Ya tenés
una cuenta en Deoco".

**Si falla.** No llega: `DEOCO_CORREO=smtp` y el dominio verificado en Resend (punto 4).

## 14. Origen detrás de Cloudflare (D2, con un dominio real)

**Qué hago.** Con el YAML de `docs/despliegue.md` cargado y la nube naranja en `deocoartist.com`:
`curl -sI https://app.deocoartist.com` y `https://prueba-deploy.deocoartist.com`; después, contra
la IP del VPS sin pasar por Cloudflare: `curl -skI --resolve app.deocoartist.com:443:<IP> https://app.deocoartist.com`.

**Qué tiene que pasar.** Por Cloudflare: 200. Directo a la IP: `app.` rechaza el TLS (pide el
certificado de cliente de Cloudflare) y los demás hosts de Deoco dan 403 (lista de IPs). Los
otros servicios del VPS siguen andando igual. La IP que ven los frenos es la del visitante
(`CF-Connecting-IP`): en el log de un login fallido aparece tu IP, no una de Cloudflare.

**Si falla.** La vuelta atrás está en `despliegue.md` ("Vuelta atrás"). Si `app.` responde sin
certificado de cliente, la ruta duplicada de Easypanel está pisando la nuestra (el aviso en negrita).

## 15. Delegar un dominio y un `.com.ar` (zona en Cloudflare)

**Qué hago.** Panel → Dominios → "Delegar un dominio" con un dominio tuyo que tenga correo (MX).
Cambiar los nameservers en tu registrador por los dos que muestra la tarjeta. Repetir con un
`.com.ar` en nic.ar ("Delegar").

**Qué tiene que pasar.**
- Se crea la zona en la cuenta de Deoco con los registros que ya tenía (Cloudflare los trae: el MX
  aparece en "Trajimos N registros") más el sitio con proxy.
- Antes de 10 minutos de que Cloudflare active la zona, el dominio y su www quedan verificados
  solos; SSL "Full" y "Siempre HTTPS" en la zona. Tu correo sigue llegando todo el tiempo.
- `https://<dominio>` y `https://www.<dominio>` con candado. "Usar como principal".
- Un `.com.ar` todavía sin registrar: la tarjeta dice "todavía no figura registrado" y espera.

**Si falla.** La zona no se activa: los nameservers no cambiaron (`dig NS <dominio>`). Falta un
registro de los que tenía: Cloudflare no lo encontró al crear la zona; cargalo en la zona (y
anotalo: hay que revisar el `jump_start`).

## 16. Correo desde el dominio (Resend + Email Worker)

**Qué hago.** Con el dominio delegado del punto 15 (sin MX propio, o uno de prueba), Panel →
Correo: `merch@<dominio>`, reenvío a tu Gmail. "Mandarme un mail de prueba". Después, desde
Outlook, escribirle a `merch@<dominio>` y responder desde Gmail. Una compra en la tienda de
prueba.

**Qué tiene que pasar.**
- En Resend aparece el dominio de envío y se verifica solo (Deoco cargó los registros en la zona).
- El mail de prueba llega a Gmail desde `merch@<dominio>`, con SPF y DKIM *pass* (Gmail → "Mostrar
  original").
- Lo que llega a `merch@` se reenvía a Gmail; al responder, le llega a quien escribió (no a Deoco).
- El mail de la compra al fan sale desde `merch@<dominio>`; los avisos de Deoco (cuota, dominios)
  siguen saliendo desde Deoco.
- **A confirmar en este ensayo** (diseño §12): con el Worker caído (despublicarlo un momento),
  Cloudflare **no** da el mail por entregado (el remitente reintenta); un adjunto de más de 20 MB
  rebota con un aviso claro, no se pierde en silencio.

**Si falla.** No verifica en Resend: mirar en la zona los registros `send.` y `resend._domainkey`.
No reenvía: el KV (`DEOCO_CLOUDFLARE_KV`) no tiene la dirección, o la regla de Email Routing no
apunta al Worker `deoco-reenvio`.

## 17. Comprar un dominio (GoDaddy y Mercado Pago de verdad)

Primero en el entorno de pruebas de GoDaddy (OTE: `DEOCO_GODADDY_API=https://api.ote-godaddy.com`,
claves de OTE). Los endpoints marcados **SIN CONFIRMAR** en `src/nucleo/dominios/godaddy.ts` se
prueban acá: disponibilidad y condiciones, alta de la subcuenta, registrar, nombres de las
acciones, nameservers, renovar, desbloqueo y código, contactos.

**Qué hago.** Precio de `.com` en `/admin/m/comercial/dominios`. Panel → Dominios → "Comprar un
dominio" → buscar → elegir → titular → resumen → "Pagar con Mercado Pago" (cuenta de Deoco).

**Qué tiene que pasar.**
- En Mercado Pago **no aparecen** efectivo (Rapipago, Pago Fácil), cajero ni transferencia; un
  pago queda aprobado o rechazado, nunca pendiente. El link vence a las 2 h.
- Nada se registra antes del pago aprobado (en GoDaddy no aparece hasta entonces).
- Pagado: mail "Recibimos tu pago"; "Tus compras de dominios" avanza solo (cerrá la página y
  volvé). En GoDaddy: la subcuenta de la banda con el dominio **a nombre del titular** que cargaste,
  renovación automática **apagada**, nameservers de Cloudflare.
- La zona se activa y el dominio queda listo y principal; mail "<dominio> ya es tuyo".
- `/admin/m/comercial/dominios`: el pago, "compra en marcha"; nada en "Cuotas fallidas".
- **Devolución real**: comprar un dominio que alguien registre en el medio (o forzarlo con uno
  no disponible en OTE) → la compra falla y Mercado Pago muestra la devolución total (y el mail
  "Te devolvimos…"). Con la cuenta sin saldo para devolver: la devolución queda en rojo arriba de
  todo el back office (anotá qué contesta Mercado Pago).
- El aviso de `notification_url` llega firmado con la clave de la aplicación (si no, se rechaza
  con 401 y el pago entra igual por la búsqueda del barrido, en un par de minutos: anotalo).

**Si falla.** "La compra de dominios todavía no está habilitada": faltan `DEOCO_REGISTRADOR`,
GoDaddy o Cloudflare (el arranque lo dice). Se queda en "Registrando": `/admin/dominios`, último
error; "sin saldo" es la cuenta de revendedor sin fondos.

## 18. Renovar, llevárselo y cambiar el titular (GoDaddy de verdad)

**Qué hago.** Con el dominio del punto 17: "Renovar un año" (paga); "Cambiar el titular"; en
"Cómo me lo llevo", "Pedir el código de transferencia" (en OTE no hay que esperar 60 días si se
fuerza la fecha en la base); y "Llevarme solo el DNS" con los nameservers de otro proveedor.

**Qué tiene que pasar.**
- Renovar: en GoDaddy el vencimiento pasa un año; mail "Renovamos…".
- Cambio de titular: los contactos cambian en GoDaddy (y anotá si el registrador manda un mail de
  confirmación al titular nuevo y cuánto tarda).
- Código: el panel lo muestra, el dominio queda desbloqueado; el mail **no** trae el código.
  Transferirlo de verdad a otro registrador: cuando sale de la subcuenta, el barrido lo pasa a
  delegado y el sitio no se corta.
- Solo el DNS: Deoco pone los nameservers en GoDaddy; cuando propagan, la zona se da de baja y
  el sitio sigue en `www` por CNAME si lo elegiste.
- **A confirmar** (`src/nucleo/dominios/plazos.ts`): gracia y recuperación reales de GoDaddy
  después de vencer, y el bloqueo de 60 días.

## 19. Las salidas, sin staff (con dominios reales)

Repetir con dominios reales lo que recorre `tests/salidas.test.ts`, mirando que **nadie del staff**
toque nada (en `auditoria`, ninguna fila `dominio.*` de un usuario staff): delegado que cambia los
nameservers; comprado con el código; `.com.ar` desde nic.ar; comprado que se lleva solo el DNS;
CNAME que borra sus registros. Archivar la banda de prueba y verificar que el titular sigue
entrando a Dominios y puede pedir el código.

## 20. Privacidad del WHOIS (GoDaddy de verdad)

No se pudo leer la documentación de GoDaddy desde el entorno de trabajo (red bloqueada): todo esto
está SIN CONFIRMAR en `src/nucleo/dominios/godaddy.ts`.

1. **Costo**: en la lista de precios de revendedor, cuánto cobra GoDaddy por la privacidad por año
   y por terminación (y si cambia al renovar). Cargarlo en `/admin/m/comercial/dominios` →
   "Privacidad por año" de cada terminación (se suma al registro). Si `GET /v1/domains/available`
   lo informa, se puede leer de ahí en vez de a mano.
2. **Cuándo se activa**: registrar en OTE con `privacy: true` y mirar el WHOIS/RDAP del dominio
   apenas termina la acción `REGISTER`. Si GoDaddy la pide aparte (un pedido de compra de
   privacidad después del registro), hay que sumarlo como paso de la compra antes de "Listo".
3. **Condiciones**: `GET /v1/domains/agreements?tlds=com&privacy=true` — si suma un acuerdo del
   servicio de privacidad, el resumen ya lo muestra y lo exige (se pide con `privacy=true`).
4. **Terminaciones sin privacidad**: probar cada terminación a la venta (por ejemplo `.us` no la
   permite por regla de su registro) y desmarcar "La terminación permite privacidad" donde no va.
   Que la búsqueda y el resumen digan "los datos del titular quedan públicos".
5. **Renovación**: que la privacidad siga activa después de renovar.
