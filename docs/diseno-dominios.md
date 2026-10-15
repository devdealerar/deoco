# Dominios de las bandas · Diseño

Estado: **diseño, sin código.** Reemplaza a los dos documentos que estaban fuera del repo
("Compra de dominio integrada" y "Dominios y correo para las bandas"; la investigación de volumen
de correo quedó en `docs/investigacion-dominios-correo.md`). Plan de trabajo: al final y en
`docs/tareas.md` (sección D).

## 0. Resumen

- **Ninguna banda queda presa.** Deoco administra, nunca es dueño. Salir siempre es cambiar
  nameservers o pedir un código, nunca negociar con soporte.
- **Todo el tráfico de dominios de banda pasa por Cloudflare.** Cinco caminos: subdominio de
  Deoco, comprar en Deoco, delegar uno comprado afuera, `.com.ar` asistido (es un delegar) y
  conectar por CNAME (la banda conserva su DNS). Los tres primeros con dominio propio viven en
  **zonas de nuestra cuenta** de Cloudflare; el CNAME, en **Cloudflare for SaaS**.
- **Los dos bloqueadores están resueltos** (sección 1): el certificado (Universal SSL en
  nuestras zonas, Cloudflare for SaaS para el CNAME) y el reenvío de correo (Email Worker que
  manda por Resend: sin verificar destinos, sin el tope de 200).
- **Cambia algo que ya funciona**: la revisión cada 6 h, la verificación y "Usar como principal"
  dejan de mirar el registro A y un pedido HTTPS, y pasan a leer el estado que informa
  Cloudflare. Es una parte aparte, primera en el plan: **3 a 4 días** (sección 7).
- La compra (GoDaddy v2, cobro por el gestor de cuenta) se mantiene como estaba diseñada, con
  los cambios de las secciones 4, 8 y 10.

## 1. Bloqueadores: resueltos

| # | Bloqueador | Estado | Cómo | Fuente |
| --- | --- | --- | --- | --- |
| 1 | Certificado automático (hoy cada dominio lo agrega el staff a mano en Easypanel) | ✅ resuelto | Dominios en zonas nuestras (comprados o delegados): Universal SSL, gratis, automático, apex incluido. Conectar por CNAME: Cloudflare for SaaS (custom hostnames). La app nunca pide un certificado ni toca Easypanel por dominio. | [Cloudflare for SaaS · Getting started](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/) |
| 2 | Tope de destinos de reenvío de Email Routing | ✅ resuelto | El tope es por cuenta ("Destination addresses per account: 200 — Verified destination addresses are shared across all domains in the account"). No usamos `forward()`: un Email Worker reenvía **mandando por Resend**. Sin destinos verificados, sin tope, y la banda ya no confirma nada en su Gmail. | [Email Service · Limits](https://developers.cloudflare.com/email-service/platform/limits/) |

Lo verificó el responsable del proyecto en la documentación oficial; desde este entorno esas
páginas siguen bloqueadas por la red.

### Certificado, por camino

| Camino | Zona | Certificado | Apex (`labanda.com`) | Costo Cloudflare |
| --- | --- | --- | --- | --- |
| Comprar en Deoco | nuestra | Universal SSL | sí | $0 |
| Delegar nameservers (incluye `.com.ar`) | nuestra | Universal SSL | sí | $0 |
| Conectar por CNAME | de la banda | Cloudflare for SaaS | **no** (solo `www.labanda.com`) | USD 0,10 por hostname y mes |

Por qué el CNAME no sirve para el apex: "Si tu cliente necesita usar un registro A para apuntar
al target, necesitás apex proxying. Por defecto, usar un registro A no es una configuración
soportada" (apex proxying es un agregado Enterprise). Por eso la pantalla **recomienda delegar**
y deja conectar por CNAME como opción para quien no quiere tocar sus nameservers; en ese caso el
apex lo redirige la banda a `www` en su proveedor (le damos el texto exacto).

### Preparación única (staff, una vez, sin código)

En la zona `deocoartist.com` (la de `DEOCO_DOMINIO_RAIZ`):

1. **Fallback origin**: un registro A **con proxy (nube naranja)** a la IP del VPS, por ejemplo
   `origen.deocoartist.com`, designado como fallback origin de Cloudflare for SaaS.
2. **Destino del CNAME**: `customers.deocoartist.com`, CNAME con proxy al fallback origin. Es lo
   que la banda pone en su DNS (`www CNAME customers.deocoartist.com`). La app arma el nombre
   desde `DEOCO_DOMINIO_RAIZ`; nunca lo escribe en el código.
3. El comodín `*.deocoartist.com` sigue igual (solo DNS): un registro explícito le gana al
   comodín, así que conviven.
4. Un token de API de Cloudflare con permisos sobre zonas, DNS, custom hostnames, Email Routing,
   Workers y KV de la cuenta (`DEOCO_CLOUDFLARE_TOKEN`, `DEOCO_CLOUDFLARE_CUENTA`).

### Estado de un custom hostname (solo camino CNAME)

- Listo cuando `result.status` = `active` **y** `result.ssl.status` = `active`. Los dos.
- El `POST` puede no devolver `validation_records`: se piden con un `GET` un rato después
  (lo hace el barrido, con espera creciente).
- Para zonas propias (comprar, delegar) no aplica: el estado es el de la zona (`active`) y el de
  su certificado universal.

### El origen detrás de Cloudflare (a cerrar en el ensayo, no cambia el diseño)

El certificado del borde está resuelto. Falta decidir cómo entra el tráfico al VPS, porque
Cloudflare llega con `Host: labanda.com` y hoy Traefik (Easypanel) solo enruta los hosts que
alguien cargó a mano:

- **Una ruta comodín de baja prioridad** en Traefik hacia la app (cualquier host que no tenga
  otra ruta). La app ya resuelve la banda por host y da 404 a lo que no conoce. A confirmar cómo
  se carga en Easypanel (configuración propia de Traefik).
- **Modo SSL de las zonas**: "Full" contra el certificado que tenga Traefik, más **Authenticated
  Origin Pulls** y el firewall del VPS abierto solo a Cloudflare en 443 para esos hosts. "Full
  (strict)" pediría un certificado de origen por zona; queda como mejora.
- **IP del visitante**: en los sitios de banda llega en `CF-Connecting-IP`. Hoy solo la usa el
  freno del alta (en `app.`, que no pasa por Cloudflare), así que no cambia nada todavía.

Es la parte 2 del plan y se cierra con un ensayo real.

#### Ensayo local (15/10/2026, imagen de producción del commit `9a92f09`, Traefik 3.4.5)

Montaje: Postgres 16 + la imagen de la app (migraciones al arrancar) + Traefik con lo que
Easypanel genera hoy (`Host(app.<raíz>)` y `HostRegexp(^.+\.<raíz>$)` con el certificado del
comodín) y **un archivo más**, la ruta comodín:

```yaml
http:
  routers:
    deoco-comodin:
      rule: "HostRegexp(`.+`)"
      priority: 1
      entryPoints: [websecure]
      service: deoco      # el mismo servicio de la app
      tls: {}
```

Dos bandas: Los Satélites (`cualquier-dominio.com` principal, `www.cualquier-dominio.com`) y
Niebla Norte (`nieblanorte.com.ar` principal, `sin-verificar.com` sin verificar).

| Pedido (HTTPS, SNI y `Host` iguales) | Ruta de Traefik | Respuesta |
| --- | --- | --- |
| `cualquier-dominio.com` | comodín | 200, Los Satélites |
| `nieblanorte.com.ar` | comodín | 200, Niebla Norte |
| `www.cualquier-dominio.com` | comodín | 307 → `https://cualquier-dominio.com/` (con `https`: Traefik pasa `X-Forwarded-Proto`) |
| `sin-verificar.com`, `otro.com` | comodín | 404 de la app |
| `satelites.deoco.test`, `niebla.deoco.test` | la de Easypanel | 307 a su dominio principal |
| `app.deoco.test` | la de Easypanel | panel, igual que antes |

**La ruta comodín funciona**: un dominio que nadie cargó en Traefik llega a la app y resuelve la
banda correcta; las rutas que ya existían no cambian (la comodín tiene la prioridad mínima).

**Authenticated Origin Pulls, como lo había propuesto, no alcanza.** Se simuló con una CA propia
en lugar de la de Cloudflare (`clientAuth: RequireAndVerifyClientCert`):

- Las opciones TLS de Traefik se eligen por SNI y solo se pueden atar a rutas con `Host(...)`.
  Las rutas `HostRegexp` (la comodín y **la de los subdominios de banda**) usan las opciones
  `default` (Traefik lo avisa en el log).
- Exigir el certificado de cliente en `default` hace lo buscado con los dominios propios (con el
  certificado de "Cloudflare": 200; sin certificado o con uno ajeno: la conexión se corta), pero
  **también corta los subdominios `labanda.deocoartist.com`**, que hoy llegan directo (nube
  gris) sin certificado de cliente. `app.` solo se salva si su ruta tiene opciones propias, y esa
  ruta la genera Easypanel.
- Con **todo** por Cloudflare (`app.`, el comodín y los dominios propios, todos con certificado
  de cliente) anduvo todo: panel, subdominios con su redirección, dominios propios, 404; y nada
  entra sin pasar por Cloudflare, ni pidiendo a la IP pelada.
- Efecto lateral de pasar `app.` por Cloudflare: Traefik reemplaza `X-Forwarded-For` por la IP
  que se conecta (comprobado: llega `127.0.0.1` aunque el pedido traiga otro valor), que sería la
  de Cloudflare. El freno por IP del alta (`src/app/registro/acciones.ts`) juntaría a todos en
  pocas IPs. Se arregla leyendo `CF-Connecting-IP`, que llega intacta y es confiable porque solo
  Cloudflare puede conectarse.

Opciones (**decidido: A**, 15/10/2026 — B deja el VPS expuesto con la ticketera y los pagos
adentro; C depende de algo no confirmado). Pasos y vuelta atrás: `docs/despliegue.md`, "Todo
detrás de Cloudflare". El cambio a `CF-Connecting-IP` ya está (`ipDelVisitante`); era el único
lugar del código que leía la IP del visitante. Falta que se confirme en Easypanel lo de los
archivos propios y las opciones TLS `default`.

| | Qué | Origen protegido | Cambios |
| --- | --- | --- | --- |
| **A** (recomendada) | Todo por Cloudflare: `app.`, `*.<raíz>` y dominios propios con nube naranja; certificado de cliente exigido en `default` | Sí, completo | DNS de `app.` y del comodín a naranja; la app lee `CF-Connecting-IP` (chico, va en D2); confirmar que Easypanel deja agregar archivos dinámicos y opciones TLS `default` en su Traefik |
| B | `app.` y subdominios siguen directos; sin Authenticated Origin Pulls | No: quien sepa la IP puede saltear Cloudflare (la app igual resuelve y aísla bandas; se pierde lo que filtre Cloudflare) | Ninguno |
| C | Puerto aparte solo para Cloudflare, con certificado de cliente | Sí, para dominios propios | Una regla de origen en Cloudflare que cambie el puerto (a confirmar que esté en el plan gratis) y abrir otro puerto en el VPS |

Montaje del ensayo (fuera del repo): Postgres en `:5434`, app en `:3000`, Traefik en `:443`,
certificados de prueba generados con `openssl`.

#### Opción A acotada (15/10/2026): sin tocar `default`

Easypanel confirmado: Traefik 3.6.7; `main.yaml` sin opciones TLS; el editor de configuración
personalizada escribe el YAML propio. En el VPS hay otros servicios (el panel de Easypanel y
otros sitios) que **no** pasan por Cloudflare, así que exigir el certificado de cliente en
`default` los rompería. Decisión: opción TLS con nombre (`aop`) solo en las rutas de Deoco; Deoco
a nube naranja con certificado de origen de Cloudflare; los demás servicios, sin cambios.

Ensayo con Traefik **3.6.7** (`main.yaml` que imita a Easypanel con un servicio ajeno + el YAML de
`docs/despliegue.md` tal cual, solo cambiando la URL del servicio):

| Pedido | Sin certificado de cliente | Con el de "Cloudflare" | Con uno ajeno |
| --- | --- | --- | --- |
| Servicio ajeno (`Host` en `main.yaml`) | 200 | 200 | 200 |
| `app.deocoartist.com` (`Host` exacto, `aop`) | se corta en TLS | 200 (403 si no viene de una IP de Cloudflare) | se corta en TLS |
| `labanda.deocoartist.com`, dominio propio (`HostRegexp`) | 200 desde IP de Cloudflare / 403 si no | ídem | ídem |

- `aop` **solo se aplica en rutas con host exacto**: en las `HostRegexp` Traefik usa `default`
  (lo avisa en el log). Los subdominios de banda y los dominios propios no se pueden enumerar,
  así que ahí el certificado de cliente no se puede exigir sin tocar `default`.
- Por eso todas las rutas de Deoco llevan una **lista de IPs de Cloudflare** (`ipAllowList`),
  que no depende del SNI: directo a la IP, 403. El servicio ajeno no se entera.
- Si queda la ruta que Easypanel genera para `app.`, Traefik ve dos rutas con el mismo host y
  opciones distintas y usa `default` para las dos: `aop` se pierde. Los dominios de Deoco se
  sacan de Easypanel.
- El certificado de origen (`deocoartist.com`, `*.deocoartist.com`) se presenta para `app.` y los
  subdominios; para los dominios propios, el de Traefik por defecto (por eso sus zonas van en
  **Full**, no estricto: la app lo pone sola al crearlas).
- El YAML de la vuelta atrás (sin `aop` ni lista, con el resolver de Let's Encrypt) también se
  cargó sin errores.

Lo que queda abierto: con la lista de IPs, alguien con su propia cuenta de Cloudflare apuntando a
nuestra IP la pasa, pero solo llega a hosts que la app no conoce (404). Si algún día hace falta
cerrar eso, el camino es un Cloudflare Tunnel para Deoco (sin puerto abierto); no hace falta
ahora. Y a confirmar en el ensayo real: que Traefik vea la IP real de Cloudflare (puertos en modo
`host`, no "ingress") y que los custom hostnames acepten el certificado por defecto con la zona en
Full (strict) (si no, una Configuration Rule con Full para ellos).

## 2. Principio: ninguna banda queda presa

La banda, cuando quiera, desde el panel y sin pedir nada a nadie, puede:

1. Comprar un dominio en Deoco.
2. Delegar o conectar uno comprado en otro lado.
3. Usar un `.com.ar` registrado por ella en NIC Argentina.
4. Llevarse afuera uno comprado en Deoco (transferencia: código y desbloqueo).
5. Sacar un dominio de la gestión de Deoco **sin transferirlo**: mueve el DNS a donde quiera y
   sigue siendo suyo (y, si quiere, sigue usando el sitio de Deoco por CNAME).
6. Cambiar de camino: delegado → transferido a Deoco; comprado en Deoco → llevado afuera;
   conectado → delegado (y al revés).
7. Tener varios dominios y elegir el principal.
8. Volver al subdominio de Deoco en cualquier momento.

Reglas que lo garantizan:

- El dominio comprado en Deoco se registra **a nombre de la banda** (subcuenta de GoDaddy
  propia), no de Deoco.
- Ninguna acción de salida pasa por el staff. Las que tienen un plazo externo (el código de
  transferencia) se piden con un botón y el panel muestra en qué va.
- La cuota impaga, la suspensión o el archivo de la banda **no tocan** el dominio ni sus DNS.
- El subdominio `<slug>.deocoartist.com` nunca se da de baja: es la red de seguridad de todas
  las transiciones.
- **El costo de llevarse el dominio se dice antes de comprarlo**: Deoco no cobra nada por
  soltarlo; el registrador nuevo cobra la transferencia (en general incluye un año más de
  renovación). Lo paga la banda. Va en la pantalla de resumen de la compra y en las condiciones.

### Lo que la pantalla muestra siempre, por dominio

Cada dominio de la lista (Panel → Dominios) tiene tres renglones fijos y un botón:

| Renglón | Ejemplos |
| --- | --- |
| **Dónde está registrado** | "En Deoco (GoDaddy), a nombre de Ana Pérez" · "En tu registrador (lo compraste afuera)" · "En NIC Argentina, a tu nombre" · "Es el subdominio de Deoco" |
| **Quién lo renueva y cuándo vence** | "Deoco, cuando pagás la renovación · vence el 3 de marzo de 2027" · "Vos, en tu registrador · vence el 3 de marzo de 2027 (lo cargaste vos)" · "Vos, en nic.ar · fecha sin cargar" · "No vence" |
| **Quién maneja el DNS** | "Deoco (Cloudflare)" · "Vos, en tu proveedor" |
| Botón **"Cómo me lo llevo"** | Abre los pasos de salida de ese camino (sección 3), con lo que tarda y lo que cuesta |

Más el estado del sitio ("Abre con candado" / "Configurando el certificado" / "Tu DNS dejó de
apuntar a Deoco desde el …") y el del correo, y la marca de **principal**.

## 3. Caminos y transiciones

### 3.1 Los caminos

| Camino | Dónde está registrado | Quién renueva | DNS | Sitio (apex/www) | Correo en el dominio | Costo para la banda | Cómo se lo lleva |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Subdominio** `labanda.deocoartist.com` | — | — | Deoco | sí / — | no (sale desde Deoco) | incluido | No hay nada que llevarse |
| **Comprar en Deoco** | GoDaddy, subcuenta de la banda, a su nombre | Deoco, cuando la banda paga | zona nuestra | sí / sí | envío + reenvío | precio anual en pesos | Código de transferencia, o "usar mis nameservers" |
| **Delegar** (comprado afuera) | su registrador | la banda | zona nuestra | sí / sí | envío + reenvío | $0 | Cambia los nameservers en su registrador |
| **`.com.ar` asistido** | NIC Argentina, a su nombre | la banda, en nic.ar | zona nuestra | sí / sí | envío + reenvío | arancel de NIC (lo paga en nic.ar) | Cambia la delegación en nic.ar |
| **Conectar por CNAME** | su registrador | la banda | el de la banda | **no** / sí (`www`) | solo envío (copia 3 registros) | $0 (Deoco paga USD 0,10/mes) | Borra el CNAME |

Notas:

- **Correo con CNAME**: el envío desde `merch@labanda.com` funciona si la banda copia los
  registros de Resend (DKIM, SPF y el MX de rebote del subdominio de envío). La **recepción**
  con reenvío no: Email Routing necesita que la zona esté en Cloudflare. La pantalla lo dice.
- **Subdominio**: el remitente de los mails es el de hoy (`tiendas@deocoartist.com` con el
  nombre de la banda).
- **Transferir a Deoco** (delegado → comprado) es un cambio de camino, no un camino de
  entrada: sección 3.2.

### 3.2 Transiciones

Regla general para no cortar nada: **primero se prepara el destino completo, después se mueve
el puntero, y lo viejo se desarma recién cuando el destino está confirmado.** Mientras tanto, el
dominio principal no cambia; si el que cambia es el principal, sigue sirviendo por el camino
viejo hasta que el nuevo está listo.

| De → A | Qué hace la banda | Qué hace Deoco, en orden | Sitio durante el cambio | Correo durante el cambio | Corte |
| --- | --- | --- | --- | --- | --- |
| **Subdominio → cualquier dominio** | Elige el camino | Prepara zona o hostname; espera "listo"; recién entonces ofrece "Usar como principal" | Sigue en el subdominio; el dominio nuevo abre cuando está listo | Sale desde Deoco hasta que el dominio de envío verifica en Resend; recién ahí cambia el remitente | Ninguno |
| **Cualquier dominio → subdominio** (volver) | "Usar el subdominio como principal" | Cambia el principal; el dominio queda como secundario y redirige (307) al subdominio mientras siga activo | Sin corte: el subdominio siempre está activo | El remitente vuelve a Deoco al instante si la banda lo pide; si no, sigue desde el dominio | Ninguno |
| **Cambiar el principal entre dominios propios** | "Usar como principal" en otro | Solo se puede si el elegido está listo (zona activa + certificado activo, o hostname activo + SSL activo). Cambio atómico | El viejo redirige al nuevo, misma ruta | Sin cambio (cada dominio tiene su remitente; se elige cuál usa la banda) | Ninguno |
| **Conectado (CNAME) → delegado** | Toca "Pasarme a delegar"; cambia los nameservers en su registrador | 1) Crea la zona **con todos los registros ya cargados** (sitio con proxy en apex y `www`, Resend, MX de recepción) y además copia los registros que la banda tenía (lee los públicos y le pide confirmar la lista); 2) le muestra los dos nameservers; 3) **deja el custom hostname activo**; 4) cuando la zona pasa a `active` y su certificado universal a `active`, borra el custom hostname | Sin corte: mientras propaga, los resolvers que leen los NS viejos siguen el CNAME (hostname todavía activo) y los que leen los nuevos van a la zona | Envío: igual. Recepción: empieza a funcionar cuando la zona se activa | Ninguno. A confirmar en el ensayo: que un custom hostname y una zona activa del mismo nombre convivan en la misma cuenta durante la propagación |
| **Delegado → conectado (CNAME)** | "Manejar mi DNS yo" | 1) Crea el custom hostname para `www` y espera "listo" (la validación pasa porque hoy el DNS lo sirve la zona nuestra: Deoco agrega los registros de validación en la zona); 2) le da la **exportación de la zona** (todos los registros, texto listo para pegar) con `www CNAME customers.deocoartist.com` y la redirección del apex a `www`; 3) la banda carga eso en su proveedor y cambia los nameservers; 4) Deoco detecta la zona como `moved` y la mantiene 90 días sin servirla | `www` sin corte. El apex depende de que la banda configure la redirección en su proveedor: se le avisa antes | Envío: sigue si copió los registros de Resend (están en la exportación). Recepción: **se termina** al mover los nameservers; se le avisa antes, con dos opciones: redirigir en su proveedor o mantener los nameservers | Posible en el apex; se avisa antes |
| **Delegado → transferido a Deoco** | "Transferir a Deoco"; pide el código en su registrador y lo pega; paga un año | Cobra, inicia la transferencia en la subcuenta de la banda (GoDaddy v2, a confirmar el endpoint) **sin tocar los nameservers**: la zona sigue siendo la misma | Sin corte: el DNS no se mueve | Sin corte | Ninguno. La transferencia tarda días (aprobación del registrador viejo) |
| **Comprado en Deoco → llevado afuera** | "Llevármelo" → confirma | Desbloquea y manda el código por mail (hasta 2 días hábiles); **no cambia los nameservers**. Al completarse la transferencia (el dominio deja de figurar en la subcuenta), el dominio pasa solo a **delegado**: renueva la banda, la zona sigue | Sin corte: la transferencia no cambia los nameservers | Sin corte | Ninguno. Después puede quedarse delegado o salir (fila siguiente) |
| **Comprado en Deoco → sacar de gestión sin transferir** | "Usar mis propios nameservers" (pega los de su proveedor nuevo) | Le da la exportación de la zona; cuando la banda confirma que la cargó, pone esos nameservers en el registrador (endpoint de nameservers de GoDaddy v2); la zona queda 90 días | Sin corte si cargó la exportación antes de confirmar; si quiere seguir con el sitio de Deoco, se le crea el custom hostname de `www` antes del cambio | Recepción se termina; envío sigue si copió los registros de Resend | Posible en el apex; se avisa antes |
| **Delegado o `.com.ar` → sacar de gestión** | Cambia los nameservers en su registrador o en nic.ar | Exportación de la zona a mano antes; detecta `moved`; la mantiene 90 días | Igual que la fila anterior | Igual que la fila anterior | Igual |
| **Quitar un dominio** (no principal) | "Quitar" + confirmar | Borra hostname o zona (a los 90 días si era zona; antes, si la banda lo pide explícitamente), da de baja el dominio de envío en Resend y la regla de recepción | Ese dominio deja de mostrar el sitio (ya no era el principal) | El remitente vuelve al principal o a Deoco | Solo en ese dominio, y la banda lo confirmó |
| **Vence sin renovar** (comprado en Deoco) | — | Pasa el principal al subdominio, el remitente vuelve a Deoco, nada se borra (sección 9) | El sitio sigue en el subdominio | Sale desde Deoco | En el dominio vencido, inevitable |
| **La banda se va de Deoco** (archivada) | — | Zona y registros quedan 90 días; aviso antes de borrar la zona; el dominio comprado sigue a su nombre y puede pedir el código | Ese tiempo el sitio no se muestra (banda archivada), pero el DNS sigue y puede apuntarlo a otro lado | Recepción con reenvío sigue los 90 días | — |

Detección sin preguntar: todo lo que depende de un paso de la banda afuera (cambiar nameservers,
CNAME, transferencia) lo detecta el barrido leyendo el estado en Cloudflare o en el registrador.
El panel muestra "Esperando que cambies los nameservers (lo revisamos solos)" y un botón "Ya lo
hice" que adelanta la revisión.

## 4. Pantallas

Ocho pantallas de la banda (titular, como hoy Dominios) y una del staff.

1. **Dominios (inicio).** La lista de dominios con los renglones fijos de la sección 2 y, arriba,
   "Agregar un dominio" con tres opciones: *Comprar uno* · *Ya tengo uno* · *Tengo un `.com.ar`*.
2. **Ya tengo uno.** Dos opciones, con la recomendación marcada:
   - **Delegar (recomendado)**: "Deoco maneja el DNS: sitio con y sin www, certificado y correo.
     Cambiás dos nameservers en tu registrador." Muestra los dos nameservers con botón de copiar.
   - **Conectar por CNAME**: "Seguís manejando tu DNS. Solo `www.labanda.com`: el dominio sin
     www lo tenés que redirigir vos. Sin recepción de correo." Muestra el CNAME y, cuando
     Cloudflare los da, los registros de validación.
3. **Buscar** (comprar). Campo "labanda" y resultados por terminación con precio anual; solo las
   terminaciones que el staff tiene a la venta.
4. **A nombre de quién.** Datos del titular registral, precargados con los del titular de la
   banda. "El dominio queda a este nombre y es tuyo." Condiciones del registrador con sus links.
5. **Resumen y pago.** Dominio, un año, precio en pesos, "se renueva el …, te avisamos antes", y
   el renglón de salida: **"Si un día te lo querés llevar, Deoco no cobra nada; el registrador
   nuevo te cobra la transferencia (suele incluir un año más)."** Botón "Pagar con Mercado Pago"
   (Checkout Pro, cuenta de Deoco).
6. **Preparando todo.** Pasos que se completan solos: Pago recibido · Registrando · Conectando el
   sitio · Certificado · Correo. "Podés cerrar esta página: te mandamos un mail cuando esté."
7. **Listo.** "Tu sitio ya está en https://labanda.com". El dominio pasa a principal solo **si la
   banda lo eligió en el paso 4** (casilla marcada por defecto); el subdominio redirige a él.
8. **Correo** (Panel → Correo, ruta nueva del núcleo). Dos campos, sin confirmaciones:
   - **Tus mails salen desde**: `merch` @ labanda.com (editable). Remitente de compras, entradas
     y despachos.
   - **Lo que llegue ahí se reenvía a**: precargado con el email del titular. Se guarda y anda.
     Botón "Mandarme un mail de prueba" (prueba envío y reenvío).
   - Una línea fija: "Cuando respondas desde tu casilla, le respondés directo a quien te
     escribió."
9. **Back office → Dominios (staff).** Por banda: camino, estado de cada paso, vencimiento,
   último error y "Reintentar". Arriba: saldo de la cuenta del registrador, dominios que vencen
   en 30 días, hostnames y zonas en problema.

## 5. Correo

### Envío (Resend)

- Un **dominio de envío en Resend por dominio de banda** (`DominioDeEnvio`): Deoco lo da de alta
  y, si la zona es nuestra, carga los registros (DKIM, SPF, MX de rebote del subdominio de envío)
  solo. Con CNAME, se los muestra a la banda.
- `enviarCorreo` arma el remitente desde `correo_dominio`: si la banda tiene un dominio de envío
  verificado, sus mails salen desde ahí; si no, como hoy. Es el único cambio en `enviarCorreo`.

### Recepción y reenvío (Email Worker + Resend)

- Email Routing prendido en cada zona nuestra, con una regla "todo lo que llegue" que manda a
  **un solo Email Worker** (el mismo para todas las zonas).
- El Worker busca el destino en un KV (`<dirección> → <destino>`), que escribe la app al guardar
  la pantalla Correo. Sin destino: rechaza con un mensaje claro.
- Reenvía **mandando un mail nuevo por Resend** (no `forward()`): sin destinos verificados, sin
  el tope de 200 por cuenta, y la banda no confirma nada.

### Responderle al fan desde Gmail: confirmado, con un matiz

El remitente original **no se puede conservar tal cual** en el `From`: Resend solo manda desde
dominios verificados y un `From: fan@gmail.com` saliendo de nuestros servidores falla SPF y
DMARC (y Gmail lo marca o lo rechaza). Lo que sí se conserva, que es lo que importa:

| Cabecera del reenvío | Valor |
| --- | --- |
| `From` | `"Juan Fan (vía labanda.com)" <reenvio@labanda.com>` — el nombre original, visible |
| `Reply-To` | el `Reply-To` original si venía; si no, el `From` original (`fan@gmail.com`) |
| `To` | el destino de la banda |
| `Subject`, cuerpo, adjuntos | los originales (el Worker desarma el MIME y los pasa a la API de Resend) |
| Cabeceras propias | `X-Deoco-Original-From`, `X-Deoco-Original-To` (para el soporte) |

Resultado: en Gmail la banda ve el nombre del fan y "Responder" le escribe al fan. La respuesta
sale desde la casilla de la banda (su Gmail), no desde `merch@labanda.com`; mandar *como*
`merch@` desde Gmail necesitaría un SMTP propio y queda fuera.

Cuidados del Worker:

- No reenvía mensajes automáticos (`Auto-Submitted`, rebotes) ni lo que vuelva a su propio
  dominio (evita bucles).
- Tope diario por banda (protege la reputación del envío y frena el uso del reenvío para mandar
  spam a un destino ajeno).
- Mensajes que exceden el tamaño de Resend: reenvía el texto con una nota de que había adjuntos
  grandes. **A confirmar**: tamaño máximo de Email Routing y de la API de Resend, y si conviene
  rechazar lo que no pasa SPF/DKIM según lo que Cloudflare informe al Worker.
- Los reenvíos cuentan en el volumen de Resend (proyección en
  `docs/investigacion-dominios-correo.md`).
- La clave de Resend vive como secreto del Worker y en el entorno de la app; nunca en `secreto`.

## 6. Cómo encaja (núcleo, gestor y proveedores)

Sin módulo nuevo: el núcleo hace lo técnico detrás de interfaces intercambiables, el gestor de
cuenta (`comercial`) hace la plata.

| Interfaz (núcleo) | Hoy | Qué sabe hacer |
| --- | --- | --- |
| `Registrador` | GoDaddy v2 (`/v2/customers/{customerId}/domains`) | disponibilidad y precio de costo · crear el cliente (subcuenta) · registrar a nombre del cliente · consultar una operación · poner nameservers · renovar · vencimiento · desbloquear y dar el código · cambio de titular · transferencia entrante (a confirmar) · saber si el dominio sigue en la subcuenta |
| `ProveedorDns` | Cloudflare | zonas: crear, estado, nameservers, registros, exportar, borrar · certificado universal: estado · custom hostnames: crear, estado (status + ssl), registros de validación, borrar · Email Routing: prender, regla al Worker · KV de destinos |
| `DominioDeEnvio` | Resend | alta del dominio y sus registros · verificar · baja |

Reglas: operaciones asíncronas con id de operación (GoDaddy contesta 202 y se consulta);
errores traducidos a `NoDisponible`, `Temporal`, `SinSaldo`, `DatosInvalidos`, `Desconocido`;
credenciales de plataforma desde el entorno (`DEOCO_REGISTRADOR_*`, `DEOCO_CLOUDFLARE_*`,
`DEOCO_RESEND_*`), nunca en `secreto`; un falso por proveedor para las pruebas (como el Mercado
Pago falso). Todas las llamadas al registrador pasan por una cola global (60 pedidos por minuto
por credencial).

Gestor de cuenta: `GestionCuenta.dominios?` con `precio(tld)`, `iniciarCobro(alta | renovación |
transferencia)` y `devolver(cobro)`; cuando el pago se aprueba llama a `dominioPagado(…)` del
núcleo. Sin gestor, "Comprar uno" no aparece y los demás caminos siguen andando. La excepción
al dinero se amplía: la cuota **y el dominio comprado en Deoco** entran por la cuenta de Deoco,
siempre por el gestor (aviso en `avisosPlataforma` `/dominio/[pasarela]`). `Pasarela` suma
`devolver`.

## 7. Lo que cambia en lo que ya funciona (`revisarDominios`, verificar, principal)

Es la única parte que toca código en producción-listo y con pruebas. Va primera y por separado.

### Por qué hay que cambiarlo

Con la nube naranja, el registro A de `labanda.com` resuelve a IPs de Cloudflare, no a la del
VPS. Con el código de hoy:

| Pieza (`src/nucleo/dominios/index.ts`) | Hoy | Qué pasaría |
| --- | --- | --- |
| `verificarDominio` | Pide `A <dominio> → IP del servidor` + `TXT _deoco.<dominio>` | Ningún dominio con proxy verificaría (el A nunca da la IP del VPS) |
| `revisarDominios` (barrido, cada 6 h) | Resuelve el A y lo compara con `ipPublica()`; 2 fallas → `noApuntaDesde` | Todos los dominios quedarían marcados "no apunta" y todas las bandas verían el aviso en el panel |
| `marcarPrincipal` | Pide `https://<dominio>/` y acepta cualquier respuesta con certificado válido | Daría "abre" apenas el certificado del borde está activo, aunque el origen no responda: deja de probar lo que tiene que probar |
| `dominiosDeBanda` / `src/app/_dominios` | Muestra A + TXT a crear | Mostraría instrucciones equivocadas |
| `docs/despliegue.md`, "Dominio propio", paso 3 | El staff agrega el dominio en Easypanel | Desaparece |

### Qué queda

- **Una columna `via`** en `dominio`: `plataforma` (subdominio), `zona` (comprar, delegar,
  `.com.ar`) o `cname`. Más `zonaId` / `hostnameId`, `estadoProveedor`, `certificadoEstado`.
- **Verificar = lo que diga Cloudflare.**
  - `zona`: verificado cuando la zona está `active` (Cloudflare ya comprobó que los nameservers
    son los nuestros: es prueba de control del dominio). Sin TXT propio.
  - `cname`: verificado cuando el hostname está `active` (Cloudflare valida la propiedad con sus
    registros de validación). Sin TXT propio.
  - La regla "verificado en una sola banda" sigue igual (índice único en la base).
- **Listo para principal** = verificado **y** certificado activo (zona: universal `active`;
  cname: `ssl.status` `active`). `marcarPrincipal` deja de pedir HTTPS; el comprobador HTTPS de
  hoy se borra (y su prueba con un servidor TLS local).
- **`revisarDominios`** sigue en el barrido cada 6 h, misma estructura (bandas por
  `bandas_con_dominios_a_revisar`, transacción por banda, dos fallas antes de avisar, nunca
  despublica ni quita la verificación), pero en vez de resolver el A consulta el proveedor:
  - zona `moved` o `deleted` → "Tu dominio dejó de usar los nameservers de Deoco";
  - hostname distinto de `active` o SSL distinto de `active` → "Tu CNAME dejó de apuntar a Deoco";
  - certificado que vence o falla → aviso al staff (lo renueva Cloudflare solo).
  `noApuntaDesde` pasa a `problemaDesde` + `problema` (texto corto), y el aviso del marco
  (`dominiosQueNoApuntan`) lo muestra tal cual.
- **`DEOCO_IP_PUBLICA`** pasa a ser **obligatoria** cuando hay `DEOCO_CLOUDFLARE_*`: es el valor
  de los registros A con proxy que la app crea en cada zona (apex y `www`). `arranque.ts` la
  exige. El fallback de hoy (resolver `app.<raíz>`) solo sirve mientras `app.` esté en gris; se
  deja como está para el desarrollo.
- **Dominios conectados por A antes de este cambio**: no hay ninguno en producción (todavía no se
  desplegó). Si para cuando se haga ya hubiera, se marcan `via = a-heredado` con la revisión
  vieja hasta que pasen a delegar o a CNAME; si no, esa rama no se escribe.

Hecho en D1 (ver `docs/tareas.md`). Dos ajustes de alcance respecto de lo de arriba:

- **El alta por CNAME entró en D1**: el camino del registro A ya no sirve detrás de Cloudflare
  (con Authenticated Origin Pulls ni siquiera llega), así que reemplazarlo era parte de no dejar
  la rama rota. Quedó el TXT `_deoco` en el camino CNAME: un custom hostname es uno por dominio
  y no distingue bandas, así que no prueba de cuál es. D4 queda solo con el paso de conectado a
  delegado.
- **`DEOCO_IP_PUBLICA` obligatoria pasa a D3**, que es cuando la app crea registros A en las
  zonas; en D1 no se usa.

### Cuánto trabajo es

| Qué | Días |
| --- | --- |
| `ProveedorDns` mínimo (zona: estado y certificado; hostname: crear, estado, validación, borrar) + Cloudflare falso para las pruebas | 1,5 |
| Migración (`via`, ids, estados, `problemaDesde`), `verificarDominio`, `marcarPrincipal`, `revisarDominios`, `dominiosQueNoApuntan`, arranque | 1 |
| Pantallas `src/app/_dominios` (panel y `/admin`): instrucciones por camino, estados, textos | 0,5 a 1 |
| Pruebas: `tests/dominios.test.ts`, `tests/backoffice.test.ts`, barrido y e2e de dominios; `docs/despliegue.md` | 0,5 a 1 |
| **Total** | **3,5 a 4,5** |

Riesgo: bajo para las bandas (no hay dominios propios en producción), medio para la base de
código (cambia una pieza con muchas pruebas). Se cierra con todo en verde antes de seguir.

## 8. Tablas

Núcleo (todas con `tenantId` + RLS salvo la indicada):

| Tabla | Una fila por | Columnas que importan |
| --- | --- | --- |
| `dominio` (existe, se amplía) | dominio de la banda | + `via` · `origen` (subdominio, comprado, delegado, nicar, conectado) · `zonaId` · `hostnameId` · `estadoProveedor` · `certificadoEstado` · `venceEn` · `renueva` (deoco, banda) · `problema` / `problemaDesde` · `saleEn` (fin de los 90 días) |
| `registrador_cliente` | banda y registrador | `registrador` · `clienteId` (subcuenta) |
| `dominio_registro` | dominio comprado o transferido | `registrador` · `estado` (pagado, registrando, configurando, listo, fallido, vencido, transfiriendo-afuera, transferido) · `contacto` (jsonb) · `aceptoCondiciones` (fecha e IP) · `venceEn` |
| `dominio_paso` | paso de un alta, renovación o transición | `paso` · `estado` · `operacionExterna` · `claveIdempotencia` · `intentos` · `proximoIntento` · `error` |
| `correo_dominio` | dirección de envío de la banda | `dominioId` · `local` · `envioId` + `envioEstado` (Resend) · `reenvioA` |

Gestor: `comercial_dominio_precio` (global: `tld`, `precio`, `aLaVenta`) y
`comercial_dominio_cobro` (`dominio`, `tipo`, `periodoHasta`, `cobroId` único, `estado`,
`monto`, `devolucion`).

Ya no hacen falta `destinoEstado` ni `reglaId` por dirección (no hay destinos verificados ni una
regla por destino). El barrido recorre `dominio_paso` con una función que devuelve solo ids, y
cada paso se "toma" en la base antes de correr, como eventos y correos.

**Como quedó en D8.** Una sola tabla, `dominio_compra` (una fila por compra o renovación, con el
`paso` actual, la `operacion` del registrador, `intentos`, `proximoIntento`, `error`/`motivo`/
`campo`, `devolucion` y `venceEn`), en vez de `dominio_registro` + `dominio_paso`; el dominio
comprado se marca en `dominio.comprado`. Las transiciones (transferir afuera, D11/D12) suman
sus pasos a esta misma máquina. El barrido usa `bandas_con_compras_pendientes()` (solo ids).
Al staff no se le manda mail: lo que necesita atención se ve en `/admin/dominios` y en el log.

**Como quedó en D9 (gestor).** `comercial_dominio_precio` (global), `comercial_dominio_cobro`
(uno por intento de pago: `clave` "alta:x.com" / "renovacion:x.com:<vence>", `vence`, `estado`
esperando → pagado | sin-pagar | devuelto, `pagoId` aceptado; índice único por banda y clave
mientras está pagado) y `comercial_dominio_pago` (uno por pago de la pasarela: `entrega` a la
compra, y la devolución con `devolucion` pendiente → en-proceso → hecha | fallida | a-mano,
intentos, próximo intento, error, nota). La compra del núcleo solo marca `devolucion` pendiente
→ pedida (se la pasó al gestor por `gestionaCuenta.dominios.devolver`); la plata y su estado
son del gestor. Nada de esto toca `comercial_cobro` ni la cuenta de la banda.

## 9. Cobro, renovación y titularidad

**Cobro.** Pago único anual por Checkout Pro en la cuenta de Deoco, precio en pesos por
terminación (lo fija el staff: costo + comisión + colchón por el dólar). Solo medios inmediatos:
**confirmado (D9)**, la preferencia va con `binary_mode: true` (el pago queda aprobado o
rechazado; uno que quedaría pendiente o en revisión se rechaza) y `excluded_payment_types`
`ticket` (Rapipago, Pago Fácil), `atm` y `bank_transfer`, y vence a las 2 h. Primero se cobra, después se
registra; si no se puede registrar, devolución total automática (`Pasarela.devolver`). No es una
suscripción: el precio cambia con el dólar y el dominio no se ata a la cuota.

**Renovación.** Renovación automática del registrador apagada; Deoco renueva solo lo pagado.

| Cuándo | Qué pasa |
| --- | --- |
| 45 días antes | Mail: "labanda.com vence el …. Renovalo por $ Y" |
| 30 días antes | Aviso fijo en el panel y en el inicio; segundo mail |
| 15, 7, 3 y 1 día antes | Mails, cada uno más claro sobre qué se pierde (sitio en ese dominio y correo) |
| La banda paga | Deoco renueva; vencimiento un año adelante; mail de confirmación |
| Vence sin pagar | Principal → subdominio; remitente → Deoco; nada se borra. "Todavía podés recuperarlo hasta …" |
| Gracia del registrador | Puede pagar y Deoco renueva; el recargo de recuperación lo cotiza el staff a mano |
| El registrador lo libera | Se pierde; la zona se borra a los 30 días; la fila queda `vencido` |

Delegados y `.com.ar`: renueva la banda; Deoco avisa con el mismo calendario usando la fecha que
la banda cargó (o la que se pueda consultar), con link a su registrador o a nic.ar.

**Titularidad** (texto para las condiciones, con la voz de Deoco):

1. **A nombre de quien vos digas.** Se registra a nombre del titular que indicás, no de Deoco.
   Deoco lo gestiona como revendedor del registrador.
2. **Lo administramos por vos.** Mientras esté en Deoco, su DNS vive en nuestra cuenta de
   Cloudflare para que tu sitio y tu correo anden solos. No lo usamos para nada más.
3. **La cuota no lo toca.** Si dejás de pagar la cuota, tu dominio sigue siendo tuyo y no lo
   retenemos por ninguna deuda.
4. **La renovación la pagás vos.** Si no la pagás, vence. Deoco no lo renueva por su cuenta ni lo
   registra para sí.
5. **Te lo llevás cuando quieras.** Desde tu panel, sin pedirnos nada: el código de
   transferencia te llega en hasta 2 días hábiles. Deoco no cobra por soltarlo; el registrador
   nuevo te cobra la transferencia. Solo no se puede en los plazos que fijan las reglas del
   registro (por ejemplo, los primeros días después de registrarlo o de cambiar el titular).
6. **O lo dejás donde está y te llevás el DNS.** Podés poner tus propios nameservers desde el
   panel; el dominio sigue registrado a tu nombre y lo seguís renovando con nosotros.
7. **Cambio de titular.** Lo pide el titular actual desde el panel.
8. **Si te vas de Deoco.** El dominio sigue a tu nombre. Mantenemos su DNS andando 90 días para
   que lo transfieras o cambies los nameservers, y te avisamos antes de dar de baja la zona.
9. **Contenido.** Sos responsable de lo que publicás. Deoco puede suspender el sitio por abuso
   según los términos, pero no toca el registro del dominio salvo orden judicial o del
   registrador.
10. **Tus datos.** Los datos de contacto del titular se usan solo para el registro del dominio.

## 10. Casos de falla

Nunca se registra antes de cobrar, nunca dos veces, un paso que falla no deshace los anteriores,
y lo que no se resuelve solo termina en devolución o en el staff, nunca en silencio.

| Qué pasa | Qué hace Deoco | Qué ve la banda |
| --- | --- | --- |
| Pago rechazado | Nada se registra | "El pago no salió, no se te cobró nada" |
| Pagó, pero alguien lo registró en el medio | Devolución total automática y mail | "Alguien lo registró antes: te devolvimos el pago. Probá con otro" |
| Pagó, el registrador falla un rato (5xx, 429) | Reintentos con espera creciente hasta 24 h; a las 2 h, aviso al staff | "Seguimos registrando, puede tardar un poco" |
| Pagó, datos de contacto rechazados | Vuelve a pedir el dato | "Revisá este dato: …" |
| Pagó, sin saldo en el registrador | Alerta inmediata al staff; reintenta al recargar; a las 24 h, devolución | "Seguimos registrando" y, si no se pudo, la devolución |
| 202 y se perdió la respuesta | No se manda de nuevo: se consulta la operación o se busca el dominio en la subcuenta | Nada distinto |
| Registrado, falla nameservers o zona | Reintentos; el dominio ya es de la banda, no se devuelve | "Registrado. Conectando el sitio" |
| Zona creada, el certificado universal tarda | Espera; a las 24 h, aviso al staff | "Configurando el certificado" (sigue el subdominio) |
| CNAME: el hostname no valida (`pending` mucho tiempo) | Reintenta el `GET` de validación; a los 7 días, mail con los registros de nuevo | "Falta este registro en tu DNS: …" |
| CNAME: la banda borra el CNAME | Dos revisiones → aviso en el panel; si era el principal, sigue redirigiendo desde el subdominio (nada cambia solo) | "Tu CNAME dejó de apuntar a Deoco desde el …" |
| Delegado: la banda cambia los nameservers sin avisar | Zona `moved` → aviso; se mantiene 90 días | "Tu dominio dejó de usar los nameservers de Deoco desde el …" |
| Sitio listo, falla Resend | Reintentos; el sitio anda | "Tu sitio ya anda. El correo está en proceso" |
| El Worker no encuentra destino o Resend falla al reenviar | Rechazo temporal (el remitente reintenta) y alerta al staff si se repite | Nada; el staff lo ve en el back office |
| Aviso de Mercado Pago repetido | Se ignora: un registro por `cobroId` | Nada |
| Renovación pagada, falla renovar | Reintentos y aviso al staff antes del vencimiento | "Pagado. Estamos renovando" |
| Transferencia saliente rechazada o vencida | Vuelve a desbloquear y mandar el código | "El registrador nuevo no aceptó el código. Te mandamos uno nuevo" |
| Se cae Deoco a mitad de un paso | El barrido retoma desde el último paso confirmado | Nada distinto |

## 11. El `.com.ar`, asistido

Lo registra la banda en NIC Argentina (CUIT y clave fiscal; NIC no tiene API). Deoco hace lo
demás y detecta solo lo que se puede detectar; es el mismo mecanismo que delegar.

1. **Preparar.** La banda escribe `labanda.com.ar` y elige "Tengo un `.com.ar`". Deoco crea la
   zona antes de que el dominio exista y guarda sus dos nameservers.
2. **Registrar en NIC.** Pasos numerados, link a nic.ar y lo que va a necesitar.
3. **Delegar.** En nic.ar elige "Delegar" y pega los dos nameservers (botón de copiar).
4. **Deoco detecta y configura.** Cuando la zona pasa a `active`: registros, certificado, correo.
   Mail de "listo".
5. **Renovación.** La paga en nic.ar. Deoco pide la fecha y avisa con el mismo calendario.

Lo que la banda hace sí o sí: registrar, pagar y delegar en nic.ar. Lo que no hace nunca: tocar
un registro DNS.

## 12. Lo que falta confirmar (ninguno cambia el diseño)

- [ ] **CRÍTICO (D5): si el Email Worker falla, Cloudflare no tiene que dar el mensaje por
  entregado.** El Worker tira un error cuando Resend no acepta el reenvío; hay que comprobar con
  Cloudflare real que eso hace que el servidor que mandó el mail lo reintente (rechazo temporal).
  Si Cloudflare lo da por entregado igual, **el mail se pierde y no se recupera**: en ese caso el
  Worker tiene que guardar el mensaje (por ejemplo en KV o R2) antes de responder y reintentar.
- [ ] **CRÍTICO (D5): mails de más de 20 MB.** El Worker reenvía solo el texto con un aviso. Probar
  con un mail grande real: qué tamaño acepta Email Routing, qué acepta la API de Resend, y que el
  aviso llegue.
- [ ] **Salida (D6, a probar en el ensayo real)**: que un custom hostname de `www.x.com` se valide
  por TXT mientras la zona `x.com` es nuestra (los TXT los ponemos nosotros) y conviva con su
  registro en la zona hasta que cambien los nameservers; que el cambio a validación por HTTP
  (`PATCH`) ande para las renovaciones; cuánto tarda Cloudflare en marcar una zona "moved".
- [ ] **Correo (D5, a probar en el ensayo real)**: la API de Resend (alta de dominio, registros
  que devuelve, verificación, "ya existe"), la de Email Routing (`/email/routing/enable` y la
  regla `catch_all` hacia un Worker) y de KV.

- [ ] **Cloudflare, al crear zonas** (D3, a probar en el ensayo real): que `jump_start` traiga
  los registros del DNS anterior, y los códigos de error que usa la app (1061 zona ya existe,
  1049 dominio sin registrar, 81053/81057/81058 registro repetido). El `.com.ar` no se puede
  preparar antes de que exista: si Cloudflare dice "sin registrar", el panel lo explica y se
  reintenta (el diseño original lo creaba antes; no se puede).
- [x] **Delegación que nadie completa** (decidido): vence a los **14 días** y se libera sola (zona
  y filas; un conectado por CNAME que se estaba pasando queda como estaba). Desde 2 días antes,
  aviso en el panel y la fecha en la tarjeta. El aviso por **mail** va con D11.
- [ ] **Mails de "listo" y "por vencer"** de una delegación: el núcleo no tiene cómo mandar un
  mail propio (sin un módulo). Van con los avisos de renovación (D11), que necesitan lo mismo.

- [ ] **Origen detrás de Cloudflare**: ruta comodín en el Traefik de Easypanel, modo SSL y
  Authenticated Origin Pulls (parte 2, con ensayo).
- [ ] **Convivencia hostname + zona** del mismo nombre en la misma cuenta durante el paso de
  conectado a delegado (ensayo).
- [ ] **Email Routing y Resend**: tamaños máximos de mensaje; qué informa Cloudflare al Worker
  sobre SPF/DKIM del entrante.
- [ ] **GoDaddy, programa API Reseller**: contrato, saldo prepago, entorno de pruebas (lo
  averiguás vos).
- [ ] **GoDaddy, endpoints sin confirmar en D7** (marcados "SIN CONFIRMAR" en
  `src/nucleo/dominios/godaddy.ts`; probarlos en el entorno de pruebas de GoDaddy, OTE):
  disponibilidad y condiciones (v1), alta de la subcuenta (`/v1/shoppers/subaccount`), los nombres
  de las acciones (`REGISTER`, `RENEW`, `DOMAIN_UPDATE_NAME_SERVERS`, `DOMAIN_UPDATE_CONTACTS`,
  `TRANSFER`), desbloqueo y código (v1 con `X-Shopper-Id`), cambio de titular y transferencia
  entrante (v2), y los códigos de error que se traducen (no disponible, sin saldo).
- [ ] **GoDaddy v2**: clave de idempotencia; campos de aceptación de condiciones; endpoint de
  transferencia entrante a una subcuenta; mail de verificación del titular (ICANN) y qué pasa si
  no lo confirma; plazos de bloqueo, gracia y recuperación; privacidad de datos.
- [x] **Mercado Pago, medios diferidos**: Checkout Pro los excluye (`excluded_payment_types`
  `ticket`, `atm`, `bank_transfer`) y `binary_mode: true` no deja ningún pago pendiente
  (documentación de Mercado Pago, "Modo binario" y "Medios de pago" de Checkout Pro).
- [ ] **Mercado Pago, en el ensayo real (D13)**: que la cuenta de Deoco AR no ofrezca otro medio
  diferido que no esté en esa lista; devolución total por `POST /v1/payments/<id>/refunds` con
  `X-Idempotency-Key` y qué contesta sin saldo; que los avisos de `notification_url` lleguen
  firmados con la clave de la aplicación (si no, se rechazan y el pago entra igual por la
  búsqueda del barrido, a lo sumo un par de minutos después).
- [ ] **Cloudflare**: que la regla de Email Routing (MX en el apex) conviva con los registros de
  Resend en el subdominio de envío.

## 13. Plan de trabajo, en orden

Cada parte cierra con sus pruebas en verde y se revisa antes de seguir. Las partes D1 a D6 sirven
aunque la compra todavía no exista: con ellas una banda con dominio propio (comprado afuera o
`.com.ar`) tiene sitio, certificado y correo sin que el staff toque nada, y puede salir cuando
quiera.

| # | Parte | Tamaño | Días |
| --- | --- | --- | --- |
| D0 | Preparación única (staff, sin código): fallback origin, `customers.<raíz>`, token, Email Routing, Worker y KV vacíos | — | (vos) |
| D1 | **Revisión, verificación y principal según Cloudflare** (sección 7): `ProveedorDns` mínimo + falso; alta por CNAME — ✅ hecha | M | 3,5 a 4,5 |
| D2 | Origen detrás de Cloudflare + ensayo con un dominio real de prueba | S | 2 a 3 |
| D3 | Delegar (comprado afuera y `.com.ar` asistido): zona con registros, nameservers, detección — ✅ hecha | S | 2 a 3 |
| D4 | Pasar de conectado (CNAME) a delegado sin corte (el alta por CNAME entró en D1) — ✅ hecha | S | 2 |
| D5 | Correo: `DominioDeEnvio` (Resend), Email Worker + KV, pantalla Correo, remitente en `enviarCorreo` — ✅ hecha | M | 4 a 5 |
| D6 | Salir: exportar la zona, sacar de gestión sin transferir, volver al subdominio, 90 días, "Cómo me lo llevo" por camino — ✅ hecha | S | 2 |
| D7 | `Registrador` con GoDaddy v2 + registrador falso — ✅ hecha | L | 5 a 7 |
| D8 | Máquina de estados, tablas, barrido; back office de dominios — ✅ hecha | L | 5 |
| D9 | Cobro en el gestor: precios por terminación, Checkout Pro de Deoco, aviso, devoluciones — ✅ hecha | M | 3 a 4 |
| D10 | Pantallas de compra: buscar, titular, resumen (con el costo de salida), progreso, listo — ✅ hecha | M | 4 |
| D11 | Renovación y avisos; llevarse el dominio (código, detección de la salida → pasa a delegado) | M | 3 a 4 |
| D12 | Transferir a Deoco (delegado → comprado) | M | 3 |
| D13 | Punta a punta y ensayo con un dominio real comprado | M | 3 |
| | **Total** | | **42 a 51** |

D12 puede quedar para después del lanzamiento de la compra sin romper el principio: la banda
nunca queda presa por no poder *entrar* a Deoco por transferencia, solo pierde comodidad.
