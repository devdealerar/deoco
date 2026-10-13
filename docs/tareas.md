# Tareas

## Paso 4 · Módulo de tienda

Decisiones: pasarela detrás de una interfaz (`modulos/tienda/pasarelas/`), Mercado Pago
Checkout Pro con las credenciales de la banda; la fuente de verdad del pago es la consulta a la
API de la pasarela, no el aviso. Correo del núcleo por SMTP (Resend). Deuda con el proveedor:
se registra por orden, no se cobra. Envío fijo por producto base (campo preparado para zonas).
Proveedor por producto base, con uno por defecto. Foto propia o la del producto base.

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Correo del núcleo, `conStaff()`, `rutasAdmin`, `urlFirmada()` | ✅ hecha (a revisar) |
| 2 | Catálogo base y proveedores, desde el back office | pendiente |
| 3 | Panel de la banda: diseños, productos, precios y margen | pendiente |
| 4 | Tienda pública: catálogo, carrito, checkout | pendiente |
| 5 | Pago con Mercado Pago, aviso y deuda con el proveedor | pendiente |
| 6 | Mails: confirmación al fan y orden al proveedor | pendiente |

- Correo: tabla `correo` (RLS), estados PENDIENTE → ENVIANDO → ENVIADO/FALLIDO, `claveUnica`.
  Sin transporte en producción quedan pendientes (aviso en el log de arranque). Por ahora solo
  correos de banda (los de plataforma, cuando haga falta).
- `conStaff`: la auditoría se inserta sin RETURNING (la política deja insertar, no leer).
- Pendiente anotado: barrido de correos y eventos pendientes al arrancar (hoy salen con el
  siguiente de la misma banda o al reintentar).

## Dominios y preparación para la tienda

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Cierre de dominios: HTTPS antes de principal, quitar con confirmación | ✅ hecha |
| 2a | Parámetros de URL para las rutas de módulos | ✅ hecha |
| 2b | Secretos por banda | ✅ hecha |
| 2c | Avisos externos en `app.<raiz>` + `emitir({ unica })` | ✅ hecha |
| 2d | Título y vista previa por página (y el sitio: nombre de la banda) | ✅ hecha |
| 2e | Elemento del módulo en la cabecera del marco (carrito) + pestaña activa por segmento | ✅ hecha |

Con esto el contrato queda listo para la tienda.

- Principal: antes de marcarlo, `https://<dominio>/` tiene que responder con certificado válido
  (sin seguir redirecciones; cualquier estado HTTP sirve). Si no, explica que falta el certificado.
- Quitar: confirmado; el principal no (primero otro principal); el subdominio, nunca.
- Parámetros: `consulta: URLSearchParams` en `PropsRutaPanel` y `PropsRutaPublica`.
- Avisos: el núcleo resuelve banda y módulo; la firma, el módulo (cuerpo crudo). Una banda
  suspendida o morosa sigue recibiendo avisos (los pagos de sus ventas tienen que entrar).
  Idempotencia: `emitir(..., { unica })`, índice único (banda, nombre, clave).
- Metadatos: el sitio aporta nombre, bio corta e imagen (fondo o logo, solo PNG/JPG/WebP); el
  press kit, "Press kit", la bio larga resumida y la primera foto. 404 propio con el nombre de
  la banda en sus hosts.
- `/clave` también quedó reservada en el sitio (ya existía como ruta de la plataforma).
- Secretos: ver CLAUDE.md "Secretos por banda". Garantía de "solo el módulo dueño": el núcleo
  exige el objeto de contrato registrado, y una prueba impide que un módulo importe el de otro,
  el registro o la carga.

### Anotado, no ahora

- Reverificación periódica de dominios (si el DNS deja de apuntar, hoy sigue verificado).
- Correo: con la tienda. Consultas entre módulos: con la ticketera.
- Rotación de `DEOCO_CLAVE_SECRETOS` (el formato lleva versión; falta el proceso).

## Mientras despliego

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Verificación de dominio propio | ✅ hecha |
| 2 | Repaso de la navegación pública | ✅ hecho (faltantes del contrato, abajo) |

- Dominio propio: la banda (titular) lo agrega en `/b/<slug>/dominios` (o el staff en `/admin`)
  y ve dos registros exactos para copiar: `A <dominio> → IP del servidor` y
  `TXT _deoco.<dominio> → deoco-verificacion=<token>`. "Verificar" consulta el DNS.
  - Por qué dos registros: el A solo no prueba que el dominio sea de esa banda (cualquiera que
    apunte a Deoco sería "verificable" por quien lo cargó primero). El TXT lleva un token por
    banda. Sin verificar, el mismo dominio puede estar cargado en varias bandas; lo gana la que
    prueba que es suyo, y verificado es de una sola (índice único parcial).
  - IP: `DEOCO_IP_PUBLICA` si está; si no, la que resuelve `app.<raiz>`.
  - Sin verificar no resuelve (`resolver_tenant_por_host` filtra por `verificado`).
  - Principal: solo verificado (también lo exige la base). Los demás dominios de la banda,
    subdominio incluido, redirigen al principal con 307 (misma ruta y consulta).
  - El certificado no lo emite la app: el dominio se agrega en Easypanel (ver `docs/despliegue.md`).
- Navegación pública: con un módulo que solo declara ruta y pestaña, la pestaña entra sola en el
  marco del sitio, en su orden, sin tocar el módulo sitio (`tests/modulos.test.ts` con tienda y
  ticketera falsas intercaladas; `tests/e2e/sitio.e2e.ts` con el módulo de prueba).

## Despliegue

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Confirmación al quitar un miembro (mensaje propio si es uno mismo) | ✅ hecha |
| 2 | Repaso previo al despliegue | ✅ hecho |

- Verificación de arranque en producción (`src/nucleo/arranque.ts`): variables, roles (app sin
  BYPASSRLS ni dueña de tablas; admin con BYPASSRLS; no cruzados), volumen, módulos, base migrada,
  build de producción. Falla → el proceso termina con la lista de problemas.
- `scripts/crear-staff.mjs`: primer staff en un paso desde la consola de la app.
- Ensayo completo sobre Postgres vacío, detrás de un proxy HTTPS (ver `docs/despliegue.md`).
- No verificado: build de la imagen Docker y certificado comodín en Easypanel (primer despliegue).

## Paso 3 · Formularios y back office

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Formularios que conservan lo escrito ante un error (`@/ui` + guía) | ✅ hecha, en revisión |
| 2a | Back office: conexión admin, auditoría, listado de bandas, alta | ✅ aprobada |
| 2b | Clave temporal con cambio obligatorio + cambio de clave normal | ✅ hecha, en revisión |
| 2c | Back office: estados, módulos, dominios, usuarios, eventos fallidos | ✅ hecha, en revisión |

Pruebas del back office: 1 (404), 2 (alta → titular entra), 3 (dependencia, mismo mensaje),
4 (conexión admin solo en /admin), 5 (auditoría), 6 (archivar/reactivar), 7 (clave temporal),
8 (último titular), 9 (reprocesar) — `tests/admin.test.ts`, `tests/backoffice.test.ts`,
`tests/e2e/admin.e2e.ts`.

- 2b: la clave temporal no se guarda en ningún lado (ni en la auditoría).
- **Pendiente:** cambiar la clave no cierra las otras sesiones abiertas (la sesión es un JWT
  sin estado en el servidor). Llega cuando haya sesiones en servidor.
- 2c: dominios propios se registran sin verificar y no pueden ser subdominios de la raíz;
  quitar/degradar titular bloquea la fila de la banda (dos cambios a la vez no la dejan sin titular).

- 2a: rol `deoco_admin` (BYPASSRLS, no dueño, sin acceso a `_prisma_migrations`), cliente solo
  en `src/app/admin/_servidor`; tabla `auditoria` con RLS (la app ve solo la de su banda);
  alta con titular existente o nuevo (clave temporal mostrada una vez, nunca guardada en claro);
  subdominios reservados: app, www, admin, api, mail, static, assets, deoco.
- 1: `Formulario` despacha la acción desde `onSubmit` (con `action` de respaldo antes de
  hidratar); `limpiarAlGuardar` solo en formularios de "agregar". Encontrado de paso: los
  `<textarea>` llegaban con `\r\n` y se guardaban así; `@/ui/servidor` normaliza.

## Paso 2 · Cierre · Untitled UI oficial y despliegue

| # | Parte | Estado |
| --- | --- | --- |
| 1 | `@/ui` sobre los componentes oficiales de Untitled UI | ✅ hecha, en revisión |
| 2 | Despliegue en Easypanel (`Dockerfile`, `scripts/arrancar.sh`, `docs/despliegue.md`) | ✅ hecha, en revisión |

- Oficiales: Button, Input, TextArea, NativeSelect, Badge, Checkbox. Propios: `CampoArchivo`
  (FileTrigger/InputFile no ponen `name` y el archivo no viaja en el FormData) y `Tarjeta`
  (no hay oficial gratuito).
- Encontrado al simular el contenedor: `next build` exigía `DATABASE_URL` (cliente Prisma
  creado al importar → ahora perezoso) y `prisma generate` exigía `DATABASE_URL_MIGRACIONES`.
- No verificado: build de la imagen Docker (imagen base bloqueada desde el entorno) y login en
  producción (necesita HTTPS). Se ven en el primer despliegue.

Pendientes anotados:
- ~~Formularios que se vacían ante un error~~ → resuelto en Paso 3.
- Back office: alta de bandas, usuarios y dominios propios (hoy por SQL).
- Consultas entre módulos (llega con la ticketera).

## Paso 2 · Módulo de sitio

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Tablas de módulos (infraestructura) + guía | ✅ hecha |
| 2 | Esquema de `modulos/sitio` + migración con RLS | ✅ aprobada |
| 3 | Almacenamiento de archivos (disco + `Almacen`, cuota, sharp, SVG como descarga) | ✅ hecha, en revisión |
| 4 | `marcoPublico` en el contrato | ✅ hecha, en revisión |
| 5 | Borrador y publicado (`sitio_publicacion`) | ✅ hecha, en revisión |
| 6 | Pantallas del panel (tema Untitled UI + kit `src/ui`) | ✅ hecha, en revisión — componentes oficiales pendientes (red) |
| 7 | Sitio público: home y press kit | ✅ hecha, en revisión |

### Pruebas del módulo sitio

- [x] 1. La banda carga home y press kit desde el panel y se ven en su sitio — e2e
- [x] 2. El sitio público responde sin sesión y no filtra nada del panel — e2e
- [x] 3. Dos bandas con contenido distinto: cada sitio muestra lo suyo — e2e
- [x] 4. Un rol sin `sitio.contenido.editar` ve el panel pero no puede guardar (UI y servidor) — e2e
- [x] 5. Las tablas del módulo tienen RLS — `tests/aislamiento.test.ts`
- [x] 6. Un archivo de la banda A no es accesible desde el sitio de la B — `tests/archivos.test.ts` + e2e
- [x] 7. Lo guardado en borrador no aparece en el sitio hasta que se publica — e2e
- [x] 8. Un SVG descargable se sirve como descarga, no se renderiza — `tests/archivos.test.ts` + e2e
- [x] 9. Pasada la cuota, la subida se rechaza con un mensaje claro — `tests/archivos.test.ts` + e2e

E2E en `tests/e2e/sitio.e2e.ts`.

Decisiones:
- Borrador = las tablas `sitio_*`; publicado = foto JSON en `sitio_publicacion`. Un solo
  renderizador para el sitio público y la vista previa. Al publicar, los archivos usados quedan
  públicos y los que ya no usa nadie se borran. Comparación borrador/publicado con claves
  ordenadas (jsonb no conserva el orden).
- Versiones web (WebP): slider 1600 px, fondo 2000 px, logo 600 px, miniaturas del press kit 800 px.
  Los descargables conservan el original.
- Tipografías del sitio (Inter, Fraunces, Space Mono) desde paquetes @fontsource: sin terceros.
- Untitled UI: `untitledui init` instaló el tema oficial; `untitledui add` no puede bajar
  componentes (untitledui.com y github.com bloqueados por la red del entorno, 403). Pantallas
  con un kit propio sobre el tema, en `src/ui/`, para reemplazar por los oficiales.
- La superficie pública del núcleo pasó de `"sitio"` a `"publico"`: chocaba con el id del
  módulo `sitio` (lo detectó la prueba de la regla de oro).
- Archivos en el esquema del sitio: solo ids (`...ArchivoId`), independientes del almacenamiento.

Pendiente:
- Habilitar untitledui.com en la red del entorno y reemplazar `src/ui` por los componentes oficiales.

## Paso 2 · Parte 0 · Cierres antes del módulo de sitio

| # | Cierre | Estado |
| --- | --- | --- |
| 1 | Tablas de módulos (esquema por módulo, prefijo, RLS) | ✅ aprobada y aplicada |
| 2 | `emitir(..., { tx })`: evento atómico con la operación | ✅ aprobada |
| 3 | Módulo de prueba fuera del build con `next build` directo | ✅ aprobada |

- 2: `conTenant` registra tareas `alConfirmar(tx, fn)` que corren solo tras el commit; el bus
  programa la entrega ahí. Prueba: una operación que falla después de emitir no deja ni el
  dato ni la fila del evento (`tests/eventos.test.ts`).
- 3: `next.config.ts` corre el descubrimiento según la fase (`next build` → producción).
  Verificado con `next build` directo: sin rastros de `modulos/prueba` en `.next`.

---

# Paso 1 · Núcleo

Fuente: `docs/spec/00-especificacion-nucleo.md`. Una parte por vez; cada una se
revisa y aprueba antes de pasar a la siguiente.

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Esquema Prisma + migraciones con RLS + `conTenant()` | ✅ aprobada |
| 2a | Estados del tenant + proxy de resolución por dominio | ✅ aprobada |
| 2a′ | Corrección: panel en `app.<raiz>/b/<slug>`, proxy con dos caminos | ✅ aprobada |
| 2c | Auth.js + membresía y rol por pedido + `puede()` + staff + solo titular | ✅ aprobada |
| 3 | Registro de módulos (contrato, descubrimiento, encendido, navegación, módulo de prueba) | ✅ aprobada |
| 4 | Ajustes de módulos + bus de eventos | ✅ hecha, en revisión |

## Pruebas de aceptación del paso

- [x] 1. Dos tenants: una consulta con el tenant A jamás devuelve filas del B — `tests/aislamiento.test.ts`
- [x] 2. Una consulta SIN filtro de tenant no filtra datos (RLS) — `tests/aislamiento.test.ts`
- [ ] 3. Usuario en dos bandas con rol distinto; `puede()` lo refleja
- [x] 4. Módulo de prueba aparece en la navegación; apagado devuelve 404 — parte 3
- [x] 5. Evento emitido queda en la tabla y dispara a su suscripto — parte 4

### Pruebas de la parte 2

- [x] 1. Host de la banda A → tenant A; host inexistente → 404 — `tests/proxy.test.ts`
- [x] 2. Usuario sin membresía en esa banda (`/b/<slug>`) → 403 — `tests/e2e/panel.e2e.ts`, `tests/permisos.test.ts`
- [x] 3. Mismo usuario, dos bandas, dos roles: `puede()` distinto en cada una — `tests/permisos.test.ts`
- [x] 4. Cambiar de `/b/banda-a` a `/b/banda-b` no pide re-login y cambia rol — `tests/e2e/panel.e2e.ts`
- [x] 5. `SUSPENDIDO`: panel 403, sitio 200. `ARCHIVADO`: ambos 404, por host y por slug — `tests/proxy.test.ts`
- [x] 6. Staff entra a cualquier banda pero no pasa el permiso de pasarela — ambos archivos
- [x] 7. Banda `SUSPENDIDO`: titular entra a `/pago`; `EDITOR` (y staff) 403 — `tests/e2e/panel.e2e.ts`
- [x] 8. La cookie de sesión no se manda a `banda-a.lvh.me` — `tests/e2e/panel.e2e.ts`

### Pruebas de la parte 3

- [x] 1. El módulo de prueba se registra, aparece en navegación y sus rutas responden
- [x] 2. Apagado: rutas 404, sin entrada de menú, `puede()` false en sus permisos
- [x] 3. Prendido para A y apagado para B: cada una ve lo suyo
- [x] 4. Prender sin la dependencia falla con un error claro
- [x] 5. Sin el permiso no se ve la entrada de menú aunque el módulo esté prendido

En `tests/modulos.test.ts` (unitarias) y `tests/e2e/modulos.e2e.ts` (navegador).

### Pruebas de la parte 4

- [x] 1. Emitir guarda la fila en `evento` con tenant, nombre, fecha y payload
- [x] 2. El suscripto recibe el evento y corre
- [x] 3. Un suscripto que falla no impide que corra el otro; el fallo queda anotado
- [x] 4. Módulo apagado en A no recibe los de A, sí los de B donde está prendido
- [x] 5. Reprocesar un evento fallido lo vuelve a entregar
- [x] 6. Un nombre mal formado se rechaza

En `tests/eventos.test.ts`. Además: orden de emisión, emitir no espera al suscripto, y
en `tests/e2e/modulos.e2e.ts` un pedido real responde en ~300 ms con un suscripto de 1,5 s.

## Decisiones tomadas en la parte 4

- Apagar un módulo que otro prendido usa falla y nombra quién lo usa. Prender/apagar exige staff.
- `SOLO_DESARROLLO.md` en la carpeta del módulo lo excluye del build de producción.
- No bloquear: `emitir` inserta la fila (una sola escritura, para no perder el evento) y la
  entrega va en `after()`, que Next corre después de mandar la respuesta. Fuera de un
  pedido, la entrega queda en segundo plano sin esperarla.
- Orden: una cola en memoria por banda; cada vuelta toma el PENDIENTE de menor `secuencia`.
  Un evento FALLIDO no frena los siguientes.
- Reproceso: vuelve a PENDIENTE y se entrega solo a los suscriptos que fallaron en el
  último intento. El historial de fallos se conserva.
- Solo se puede emitir lo que algún módulo declara en `eventosEmite`.
- Pasado: se valida por la terminación del participio (-ado/-ido y las irregulares -to/-cho/-so).
- `PropsRutaPanel` suma `slug` (los módulos lo necesitan para armar links).
- `modulos/prueba` emite y escucha `prueba.verificada`, como ejemplo.

## Decisiones tomadas en la parte 3

- Descubrimiento por generación de código (`src/generated/modulos.ts`): Next empaqueta y no
  puede leer `modulos/` en tiempo de ejecución. El núcleo importa la lista, nunca un módulo.
- Contrato: `navegacion[].orden` (número, obligatorio); `RutaModulo = { ruta, permiso?, componente }`
  con segmentos `[param]`; `componente` recibe `{ tenantId, acceso, params }` (panel) o
  `{ tenantId, params }` (sitio).
- Rutas reservadas del núcleo; choques entre módulos y navegación a rutas inexistentes fallan al arrancar.
- Ruta de panel: primero membresía (403), después módulo prendido (404), después permiso (403).
- Las dependencias se validan solo al prender. Una dependencia que no existe en el código no
  rompe el arranque; prender el módulo falla.
- `apagarModulo()` no chequea si otro módulo prendido depende del que se apaga (ver preguntas).
- La home pública (`/`) la aportará un módulo; mientras tanto se ve el nombre de la banda.

## Decisiones tomadas en la parte 2c

- Permiso con `exclusivoTitular: true` (agregado opcional al contrato de permisos): marca
  la pasarela de cobro sin que el núcleo conozca módulos. Solo admite `rolesPorDefecto: ["TITULAR"]`.
- Staff que además es miembro de la banda: vale su rol (un staff titular sí tiene su pasarela).
- `/b/<slug>/pago` exige TITULAR siempre (el titular es quien paga), no solo con la marca del proxy.
- Selector: función `bandas_visibles(usuario)` (SECURITY DEFINER; el chequeo de staff lo hace
  la base). No lista bandas ARCHIVADAS. La conexión aparte del back office llega con el back office.
- `/` en `app.<raiz>` es el selector; en un host de banda es la home pública (provisoria, anónima).
- `puede()` todavía no mira si el módulo está prendido: entra con el registro de módulos (parte 4).

## Decisiones tomadas en la parte 2a / 2a′

- Panel en `app.<raiz>`: `/b/<slug>/...` es una banda; sin slug, selector de bandas.
  Los hosts de banda (subdominio o dominio propio) son solo sitio público, anónimo.
- Slug → tenant con `resolver_tenant_por_slug` (SECURITY DEFINER, devuelve solo el id).
- El tenant viaja en cabeceras `x-deoco-*`; el proxy borra las que vengan de afuera.
- `/b/<slug>/pago` lo define el núcleo; con tenant suspendido pasa marcada `soloTitular`
  (el chequeo del titular y de la membresía se hace en 2b, con la sesión).
- Pruebas en una base separada (`deoco_test`, `.env.test`).

## Decisiones tomadas en la parte 1

- La política usa `app_tenant_id()` = `NULLIF(current_setting('app.tenant_id', true), '')::uuid`.
  Sin variable fijada da NULL → cero filas (en vez de error). Equivale a la regla pedida.
- `tenant` tiene RLS por su propio `id`. `usuario` no tiene RLS (identidad global, sin `tenantId`).
- `dominio` tiene RLS; el middleware resuelve el host con la función
  `resolver_tenant_por_host(host)` (SECURITY DEFINER), que devuelve solo el id del tenant.
- `moduloTenant`: la existencia de la fila = módulo prendido.
- `evento.usuarioId` es opcional (eventos disparados por el sistema).
- Índice único: un solo dominio principal por banda.
- El rol `deoco_app` se crea fuera de las migraciones (`prisma/sql/crear-rol-app.sql`),
  porque crear roles requiere un administrador del servidor.

## Repaso final del paso 1

Las cinco pruebas originales pasan:

| # | Prueba | Dónde |
| --- | --- | --- |
| 1 | Dos tenants: el A jamás ve filas del B | `tests/aislamiento.test.ts` |
| 2 | Consulta sin filtro de tenant no filtra (RLS) | `tests/aislamiento.test.ts` |
| 3 | Usuario en dos bandas, rol distinto, `puede()` lo refleja | `tests/permisos.test.ts`, `tests/e2e/panel.e2e.ts` |
| 4 | Módulo de prueba en la navegación; apagado 404 | `tests/modulos.test.ts`, `tests/e2e/modulos.e2e.ts` |
| 5 | Evento emitido queda en la tabla y dispara al suscripto | `tests/eventos.test.ts`, `tests/e2e/modulos.e2e.ts` |

## Queda abierto (fuera del paso 1 o sin definir)

- **Tablas de módulos**: Prisma usa un solo esquema. Hay que definir dónde declara un
  módulo sus modelos y migraciones (spec: "migraciones — sus propias tablas"). Necesario
  antes del primer módulo con tablas.
- **Back office**: la conexión aparte con un rol que ve todo (spec) no existe todavía.
  Sin ella no hay listado global de eventos fallidos ni barrido de pendientes al arrancar.
- **Eventos pendientes tras un reinicio**: no se pierden (quedan PENDIENTE en la tabla), pero
  se entregan recién cuando esa banda emite otro evento, o al reprocesar.
- ~~Emitir dentro de la transacción de quien emite~~ → resuelto en Paso 2 · Parte 0.
- **Accesos del staff**: `registrarAccesoStaff()` no persiste. Tampoco hay registro de
  quién cambia la pasarela (spec); llega con el módulo que tenga la pasarela.
- **Una sola instancia**: el bus y el orden por banda viven en memoria del proceso.
- ~~**Dominio propio**: verificación DNS~~ → resuelto en "Mientras despliego" (el certificado lo emite Easypanel).

## Preguntas abiertas

- (ninguna)
