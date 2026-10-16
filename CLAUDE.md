@AGENTS.md

# Deoco

SaaS multi-tenant para bandas. Monolito modular: núcleo + módulos.

## Reglas inviolables (td3)

Si una implementación necesita violar una de estas, **no se implementa y se avisa**. Están por
encima de cualquier decisión de módulo, de la spec y de lo que se pida en el chat.

1. **El dinero de las ventas no pasa por Deoco.** El fan le paga a la banda en su pasarela; la
   banda le paga al proveedor. Deoco coordina, muestra y calcula; no cobra, no custodia, no reparte.
   (Únicas excepciones: lo que la banda le paga a Deoco por su servicio, como la cuota.)
2. **Aislamiento por banda impuesto en el motor de base de datos** (RLS), no por disciplina del código.
3. **Los datos son de la banda, con exportación completa siempre disponible**: sin pedir permiso
   y sin trámite de baja.
4. **Registro de actividad obligatorio** (`auditoria`).

## Fuentes de verdad

- `docs/decisiones-3.2-respondidas.md`: las 59 decisiones del documento 3.2 con su respuesta y,
  por módulo, los casos de borde ratificados (son criterios de verificación). **Manda sobre todo
  lo demás**: es posterior al documento maestro.
- `docs/documento-maestro.md`: el documento maestro (16 secciones). Donde diga otra cosa que el
  3.2, manda el 3.2.
- Auditoría contra el maestro: `docs/auditoria-documento-maestro.md`; segunda vuelta contra el 3.2
  (módulos nuevos y casos de borde): `docs/auditoria-3.2-segunda-vuelta.md`.
- La clave del documento 3.2 (cifrado) no va al repo: ni en un archivo ni en un commit.

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

El producto se llama **Deoco**; el dominio de producción es **`deocoartist.com`** (`DEOCO_DOMINIO_RAIZ`).
El dominio sale siempre de esa variable (`dominioRaiz()`, que falla si falta): nunca se escribe en el código.

`src/proxy.ts` (Next 16 renombró `middleware` → `proxy`; corre en Node) resuelve el
tenant de dos maneras y aplica las mismas reglas de estado (`src/nucleo/tenant/reglas.ts`):

- `app.<DEOCO_DOMINIO_RAIZ>/b/<slug>/...` → panel de esa banda, tenant por slug.
- `app.<DEOCO_DOMINIO_RAIZ>` sin `/b/<slug>` → plataforma (selector de bandas, login), sin tenant.
- Cualquier otro host (`labanda.deocoartist.com`, dominio propio) → sitio público (superficie
  `"publico"`), tenant por host. Anónimo.
- `/b/<slug>/pago` y `/b/<slug>/devoluciones` los define el núcleo: abiertos en todos los estados,
  también ARCHIVADA (darse de baja o volver; devolver lo que debe), solo para el titular.
  `/b/<slug>/dominios` también (la cuota impaga no le impide llevarse sus dominios; archivada no suma
  dominios nuevos). Archivada: el gestor cancela la suscripción (`cancelarDeArchivadas`); si vuelve
  y paga, `fijarEstado(…, { volver: true })` la deja ACTIVA.
- Escalera de la cuota impaga (`reglas.ts`, días en `comercial_config`, los edita el staff): 3 MOROSO
  (aviso + mail), 15 MOROSO_GRAVE (aviso permanente), 30 SOLO_LECTURA (el panel se ve y no guarda:
  marca `soloLectura` → `accesoPanel`; el permiso de `edicion` de cada módulo da false y
  `accionesDelPanel` corta; credenciales y correo también; pago, dominios y la puerta sí), 60
  SUSPENDIDO (además el sitio deja de estar publicado y `crearCobro` no abre ventas; lo ya cobrado se
  registra), 90 ARCHIVADO (lo pone el gestor; desarchivar es del staff). Pagar antes del archivo
  devuelve todo (el sitio vuelve tal como estaba: nunca se despublica nada en la base).
- Banda cerrada: con SUSPENDIDO (sitio público) o ARCHIVADO (panel y sitio), una ruta de módulo
  pasa el proxy marcada (`bandaCerrada`) y abre solo si declara `conBandaCerrada` y da true. Panel
  (con permiso): `accesoPanel` mira la ruta del pedido y la que nombra quien llama
  (`src/nucleo/acceso/banda-cerrada.ts`); la puerta, para los shows vendidos que no terminaron.
  Sitio: `SuperficiePublica`; las entradas y el pedido del fan. Lo demás → 404 (o el inicio).
- Solo resuelven dominios **verificados**. En el sitio público, todo dominio de la banda que no
  sea el principal redirige (307) al principal, misma ruta, SOLO si el principal anda
  (`fallasSeguidas` = 0 y sin `problemaDesde`): si no, el sitio se sirve donde se pidió (el
  subdominio es la red de seguridad de la banda).
- El tenant viaja en cabeceras `x-deoco-*` del pedido; se lee con `tenantDelPedido()`.

## Sesión, rol y permisos

- Auth.js (`src/nucleo/auth`): email + contraseña (argon2id). La sesión (JWT) lleva SOLO `sub`.
  Cookie `deoco.sesion` (`__Host-deoco.sesion` en producción), host-only de `app.<raiz>`:
  los sitios públicos no la reciben. Auth.js, `/ingresar` y el selector dan 404 en hosts de banda.
- Rol por pedido: sesión + tenant del proxy → `membresia` (`src/nucleo/acceso/resolver.ts`).
- En páginas y rutas del panel: `accesoPanel()`, `exigirPermiso()`, `exigirTitular()`,
  `puedeEnPedido()` (`src/nucleo/acceso/panel.ts`). Fuera del pedido: `puede(usuarioId, tenantId, permiso)`.
- Roles: TITULAR, EDITOR, LECTURA del núcleo (`src/nucleo/acceso/roles.ts`); los demás los declara
  un módulo (`roles`; PUERTA ticketera, COMERCIAL tienda+ticketera). `membresia.rol` es texto; un
  rol cuyos módulos están apagados no da permisos (`rolVigente`).
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
  `<id>.recurso.accion`, rutas sin choques ni rutas del núcleo (`/`, `/pago`, `/archivos`, `/dominios`, `/correo`, `/credenciales` en el panel;
  `/ingresar`, `/api`, `/b`, `/archivos`, `/admin`, `/avisos`, `/clave`, `/descargas`, `/portal` en el sitio), navegación que apunta a rutas propias.
- Rutas: las de panel se montan en `/b/<slug>/<ruta>`, las públicas en la raíz del host de
  la banda. Admiten segmentos `[param]`. Módulo apagado → 404.
- Encendido: fila en `moduloTenant`. `prenderModulo()` / `apagarModulo()` son del staff;
  validan dependencias (no se prende sin ellas, no se apaga una que otro prendido usa).
- Nada vendido se corta: `enCurso(tenantId)` en el contrato (shows con entradas por delante,
  pedidos sin pagar vigentes, en revisión o sin despachar). Con algo abierto el staff no lo apaga y
  `fijarModulos` lo deja prendido como EXCEDENTE (`moduloTenant.excedenteDesde`, `retenidos`); el
  gestor cobra mientras tanto el plan que lo incluye (`comercial_cuenta.excedentePlanId`) y el
  barrido (`revisarExcedentes`) lo apaga cuando cierra. Si `enCurso` falla, no se apaga.
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

Diseño y plan: `docs/diseno-dominios.md`. Todo el tráfico pasa por Cloudflare (Authenticated
Origin Pulls; vuelta atrás en `docs/despliegue.md`); el estado es el que informa Cloudflare.

- `src/nucleo/dominios` (bajo RLS): `agregarDominio` (crea el custom hostname), `verificarDominio`
  (custom hostname activo = el CNAME a `customers.<raiz>` llega + `TXT _deoco.<dominio>` con el
  token de la banda; `via: "zona"`: zona activa, verifica el dominio y su www), `marcarPrincipal` (certificado activo según
  Cloudflare, consultado en el momento), `quitarDominio` (confirmado; nunca el principal ni el
  subdominio; borra el custom hostname si ninguna otra banda lo registró), `revisarDominios`
  (barrido, 6 h; dos fallas → `problemaDesde` + `problema`; y cada 10 min las delegaciones
  pendientes: zona activa → verificadas solas).
- Delegar (`agregarDominio(…, "zona")`): zona en nuestra cuenta (`DEOCO_CLOUDFLARE_CUENTA`) con
  `jump_start` (trae el DNS anterior), registros del sitio a `DEOCO_IP_PUBLICA`, filas del
  dominio y su www. Una zona es de una sola banda (`zona_de_otra_banda()`). `.com.ar` sin
  registrar → `estadoProveedor: "sin-registrar"`, se reintenta. Sin completar a los 14 días, se
  libera sola (aviso en el panel 2 días antes, `delegacionesPorVencer`).
- Salir (`salida.ts`, D6): "Llevarme el DNS" (`llevarseElDns`) arma la lista para el DNS nuevo y,
  si sigue con el sitio, valida antes el custom hostname de www por TXT desde nuestra zona; el
  barrido pasa www a CNAME (y a HTTP para renovar), detecta los nameservers idos y da de baja la
  zona (`zona_saliente`); si no los cambia, baja a los 90 días con aviso 7 días antes. Quitar un
  delegado verificado abre lo mismo (la zona sigue 90 días); uno sin activar se borra ya.
- De CNAME a delegado sin corte: `pasarADelegado()` (`migrandoA` → al activarse, `via: "zona"`;
  el custom hostname viejo se borra con el certificado de la zona activo, `hostnameViejo`).
- Cloudflare detrás de `ProveedorDns` (`proveedor.ts`, `cloudflare.ts`): `DEOCO_CLOUDFLARE_TOKEN`
  + `DEOCO_CLOUDFLARE_ZONA` (las dos o ninguna; sin ellas no se agregan dominios). Pruebas:
  `tests/cloudflare-falso.ts` (`DEOCO_CLOUDFLARE_API`).
- Pantalla `/b/<slug>/dominios` (núcleo, solo titular) y la misma lista en `/admin`
  (`src/app/_dominios`). La app nunca emite un certificado ni toca Easypanel.
- Sin verificar, un dominio puede estar en varias bandas (comparten el custom hostname);
  verificado, en una sola.
- La IP del visitante (frenos por IP): `ipDelVisitante()` (`@/nucleo/publico/visitante`),
  `CF-Connecting-IP` primero.
- Correo desde el dominio (`src/nucleo/dominios/correo.ts`, pantalla `/b/<slug>/correo`, solo
  titular): una dirección por banda (`correo_dominio`), dominio de envío en Resend
  (`DominioDeEnvio`, `envio.ts`, `DEOCO_RESEND_TOKEN`; delegado: Deoco carga los registros). Verificada,
  los correos de los módulos de la banda salen desde ahí (`direccionDeEnvio`); los de origen
  `nucleo`, desde Deoco. Recepción solo en delegados sin MX propio: Email Routing → Email Worker
  (`infra/cloudflare/reenvio`, lee el destino del KV `DEOCO_CLOUDFLARE_KV`) → Resend.
- Registrador (D7, sin pantallas todavía): `Registrador` (`registrador.ts`, `registrador()` por
  `DEOCO_REGISTRADOR`), GoDaddy en `godaddy.ts` (subcuenta por banda, cola de 59/min). Pruebas:
  `tests/registrador-falso.ts`.
- Compra (D8, `compra.ts`): `dominioPagado(modulo, …)` / `renovacionPagada` (SOLO el gestor: lo verifica; idempotentes
  por cobro) → máquina de estados en `dominio_compra` (tomada en la base, reintentos, `datos`,
  `fallido` con `devolucion: "pendiente"`; ya registrado nunca se devuelve), en el barrido
  (`revisarCompras`). `dominio.comprado`: no se quita ni se "lleva el DNS". Staff: `/admin/dominios`.
- Venta (D9, `venta.ts`): `cotizarDominio` / `buscarDominios` / `pagarDominio` / `pagarRenovacion` → el
  gestor cobra; la compra pide la devolución al gestor (`devolucion` pendiente → pedida).
  Privacidad del WHOIS incluida en el precio y activada (`gestion.dominios.privacidad(tld)`; el
  staff suma su costo por terminación); donde no hay, se dice antes de pagar.
- Salidas (D12, sin staff): delegado y .com.ar cambian los nameservers; comprado: código de
  transferencia, o "solo el DNS" (`ponerMisNameservers`: Deoco pone los de su proveedor; queda
  `soloRegistro`); CNAME: quitar. `tests/salidas.test.ts` las recorre todas.
- Renovación y salida (D11): `vencimiento.ts` (calendario, vencer, gracia, pérdida), `transferencia.ts`
  (código en el panel, nunca por mail), `plazos.ts`; `cambiarTitularRegistral` (tipo `titular`).
- Pantallas de compra (D10): `/b/<slug>/dominios/comprar[/<dominio>[/resumen]]` y el progreso
  `/b/<slug>/dominios/compras` (`seguimiento.ts`, de la base: sirve aunque cierre la página).
- Traefik (Easypanel): las rutas de Deoco van en el YAML propio (no en Easypanel); `aop` solo en
  `app.` (host exacto) y lista de IPs de Cloudflare en todas (`docs/despliegue.md`).

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
- Acaparamiento (`compras.ts`): reserva de 10 min (el cobro vence con ella), 6 por compra, 12 por
  email y show (pagadas + reservadas), 2 reservas abiertas por email y 4 por IP (`ipHash`, nunca la IP).
- QR firmado (`firma.ts`): 10 al azar + 10 de HMAC por banda con `DEOCO_CLAVE_QR` (`entorno` en
  el contrato: el arranque la exige). La puerta verifica la firma antes de tocar la base; los
  códigos viejos de 10 caracteres se siguen buscando (transición).
  La compra redirige a la pasarela desde el servidor (`redirect()` en `comprarAccion`): con las
  últimas entradas la página se rehace como "agotada" y un efecto del formulario no correría.
  El sitio lee sus fechas con la consulta `ticketera.proximas-fechas`.

## Tienda: el arte vendido no se pisa (`modulos/tienda/productos.ts`)

- Cada renglón del pedido guarda su `disenoId`. Cambiar el arte de un producto con un pedido pagado
  crea una versión (`tienda_diseno.reemplazaAId` → la anterior); sin ventas se pisa como siempre (una
  versión, solo si nadie más la usa). `historialDeArte` y su tarjeta en el producto. La biblioteca
  (`listarDisenos`) no muestra versiones.
- La banda elige el proveedor (`tienda_oferta`, global: producto base × proveedor con costo de
  producción, envío y plazo; `guardarOferta`, staff). `tienda_producto.proveedorId` se elige al crear
  (`ofertasDe`: activas y de proveedores activos; una sola → se toma sola). Con un pedido pagado no
  se cambia: se duplica. Oferta retirada: no se elige en productos nuevos, los existentes siguen.
  El renglón copia proveedor y costos de la oferta al pagarse (`fijarCostosDelPedido`).

## Planes y cuota (`modulos/comercial`, gestor de cuenta)

- `gestionaCuenta` (uno solo): decide el estado (la escalera de la cuota, hasta ARCHIVADO; una banda
  archivada ya no la toca), módulos y topes con `@/nucleo/cuenta` (`fijarEstado`, `fijarModulos`, `fijarLimites`,
  `catalogoDeCuenta`); pinta `/b/<slug>/pago`. `bandaCreada()` en toda alta (prueba de Medium).
- `mediciones: [{ clave, etiqueta, medir }]` en el contrato + archivos (núcleo): el uso de cada banda,
  en la ficha de `/admin` (`medicionDeBanda`, `src/nucleo/cuenta/medicion.ts`). Mide, no limita.
- `limites` en el contrato + `exigirLimite(tx, …)` antes de publicar (`ErrorLimite`, dice qué plan
  amplía). Bajar el tope → `ajustar`: los productos que sobran pasan a borrador por orden inverso de
  creación (nunca se borra); los shows, nunca (no se corta una venta abierta por una cuota: 3.2 d5).
- LA CUOTA ES LA EXCEPCIÓN AL DINERO: cuenta de Mercado Pago de Deoco, `DEOCO_CUOTA_MP_TOKEN` /
  `DEOCO_CUOTA_MP_SECRETO_AVISOS` (entorno, nunca `secreto`), solo el gestor
  (`@/nucleo/pagos/cuota`); webhook `app.<raiz>/avisos/plataforma/comercial/cuota/mercadopago`
  (`avisosPlataforma`). Cobros en `comercial_cobro`. Vencimientos: `tareasPeriodicas` del barrido.
- DOMINIOS (D9, `modulos/comercial/dominios.ts`, `gestionaCuenta.dominios`): misma cuenta de Deoco,
  NADA en común con la cuota: tablas `comercial_dominio_*`, aviso `…/comercial/dominio/mercadopago`,
  estados propios. Pago único solo inmediato (`binary_mode`, sin efectivo/cajero/transferencia).
  Solo un pago aprobado del monto exacto arranca la compra; cualquier otro se devuelve solo.
  Devoluciones con reintentos; "fallida" va a `alertasAdmin` (arriba de todo el back office).
  Los mails del gestor salen siempre desde Deoco.
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
  la única regla, con un bloqueo por referencia (dos avisos a la vez no se pisan); el módulo da su
  `CosaACobrar` (`buscar` → abierta/pagada/en-revision/**cerrada**, `alDevolverse`).
- Pagos para devolver (`cobro_duplicado`, motivo duplicado | tardio | no-coincide): todo pago que
  entró y no se entrega. Pantalla del núcleo `/b/<slug>/devoluciones` (titular, abierta en todo
  estado): "Devolver desde mi cuenta" (`devolverPagoDeLaBanda`, la pasarela con las credenciales
  de la banda: la plata va de la banda al comprador) o "Ya lo resolví". Pendientes = algo abierto
  del módulo (no se apaga).
- Devuelto o contracargo del cobro con que se pagó → `alDevolverse`: compra DEVUELTA (entradas
  `anuladaEn`, no entran en la puerta, el lugar vuelve); pedido DEVUELTO (`resolverConProveedor` si
  ya se mandó a producir).
- Conciliación (los avisos se pierden): `conciliarCobros(modulo, tenantId, referencia, registrar)`
  (`buscarCobros` de la pasarela) en tareas del barrido: `conciliarCompras`, `conciliarPedidos`
  (también vence los pedidos) y la cuota (`conciliarCuota` antes de subir un escalón; si la
  pasarela no responde, no sube).
- Vencimientos: el cobro lleva `vence` (y `soloInmediatos` en las entradas). Pedido: 7 días o un
  producto fuera de venta → CANCELADO. Compra: al cerrar la venta del tipo o empezar el show. Un
  pago que llega después → para devolver (tardío).
- Desde la primera venta (3.2 fiscal d1, multipaís d4): `fotoFiscal(tx, …)` (`@/nucleo/fiscal`) al
  pagarse, en `tienda_pedido.fiscal` / `ticketera_compra.fiscal` (vendedor de `datos_fiscales`,
  sin fila "sin_declarar"; comprador con DNI/CUIT opcional; renglones; IVA discriminado si es
  responsable inscripto). `tienda_pedido.pais` / `tienda_orden.pais` (hoy AR). Sin pantalla todavía.
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

- `alertasAdmin` (contrato): lo que el staff tiene que mirar ya, arriba de todas las páginas de `/admin`.
- Contrato: `avisos: [{ ruta, metodos?, manejador }]`. URL de plataforma:
  `app.<raiz>/avisos/<tenantId>/<moduloId><ruta>` (`src/app/avisos/...` → `atenderAviso` en
  `src/nucleo/avisos`). En hosts de banda, 404. Se atiende aunque la banda esté archivada o el
  módulo apagado (es plata que ya se movió); la firma la verifica el módulo con el cuerpo crudo.
  Rápidos e idempotentes.
- `emitir(..., { unica })`: idempotencia por (banda, nombre, clave) — `evento.claveUnica`.

## Correo, staff en módulos y links firmados

- Limpieza diaria (barrido, `src/nucleo/correo/limpieza.ts`): solo ENVIADO; adjuntos 7 d, cuerpo
  90 d, fila 365 d (`DEOCO_CORREO_DIAS_*`).

- Avisos de Deoco a una banda (sin módulo): `avisarAlTitular()` (`@/nucleo/correo/deoco`) sobre
  `enviarCorreoDelNucleo()` (origen `nucleo`; responde a `DEOCO_CUOTA_RESPONDER_A` o a nadie).
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
- Archivos de la banda en el panel (`/b/<slug>/archivos/<id>`): cada archivo guarda `moduloId` +
  `recurso`; el módulo declara `archivos: [{ recurso, permiso }]` y `guardarArchivo(…, { recurso })`
  exige uno declarado. La entrega pide ese permiso (`accesoAlArchivo`, `src/nucleo/archivos/permiso.ts`);
  sin recurso conocido, solo el titular. Tener el id no es un permiso.
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
  `lectura@demo.com`, `staff@deocoartist.com`, clave `demo1234`).

## Barrido (`src/nucleo/barrido.ts`)

- Al arrancar (producción) y cada `DEOCO_BARRIDO_SEGUNDOS`: retoma eventos y correos pendientes
  de todas las bandas (`bandas_con_pendientes()`, solo ids) y revisa dominios propios cada 6 h.
- Lo que habla con GoDaddy (cola de 59/min) corre APARTE del barrido, con su propio candado:
  `revisarComprasAparte` y los vencimientos (una vez por hora). En pruebas, `esperarCompras()`.
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
- Auditoría: tabla `auditoria` (núcleo), SOLO SE AGREGA: ni deoco_app ni deoco_admin pueden
  cambiarla o borrarla (REVOKE + disparador `auditoria_inmutable`; la retención, si llega, la corre
  el dueño). Pantallas: `/admin/auditoria` (todo, filtros en la URL) y `/b/<slug>/actividad` (la
  banda, titular; nombres por `autores_de_actividad()`, el staff como "Equipo de Deoco").
  `accionesDelPanel` deja `<modulo>.panel_guardado` en cada guardado. Toda acción del back office escribe su fila en la
  misma transacción (`auditar()`); para lo que corre en el núcleo (módulos, reproceso) se pasa
  `registrar` y va en la transacción del núcleo. Accesos del staff a un panel: `registrarAccesoStaff()`.
- Pantallas: bandas (listado, alta, detalle: estado, módulos, dominios, miembros), usuarios,
  eventos fallidos. Los tres listados: 50 por página, filtro/orden/página en la URL, consulta
  paginada en la base (`src/app/admin/_servidor/listado.ts`). ARCHIVADO pide confirmación. Una banda nunca queda sin titular.
- Claves temporales (alta, invitación): `usuario.claveTemporal`; `usuarioActivo()` manda a
  `/clave` hasta cambiarla. `/clave` también es el cambio normal de clave.

## Despliegue

Guía completa: `docs/despliegue.md` (Easypanel: Postgres + app por `Dockerfile` + volumen
`/data/archivos`; comodín `*.deocoartist.com` por DNS en Cloudflare). Al arrancar,
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
