@AGENTS.md

# Deoco

SaaS multi-tenant para bandas. Monolito modular: núcleo + módulos.

## Método de trabajo

- Spec primero: `docs/spec/`. Plan y estado: `docs/tareas.md`. No se inventan
  funcionalidades fuera de la spec; si algo no está definido, se pregunta.
- Una parte por vez, revisada antes de seguir. Actualizar `docs/tareas.md` al cerrar cada una.

## Reglas que no se rompen

- El núcleo (`src/nucleo`) NO conoce módulos concretos. Los módulos (`modulos/<id>/index.ts`)
  se registran contra el contrato. Un módulo nunca importa código de otro.
- Toda tabla con datos de banda lleva `tenantId` + política RLS (ver migración `*_rls`).
- Toda consulta de datos de banda pasa por `conTenant(tenantId, fn)`.
- La app se conecta como `deoco_app` (sin BYPASSRLS). El rol dueño solo corre migraciones.
- La sesión guarda solo el usuario; la banda la resuelve el dominio en cada pedido.

## Hosts y tenant

`src/proxy.ts` (Next 16 renombró `middleware` → `proxy`; corre en Node) resuelve el
tenant de dos maneras y aplica las mismas reglas de estado (`src/nucleo/tenant/reglas.ts`):

- `app.<DEOCO_DOMINIO_RAIZ>/b/<slug>/...` → panel de esa banda, tenant por slug.
- `app.<DEOCO_DOMINIO_RAIZ>` sin `/b/<slug>` → plataforma (selector de bandas, login), sin tenant.
- Cualquier otro host (`labanda.deoco.com`, dominio propio) → sitio público (superficie
  `"publico"`), tenant por host. Anónimo.
- `/b/<slug>/pago` lo define el núcleo: abierto con la banda suspendida, solo para el titular.
- Solo resuelven dominios **verificados**. En el sitio público, todo dominio de la banda que no
  sea el principal redirige (307) al principal, misma ruta.
- El tenant viaja en cabeceras `x-deoco-*` del pedido; se lee con `tenantDelPedido()`.

## Sesión, rol y permisos

- Auth.js (`src/nucleo/auth`): email + contraseña (argon2id). La sesión (JWT) lleva SOLO `sub`.
  Cookie `deoco.sesion` (`__Host-deoco.sesion` en producción), host-only de `app.<raiz>`:
  los sitios públicos no la reciben. Auth.js, `/ingresar` y el selector dan 404 en hosts de banda.
- Rol por pedido: sesión + tenant del proxy → `membresia` (`src/nucleo/acceso/resolver.ts`).
- En páginas y rutas del panel: `accesoPanel()`, `exigirPermiso()`, `exigirTitular()`,
  `puedeEnPedido()` (`src/nucleo/acceso/panel.ts`). Fuera del pedido: `puede(usuarioId, tenantId, permiso)`.
- Permisos: los declara cada módulo en su contrato. `exclusivoTitular` = ni otro rol
  ni el staff (pasarela de cobro). La excepción del staff está en `src/nucleo/permisos/puede.ts`.
  Un permiso de un módulo apagado para la banda es siempre false.
- Staff sin membresía: `registrarAccesoStaff()` lo deja en `auditoria` (una fila cada 10 min).
- Formularios del panel de un módulo: `edicion: { permiso, ruta, sinPermiso, guardado? }` en el
  contrato (el registro lo valida al arrancar) + `accionesDelPanel(() => modulo, [errores])`
  (`src/nucleo/acceso/acciones.ts`). Todo permiso escrito en un módulo debe estar declarado (prueba).
- `usuario` tiene RLS por persona: `conUsuario(id)` (`app.usuario_id`, solo núcleo) y
  `usuarioPropio(id)` (una vez por pedido). deoco_app no escribe `esStaff`/`email` ni inserta o
  borra; login por `usuario_para_ingresar()`, altas del staff por funciones acotadas
  (`crearCuentaExterna`). Un módulo no lee `usuario`: `titularDeBanda(tx)` (`@/nucleo/personas`).

## Módulos

Guía para escribir uno: `docs/guia-modulos.md`.

- Cada módulo es `modulos/<id>/index.ts` con `export default` un objeto `Modulo`
  (`src/nucleo/modulos/contrato.ts`). Ejemplo completo: `modulos/prueba/`.
- Descubrimiento: `scripts/descubrir-modulos.mjs` genera `src/generated/modulos.ts`
  (imports estáticos, no versionado). Lo corre `next.config.ts` en `next dev` / `next build`
  (con cualquier comando) y npm antes de test/typecheck.
  El núcleo nunca nombra un módulo (lo verifica `tests/modulos.test.ts`).
- El registro (`src/nucleo/modulos/registro.ts`) valida el contrato al arrancar: ids, permisos
  `<id>.recurso.accion`, rutas sin choques ni rutas del núcleo (`/`, `/pago`, `/archivos`, `/dominios`, `/credenciales` en el panel;
  `/ingresar`, `/api`, `/b`, `/archivos`, `/admin`, `/avisos`, `/clave`, `/descargas`, `/portal` en el sitio), navegación que apunta a rutas propias.
- Rutas: las de panel se montan en `/b/<slug>/<ruta>`, las públicas en la raíz del host de
  la banda. Admiten segmentos `[param]`. Módulo apagado → 404.
- Encendido: fila en `moduloTenant`. `prenderModulo()` / `apagarModulo()` son del staff;
  validan dependencias (no se prende sin ellas, no se apaga una que otro prendido usa).
- `SOLO_DESARROLLO.md` en la carpeta de un módulo lo excluye del build de producción
  (`next build`, lo invoque quien lo invoque).
- Navegación: menú del panel = entradas de módulos prendidos filtradas por permiso; pestañas
  públicas = entradas `publica: true` de módulos prendidos. Ordena `orden` (menor primero).
- Un módulo nunca importa código de otro.
- Tablas de módulo: `modulos/<id>/esquema.prisma` (se copia a `prisma/schema/modulos/`; el núcleo
  está en `prisma/schema/nucleo.prisma`). Prefijo `<Id>`/`<id>_`, `tenantId` sin relación Prisma,
  validado por el script. Migración en `prisma/migrations` terminada en
  `SELECT deoco_aislar_tabla('<tabla>')`. `tests/aislamiento.test.ts` exige RLS, política,
  `tenantId` y prefijo en toda tabla que no sea del núcleo.

## Dominios propios

- `src/nucleo/dominios` (bajo RLS): `agregarDominio`, `verificarDominio` (DNS: `A` a la IP del
  servidor + `TXT _deoco.<dominio>` con el token de la banda), `marcarPrincipal` (verificado y
  abriendo por HTTPS con certificado válido), `quitarDominio` (confirmado; nunca el principal ni
  el subdominio).
- Pantalla `/b/<slug>/dominios` (núcleo, solo titular) y la misma lista en `/admin`
  (`src/app/_dominios`). El certificado lo emite Easypanel: la app nunca lo intenta.
- Sin verificar, un dominio puede estar en varias bandas; verificado, en una sola.

## Secretos por banda

- Contrato: `secretos: [{ clave, etiqueta, ayuda? }]`. Tabla `secreto` (RLS), valor cifrado
  AES-256-GCM con `DEOCO_CLAVE_SECRETOS`, atado a banda/módulo/clave.
- Lectura (módulos): `leerSecreto(suPropioContrato, tenantId, clave)` (`src/nucleo/secretos`).
  Carga (núcleo, solo titular): `src/nucleo/secretos/carga.ts`, pantalla `/b/<slug>/credenciales`.
- Rotación de la clave: `DEOCO_CLAVE_SECRETOS_ANTERIOR` + `scripts/rotar-clave-secretos.mjs` (docs/despliegue.md).
- Un módulo no importa el registro ni la carga (`tests/modulos.test.ts`). Nunca se loguea ni
  se muestra un valor completo. El arranque exige la clave si algún módulo declara secretos.

## Cuentas externas (portal)

- `cuentasExternas` + `rutasExternas` → `app.<raiz>/portal/<id><ruta>` (`src/app/portal`). Tabla
  `cuenta_externa` (usuario, módulo, referencia; global, la escribe el staff). Lectura entre
  bandas con `conCuentaExterna()` + políticas SELECT del módulo con `app_referencia_externa('<id>')`.
  Lo usa la tienda: panel del proveedor (órdenes, despacho, cuenta corriente).
- Escribir en una banda como cuenta externa: `conCuentaExternaEnBanda()`. No fija la banda: solo
  alcanza lo que nombran políticas con `app_externo_tenant()`; el módulo decide con
  `<id>_externo_banda(uuid)` / `<id>_externo_archivo(uuid)` y limita columnas con disparadores.
  `tests/tienda-proveedor.test.ts` recorre todas las tablas desde esa transacción.
- Una migración de módulo no cambia tablas del núcleo (`tests/aislamiento.test.ts`).

## Ticketera (`modulos/ticketera`)

- Shows, tipos con cupo (CHECK en la base), compra con `@/nucleo/pagos`, entradas nominadas
  con QR (mail con `adjuntos` cid:), puerta (`/b/<slug>/puerta`, rol PUERTA). Pestaña "Fechas".
  La compra redirige a la pasarela desde el servidor (`redirect()` en `comprarAccion`): con las
  últimas entradas la página se rehace como "agotada" y un efecto del formulario no correría.
  El sitio lee sus fechas con la consulta `ticketera.proximas-fechas`.

## Planes y cuota (`modulos/comercial`, gestor de cuenta)

- `gestionaCuenta` (uno solo): decide estado automático (ACTIVO/MOROSO/SUSPENDIDO; ARCHIVADO
  nunca), módulos y topes con `@/nucleo/cuenta` (`fijarEstado`, `fijarModulos`, `fijarLimites`,
  `catalogoDeCuenta`); pinta `/b/<slug>/pago`. `bandaCreada()` en toda alta (prueba de Medium).
- `limites` en el contrato + `exigirLimite(tx, …)` antes de publicar (`ErrorLimite`, dice qué plan
  amplía). Bajar el tope → `ajustar` despublica lo último publicado (`publicadoEn`), nunca borra.
- LA CUOTA ES LA EXCEPCIÓN AL DINERO: cuenta de Mercado Pago de Deoco, `DEOCO_CUOTA_MP_TOKEN` /
  `DEOCO_CUOTA_MP_SECRETO_AVISOS` (entorno, nunca `secreto`), solo el gestor
  (`@/nucleo/pagos/cuota`); webhook `app.<raiz>/avisos/plataforma/comercial/cuota/mercadopago`
  (`avisosPlataforma`). Cobros en `comercial_cobro`. Vencimientos: `tareasPeriodicas` del barrido.
- Las pruebas vuelven a sembrar planes y plazos en `limpiar()` (`sembrarComercial`).

## Autogestión del alta (`src/nucleo/autogestion`, `/registro`)

- Registro → mail con link (token después de "#", se guarda su sha256) → el usuario recién existe
  al confirmar (`registro_confirmar`) → `/registro/banda` → `crear_banda_autogestion` (una por
  cuenta, la impone la base) → `bandaCreada(…, "autogestion", opcion)`. `registro_pendiente` no
  la lee nadie (política `false`). Subdominios reservados: `src/nucleo/tenant/reservados.ts`.

## Cobros (`src/nucleo/pagos`)

- Pasarelas (hoy Mercado Pago) y credenciales de cobro de la banda: del núcleo (secreto con
  módulo `pagos`, Credenciales → Cobros). Módulos con `cobros: true` + aviso `/pago/[pasarela]`
  usan `pasarelaLista`, `crearCobro`, `cobroDelAviso`, `probarConexion`. Lo usan tienda y ticketera.
- Registrar el pago: `registrarCobro(modulo, tenantId, pasarela, cobro, cosa)` (`src/nucleo/pagos/registro.ts`),
  la única regla (revisión, duplicado, pagado una vez); el módulo da su `CosaACobrar`. Duplicados
  en `cobro_duplicado` (núcleo, RLS), se leen con `cobrosDuplicados`.
- Comunes del núcleo: `@/nucleo/dinero` (pesos), `@/nucleo/fechas` (hora argentina),
  `@/nucleo/publico/{origen,estilo,refrescar}`, `esEmail` (`@/nucleo/correo/direccion`).

## Consultas entre módulos

- Contrato: `consultas: [{ nombre, responder(tenantId, params) }]`. Otro módulo la pide con
  `consultar(tenantId, "<id>.<nombre>", params, { vacio, interpretar })` (`src/nucleo/consultas`).
  Módulo apagado, inexistente, error o demora → `vacio`. Respuesta JSON, copiada.

- Inicio del panel: consulta `inicio` de cada módulo → bloque (`src/nucleo/inicio`).

## Parámetros de consulta

- Las rutas de módulos (panel y públicas) reciben `consulta: URLSearchParams`.

## Avisos externos (webhooks)

- Contrato: `avisos: [{ ruta, metodos?, manejador }]`. URL de plataforma:
  `app.<raiz>/avisos/<tenantId>/<moduloId><ruta>` (`src/app/avisos/...` → `atenderAviso` en
  `src/nucleo/avisos`). En hosts de banda, 404. El núcleo resuelve banda/módulo prendido; la
  firma la verifica el módulo con el cuerpo crudo. Rápidos e idempotentes.
- `emitir(..., { unica })`: idempotencia por (banda, nombre, clave) — `evento.claveUnica`.

## Correo, staff en módulos y links firmados

- Correo (`src/nucleo/correo`): `enviarCorreo(contrato, tenantId, correo, { tx?, unica? })` (sin
  `responderA`, responde al titular de la banda; con
  `adjuntos` opcionales, imágenes `cid:`) guarda
  en `correo` (RLS) y sale después de responder. Transporte por `DEOCO_CORREO` (`smtp` con
  `DEOCO_SMTP_URL`/`DEOCO_CORREO_REMITENTE`, `memoria` en desarrollo y pruebas).
- `conStaff(accion, fn)` (`src/nucleo/acceso/staff.ts`): transacción de la app marcada como staff
  (`app_es_staff()`), auditada. Única forma de escribir tablas globales de módulos
  (`tablasGlobales`, `/// @global`, `deoco_tabla_global`).
- `rutasAdmin` → `/admin/m/<id><ruta>` (solo staff, 404 si no); `navegacion` con `admin: true`.
- `urlFirmada(contrato, tenantId, archivoId)` → `app.<raiz>/descargas/...` (vence: 410; alterado: 404).
- Archivos de plataforma (`src/nucleo/archivos/plataforma.ts`, tabla global `archivo_plataforma`):
  `guardarArchivoPlataforma(tx de conStaff, ...)`, públicos en `/archivos/plataforma/<id>/<nombre>`.

## Sitio público: título, vista previa y cabecera

- `metadatos` por ruta pública + `metadatosPublicos` (un módulo) → `resolverMetadatos`
  (`src/nucleo/modulos/metadatos.ts`). Fallback: nombre de la banda, nunca "Deoco" (también
  en el layout y el 404 de los hosts de banda).
- `cabeceraPublica: { componente, orden }` (uno por módulo): elementos en la cabecera del marco,
  en fila por `orden` (el carrito de la tienda, 10).

## Archivos

- `src/nucleo/archivos`: interfaz `Almacen` (hoy `AlmacenDisco` en `DEOCO_ARCHIVOS_DIR`, un volumen
  en Easypanel; mañana S3/MinIO/R2 por `DEOCO_ALMACEN`) + tabla `archivo` (RLS).
- `guardarArchivo` valida tipo por contenido, tamaño (≤25 MB) y cuota (`tenant.limiteAlmacenamiento`
  o `DEOCO_LIMITE_ALMACENAMIENTO`); genera versiones WebP con sharp.
- Se sirven en `/archivos/<id>/<nombre>` (sitio público: solo `publico`, por host) y
  `/b/<slug>/archivos/...` (panel, con sesión). SVG siempre como descarga, con CSP sandbox.

## Panel y sitio público

- Panel: componentes oficiales de Untitled UI (`src/components/`, `untitledui add`) detrás de
  `@/ui` (`src/ui/`, ver su README). Las pantallas importan solo de `@/ui` y no arman a mano lo
  que el kit tiene (`tests/ui-propia.test.ts`). Propios: `CampoArchivo`, `Tarjeta`, `Aviso`,
  `Copiable`, `CampoColor`. Listados largos: `Tabla` con `orden`/`paginacion` + `Filtros`, todo
  en la URL y resuelto en la base. En este entorno la CLI necesita `NODE_USE_ENV_PROXY=1`;
  PRO con `--license "$UNTITLEDUI_LICENSE"` (`docs/untitled-ui-pro.md`).
- Sitio público: estilo propio de cada banda (marco del módulo sitio, `marcoPublico`).
- Demo: `npm run db:demo` (Los Satélites y Niebla Norte, usuarios `titular@demo.com`,
  `lectura@demo.com`, `staff@deoco.com`, clave `demo1234`).

## Barrido (`src/nucleo/barrido.ts`)

- Al arrancar (producción) y cada `DEOCO_BARRIDO_SEGUNDOS`: retoma eventos y correos pendientes
  de todas las bandas (`bandas_con_pendientes()`, solo ids) y revisa dominios propios cada 6 h.
- Evento y correo se "toman" en la base (`tomadoEn`) antes de procesarse: nunca dos veces.

## Bus de eventos

- `emitir(nombre, tenantId, payload, usuarioId?)` (`src/nucleo/eventos/bus.ts`): guarda la fila
  en `evento` (PENDIENTE) y vuelve. La entrega se programa con `after()` de Next (después de
  responder); fuera de un pedido, en segundo plano.
- `emitir(..., { tx })`: el evento se guarda en una transacción de `conTenant` de la misma
  banda (atómico con el dato); la entrega arranca al confirmarse (`alConfirmar`).
- Nombres `entidad.accion` en participio, declarados en `eventosEmite` de algún módulo.
- Una cola por banda, por `secuencia`: orden de emisión. Módulo apagado no recibe.
- Un suscripto que falla queda en `evento.fallos`; el evento termina FALLIDO.
  `reprocesarEvento()` reentrega solo a los que fallaron. Manejadores idempotentes.

## Back office (`app.<raiz>/admin`)

- Solo `esStaff`; cualquier otro caso (sin sesión, no staff, host de banda) es **404**
  (`src/app/admin/_servidor/acceso.ts`, en cada página y acción).
- Conexión aparte: rol `deoco_admin` (BYPASSRLS), `DATABASE_URL_ADMIN`, cliente en
  `src/app/admin/_servidor/db.ts`. **Solo** se importa desde `src/app/admin`
  (`tests/admin.test.ts` falla si no).
- Auditoría: tabla `auditoria` (núcleo). Toda acción del back office escribe su fila en la
  misma transacción (`auditar()`); para lo que corre en el núcleo (módulos, reproceso) se pasa
  `registrar` y va en la transacción del núcleo. Accesos del staff a un panel: `registrarAccesoStaff()`.
- Pantallas: bandas (listado, alta, detalle: estado, módulos, dominios, miembros), usuarios,
  eventos fallidos. Los tres listados: 50 por página, filtro/orden/página en la URL, consulta
  paginada en la base (`src/app/admin/_servidor/listado.ts`). ARCHIVADO pide confirmación. Una banda nunca queda sin titular.
- Claves temporales (alta, invitación): `usuario.claveTemporal`; `usuarioActivo()` manda a
  `/clave` hasta cambiarla. `/clave` también es el cambio normal de clave.

## Despliegue

Guía completa: `docs/despliegue.md` (Easypanel: Postgres + app por `Dockerfile` + volumen
`/data/archivos`; comodín `*.deoco.com` por DNS en Cloudflare). Al arrancar,
`scripts/arrancar.sh` aplica migraciones y levanta el server; en producción
`src/instrumentation.ts` → `src/nucleo/arranque.ts` verifica variables, roles de base, volumen,
módulos y que el build sea de producción (`generadoPara`), y si algo falla el proceso termina.
`next build` no necesita base (el cliente Prisma es perezoso; `prisma.config.ts` tolera la
falta de `DATABASE_URL_MIGRACIONES`). Solo la primera persona de staff va a mano
(`CLAVE=… node scripts/crear-staff.mjs <email> "<nombre>"` en la consola de la app); el resto, desde `/admin`.

## Público: errores, acceso y carga

- Ningún error técnico al público: `mensajeParaElPublico()` (`src/nucleo/publico/errores.ts`) y
  `src/app/error.tsx`. Pool y tiempos: `src/nucleo/db/config.ts` (`DEOCO_DB_CONEXIONES`).
- Acceso sin cuenta a algo privado (entradas, pedido): cookie del sitio de la banda
  (`recordarAcceso`/`accesoRecordado`) + link del mail con el token después de "#" (`CanjearLink`).
  Nunca un token en una URL que vea un tercero.

## Comandos

- `npm test` — pruebas, contra la base de `.env.test` (ver `.env.test.example`)
- `npm run test:e2e` — punta a punta: levanta `next dev` en :3200 sobre la base de pruebas
  y navega con Chromium (`/opt/pw-browsers/chromium`, o la ruta en `CHROMIUM`)
- `npm run test:carga` — carga por HTTP contra un build de producción (:3300); lento, aparte
- `npm run typecheck` · `npm run lint`
- `npm run db:migrate:test` — migraciones en la base de pruebas (`.env.test` pisa el entorno: `scripts/con-entorno.mjs`)
- `npm run db:migrar` — migraciones de desarrollo (descubre módulos + `prisma migrate dev`, rol dueño)

## Base local

```sh
psql -c "CREATE ROLE deoco_owner LOGIN PASSWORD 'owner' CREATEDB"
psql -c "CREATE DATABASE deoco OWNER deoco_owner"
psql -d deoco -v clave="'app'" -f prisma/sql/crear-rol-app.sql
psql -d deoco -v clave="'admin'" -f prisma/sql/crear-rol-admin.sql
npm run db:migrar
npm run db:semilla            # banda-a.lvh.me y banda-b.lvh.me (vacías)
npm run db:demo               # dos bandas con el sitio cargado y publicado

# base de pruebas
psql -c "CREATE DATABASE deoco_test OWNER deoco_owner"
npm run db:migrate:test
```

## Desarrollo con subdominios (sin tocar /etc/hosts)

`DEOCO_DOMINIO_RAIZ="lvh.me"`: todo `*.lvh.me` resuelve a 127.0.0.1 por DNS público.
Mismo esquema de hosts que producción (`app.` + subdominios de banda).

- Panel: http://app.lvh.me:3000 · http://app.lvh.me:3000/b/banda-a
- Sitios públicos: http://banda-a.lvh.me:3000 · http://banda-b.lvh.me:3000
- Sin internet (lvh.me necesita DNS): `curl -H "Host: banda-a.lvh.me" http://127.0.0.1:3000/`
