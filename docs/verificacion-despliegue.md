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

## 2. Certificado comodín (`*.deoco.com`)

**Qué hago.**
```sh
curl -sI https://app.deoco.com/ingresar | head -1
curl -sI https://prueba-deploy.deoco.com/ | head -1
echo | openssl s_client -connect prueba-deploy.deoco.com:443 -servername prueba-deploy.deoco.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName -dates
```
Y abrir las dos direcciones en el celular (no solo en la compu).

**Qué tiene que pasar.** `HTTP/2 200` en las dos; el certificado con `DNS:*.deoco.com` en el
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
   `https://app.deoco.com/avisos/<id de la banda>/tienda/pago/mercadopago`, y copiar la
   **clave secreta**.
4. En el panel de la banda de prueba (como titular) → **Credenciales → Cobros**: pegar el
   access token y la clave secreta. **Probar conexión**: tiene que mostrar el nombre del
   vendedor de prueba.

**Qué hago.**
1. Desde `/admin` (o el staff en el back office de la tienda): un proveedor y un producto base.
   Como titular: un producto en la tienda, publicado.
2. En una ventana privada, en `https://prueba-deploy.deoco.com/tienda`: agregar al carrito,
   checkout con tu Gmail, **Pagar**. En Mercado Pago, entrar con el **comprador de prueba** y
   pagar con una tarjeta de prueba aprobada (titular `APRO`).
3. Volver al sitio (botón de Mercado Pago o redirección).
4. Repetir con titular `OTHE` (rechazado).
5. Firma: con la clave secreta cargada,
   ```sh
   curl -si -X POST "https://app.deoco.com/avisos/<id>/tienda/pago/mercadopago?data.id=1&type=payment" \
     -H 'x-signature: ts=1,v1=00' -H 'x-request-id: x' -H 'content-type: application/json' -d '{}' | head -1
   ```

**Qué tiene que pasar.**
- Al pagar: Mercado Pago muestra el nombre de la banda / el vendedor de prueba, el total igual
  al del checkout (productos + un envío por proveedor).
- Al volver: la página del pedido muestra **"Estamos confirmando tu pago"** y se actualiza sola
  hasta **"¡Pago recibido!"** (el aviso tarda segundos). La URL de vuelta **no** tiene el token (`?resultado=exito`
  y nada más).
- En el panel → Pedidos: **Pagado**; en Deuda, la del proveedor; el proveedor ve su orden en
  `app.deoco.com/portal/tienda`.
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
   `https://app.deoco.com/b/prueba-deploy/puerta` y elegir el show.
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

## 9. Dominio propio

**Qué hago.** Con un dominio tuyo (`banda-prueba.com.ar` o un subdominio de otro dominio
propio), seguir **"Dominio propio de una banda"** de `despliegue.md`: agregar, crear `A` y `TXT`,
**Verificar**, sumarlo en Easypanel (resolver **HTTP**, no el de Cloudflare), esperar el
candado, **Usar como principal**.

**Qué tiene que pasar.**
- Verificar: "verificado" en menos de un minuto después de que el DNS propagó.
- `https://<dominio>`: candado válido (certificado **del dominio**, no el comodín).
- "Usar como principal" lo acepta solo con el candado; después,
  `https://prueba-deploy.deoco.com/cualquier/ruta` → **307** a `https://<dominio>/cualquier/ruta`.
- Los links de los mails nuevos usan el dominio propio.

**Si falla.**
- "No apunta / no encuentro el TXT": esperar la propagación (`dig A <dominio>`,
  `dig TXT _deoco.<dominio>`); el TXT va en `_deoco.<dominio>`, no en el dominio.
- Sin candado: el dominio no se sumó en Easypanel, o se sumó con el resolver de Cloudflare
  (ese solo sirve para `deoco.com`).
- "Usar como principal" no lo deja: lo comprueba abriendo `https://<dominio>`; hasta que el
  candado sea válido, no.

## 10. Carga en el VPS

Para comparar con lo medido acá (`npm run test:carga`): 300 pedidos simultáneos a la página de
un show → **p95 ≈ 5 s** en el contenedor de desarrollo (limitado por CPU, no por la base). Toda
la plataforma mezclada (sitio, tienda, fechas, panel): **~65 pedidos/s por proceso**, p95 < 2 s
hasta 50 a la vez (`docs/decisiones-pendientes.md`, P4).

**Qué hago.** Desde **otra máquina** (no desde el VPS: el que mide le sacaría CPU al servidor), con el show
del punto 6 (con cupo, publicado):
```sh
npx autocannon -c 300 -a 300 -t 60 https://prueba-deploy.deoco.com/fechas/<id del show>
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
2. Con un email tuyo, alta sola en `https://app.deoco.com/registro` → mail → link → ingresar →
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

**Qué hago.** `https://app.deoco.com/registro` con una casilla Gmail y otra Outlook.

**Qué tiene que pasar.** El mail "Confirmá tu email…" llega (no a spam), remitente "Deoco"; el
link abre `/registro/verificar` y confirma; la banda nueva aparece en `/admin` con el filtro
"Alta: Autogestión". Registrarse dos veces con el mismo email: la segunda vez llega "Ya tenés
una cuenta en Deoco".

**Si falla.** No llega: `DEOCO_CORREO=smtp` y el dominio verificado en Resend (punto 4).
