# Cómo escribir un módulo de Deoco

Un módulo es una carpeta `modulos/<id>/` que se enchufa al núcleo sin tocarlo.
El ejemplo completo y funcionando es `modulos/prueba/`.

## 1. La forma

```
modulos/<id>/
  index.ts        export default el objeto Modulo (obligatorio)
  esquema.prisma  sus tablas (opcional; ver "Tablas")
  *.tsx           páginas de panel y del sitio público
  acciones.ts     server actions ("use server")
```

`index.ts` exporta un objeto que cumple `Modulo` (`src/nucleo/modulos/contrato.ts`):

```ts
import type { Modulo } from "@/nucleo/modulos/contrato";

const tienda: Modulo = {
  id: "tienda",                       // minúsculas, números y guiones
  nombre: "Tienda",
  permisos: [
    { clave: "tienda.producto.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    // exclusivoTitular: ni otro rol ni el staff de Deoco. Solo con ["TITULAR"].
    { clave: "tienda.pasarela.conectar", rolesPorDefecto: ["TITULAR"], exclusivoTitular: true },
  ],
  rutasPanel: [{ ruta: "/tienda", permiso: "tienda.producto.editar", componente: PanelTienda }],
  rutasPublicas: [{ ruta: "/tienda", componente: Catalogo }, { ruta: "/tienda/[producto]", componente: Ficha }],
  navegacion: [
    { etiqueta: "Tienda", href: "/tienda", permiso: "tienda.producto.editar", orden: 30 },
    { etiqueta: "Tienda", href: "/tienda", publica: true, orden: 30 },
  ],
  eventosEmite: ["pedido.pagado"],
  eventosEscucha: [],
  dependencias: [],
};
export default tienda;
```

No hay que registrarlo en ningún lado: `scripts/descubrir-modulos.mjs` lo encuentra
solo antes de `dev`, `build`, `test` y `typecheck`.

## 2. Reglas que no se rompen

- **Nunca importes código de otro módulo.** Se hablan por eventos o por el contrato.
  Del núcleo tampoco: el registro (`@/nucleo/modulos`, salvo `contrato`), la lista generada
  ni la carga de secretos (`@/nucleo/secretos/*`). Lo verifica `tests/modulos.test.ts`.
- **Toda tabla nace con `tenantId` y su política RLS** (`deoco_aislar_tabla`, ver "Tablas").
  `tests/aislamiento.test.ts` falla si una tabla no la tiene.
- **Toda consulta de datos de banda pasa por `conTenant(tenantId, fn)`.**
- **El núcleo no se toca** para enchufar un módulo. Si hace falta, hay que extender el
  contrato, no nombrar el módulo en `src/nucleo`.

## 3. Tablas

Un módulo declara sus tablas en `modulos/<id>/esquema.prisma`. Prisma lee la carpeta
`prisma/schema/`: el núcleo está en `nucleo.prisma` y el script de descubrimiento copia
ahí el esquema de cada módulo (`prisma/schema/modulos/<id>.prisma`, generado, no se edita).
El cliente Prisma es uno solo: `tx.sitioPerfil`, `tx.sitioFecha`, etc.

Reglas (las valida `scripts/descubrir-modulos.mjs`; si no se cumplen, no arranca ni
`dev`, ni `build`, ni las pruebas):

- Modelos y enums empiezan con el id en PascalCase: `SitioPerfil`, `SitioTipografia`
  (id `press-kit` → `PressKit...`).
- Cada modelo mapea a una tabla con el prefijo del módulo: `@@map("sitio_perfil")`
  (id `press-kit` → `press_kit_...`).
- Cada modelo tiene `tenantId String @db.Uuid`, salvo las **tablas globales** (ver abajo).
- Sin `generator` ni `datasource` (son del núcleo). Solo `model` y `enum`.
- Un módulo `SOLO_DESARROLLO` no puede tener tablas.
- **Sin relaciones Prisma con tablas del núcleo ni de otros módulos.** Prisma exige
  declarar la relación de los dos lados, y el núcleo no puede nombrar modelos de
  módulos. `tenantId` es un uuid sin clave foránea: lo garantiza RLS (solo se escribe
  con el tenant activo). Las relaciones entre tablas del propio módulo, sí.
- Archivos (imágenes, PDFs): guardá solo el id del archivo (`logoArchivoId String? @db.Uuid`).

### Migraciones

Una sola carpeta, `prisma/migrations` (Prisma no admite más). Para crear la del módulo:

```sh
npm run db:migrar -- --name <id>_<descripcion> --create-only   # p. ej. sitio_esquema
```

y al final del `migration.sql`, **una línea por tabla nueva**:

```sql
SELECT deoco_aislar_tabla('sitio_perfil');
```

`deoco_aislar_tabla` (del núcleo) activa RLS, crea la política estándar por `tenantId` y
da los permisos a la app. Después: `npm run db:migrar`. `tests/aislamiento.test.ts` falla si
una tabla queda sin RLS, sin política, sin `tenantId` o sin el prefijo de un módulo.

### Tablas globales (sin banda)

Lo que es igual para todas las bandas (el catálogo base de la tienda) va en una tabla global:

- En `esquema.prisma`, el modelo lleva `/// @global` en la línea de arriba y **no** tiene `tenantId`.
- El módulo la declara en el contrato: `tablasGlobales: ["tienda_producto_base"]`.
- La migración termina en `SELECT deoco_tabla_global('tienda_producto_base');` (no `deoco_aislar_tabla`).
- Todos la leen. **Solo se escribe dentro de `conStaff()`** (`@/nucleo/acceso/staff`): verifica
  que el usuario de la sesión sea staff (si no, 404), marca la transacción y deja la fila en la
  auditoría. Fuera de eso, la base rechaza la escritura (RLS).

  ```ts
  await conStaff("tienda.producto_base_creado", async (tx, ctx) => {
    const p = await tx.tiendaProductoBase.create({ data });
    ctx.detalle({ id: p.id, nombre: p.nombre });
  });
  ```

### Pantallas del back office (`rutasAdmin`)

`rutasAdmin: [{ ruta: "/", componente }]` se monta en `app.deocoartist.com/admin/m/<id><ruta>`, solo
para staff (cualquier otro: 404). El componente recibe `{ usuarioId, params, consulta }`. Para
el menú del back office: `navegacion: [{ etiqueta, href: "/", admin: true, orden }]`. Lo que
escribe, por `conStaff()`. Ejemplo: `modulos/prueba/admin.tsx`.

Lo que el staff tiene que mirar ya (p. ej. plata que no se pudo devolver): `alertasAdmin: () =>
Promise<{ texto, href }[]>`. Sale en rojo arriba de todas las páginas de `/admin`, así que tiene
que ser rápida (un conteo con `leerComoStaff`). Si tira, el back office avisa que no se pudo leer.

### Archivos

Los bytes nunca los maneja el módulo: usa `src/nucleo/archivos`.

```ts
const { id } = await guardarArchivo(tenantId, { nombre: f.name, datos }, {
  moduloId: "sitio",
  tipos: ["jpeg", "png", "webp"],           // detectados por contenido, no por extensión
  maxBytes: 25 * 1024 * 1024,               // tope por archivo (máximo absoluto: 25 MB)
  variantes: [{ nombre: "web", ancho: 1600 }], // versiones livianas WebP (solo imágenes)
});
```

- Guardá solo el id (`...ArchivoId`). La cuota de la banda (`tenant.limiteAlmacenamiento`)
  la controla el núcleo: si se pasa, `guardarArchivo` tira `ErrorArchivo` con un mensaje
  listo para mostrar.
- URLs: `urlArchivo(ref, { variante, descargar, panelSlug })`. En el sitio público se sirven
  solo los archivos marcados con `marcarPublicos(tx, ids, true)`; en el panel
  (`panelSlug`), todos los de la banda, con sesión.
- Un SVG se sirve siempre como descarga (nunca se renderiza). Para mostrar, PNG/JPG/WebP.
- Borrar: `borrarArchivos(tx, tenantId, ids)` (los bytes se borran al confirmar la transacción).
- **Archivos de la plataforma** (no son de una banda, p. ej. la foto de un producto del
  catálogo base): `guardarArchivoPlataforma(tx, archivo, opciones)` dentro de `conStaff()`;
  siempre públicos, `urlArchivoPlataforma(ref, { variante })` (`@/nucleo/archivos/plataforma`).
- **Link firmado** para un tercero sin sesión (el archivo de impresión al proveedor):
  `await urlFirmada(suContrato, tenantId, archivoId, { validoPorSegundos })` (`@/nucleo/archivos/firmados`).
  Por defecto 7 días, máximo 30. Es de la plataforma (`app.deocoartist.com/descargas/...`), siempre
  como descarga; vencido responde 410, alterado 404. Solo firma archivos del propio módulo.

### Correo

`enviarCorreo(suContrato, tenantId, { para, asunto, html, texto, responderA? }, { tx?, unica? })`
(`@/nucleo/correo`). Sale a nombre de la banda desde la dirección de Deoco; `responderA`, el
contacto de la banda (si no lo pasás, el titular: nunca Deoco). Vuelve enseguida y se envía
después de responder. Validá direcciones con `esEmail` (la misma regla que el envío).

- Con `tx` (de `conTenant`), el correo se confirma o se pierde con el dato.
- Con `unica`, el mismo correo sale una sola vez aunque se pida de nuevo (un aviso repetido).
- Escapá lo que venga del usuario con `escaparHtml()`.
- Si falla, queda FALLIDO con el motivo; el barrido lo reintenta solo dos veces (2 y 15 min) y
  después, a mano: `reintentarCorreo(tenantId, id)`.
- `adjuntos: [{ nombre, tipo, cid?, contenido }]` (PNG, JPG, PDF o calendario; hasta 30 y 1 MB):
  con `cid`, la imagen va dentro del html como `<img src="cid:…">` (los QR de las entradas).

## 4. Permisos

Roles: el núcleo trae TITULAR, EDITOR y LECTURA. Un rol de negocio lo declara el módulo que lo
usa: `roles: [{ clave: "PUERTA", etiqueta: "Puerta", descripcion }]` (MAYÚSCULAS; el mismo nombre
en dos módulos es el mismo rol). `rolesPorDefecto` solo puede nombrar roles que existen. Un rol
de módulo no da permisos en una banda donde ninguno de sus módulos está prendido.

- Formato `<id>.recurso.accion`. Un módulo solo declara permisos con su propio prefijo.
- `rolesPorDefecto` dice qué roles lo traen. El staff de Deoco los pasa todos, salvo los
  `exclusivoTitular`.
- Si el módulo está apagado para la banda, todos sus permisos dan false.
- En páginas y acciones: `exigirPermiso(permiso, volver)`, `puedeEnPedido(permiso, volver)`
  (`src/nucleo/acceso/panel.ts`). Fuera de un pedido: `puede(usuarioId, tenantId, permiso)`.
- Formularios del panel: `edicion` en el contrato + `accionesDelPanel` (sección 5).
- Todo `"<id>.recurso.accion"` escrito en el código del módulo tiene que estar declarado en su
  contrato (`tests/modulos.test.ts` lo revisa): uno mal escrito daría false sin avisar.

### Credenciales de la banda (secretos)

Para lo que la banda le da al módulo y nadie más tiene que ver (el token de la pasarela):

```ts
// index.ts
secretos: [{ clave: "access_token", etiqueta: "Access token de Mercado Pago", ayuda: "Mercado Pago → Tus integraciones → Credenciales" }],
```

- La carga **solo el titular**, en la pantalla del núcleo `Panel → Credenciales`
  (aparece cuando un módulo prendido declara secretos). Ni otro rol ni el staff.
- Se guarda cifrada (AES-256-GCM, `DEOCO_CLAVE_SECRETOS`), atada a banda + módulo + clave.
  En pantalla solo se ve si está cargada y, si es larga, los últimos 4 caracteres.
- El módulo la lee pasando **su propio contrato** (el núcleo exige que sea el objeto
  registrado; el de otro módulo no se puede importar):

  ```ts
  import { leerSecreto } from "@/nucleo/secretos";
  import tienda from "./index";
  const token = await leerSecreto(tienda, tenantId, "access_token"); // null si no está cargada
  ```

- Nunca la loguees, la pongas en un mensaje de error ni la mandes al navegador.

## 5. Rutas y navegación

- `rutasPanel` se montan en `app.deocoartist.com/b/<slug><ruta>`. El componente recibe
  `{ tenantId, slug, acceso, params, consulta }`. El núcleo ya verificó sesión, membresía,
  módulo prendido y el `permiso` de la ruta.
- Con la banda SUSPENDIDA o ARCHIVADA el panel se cierra. Una ruta de panel puede seguir abierta
  con `conBandaCerrada: (tenantId, params) => Promise<boolean>` (exige `permiso`): la puerta de la
  ticketera la usa para que el escaneo no se corte por la cuota mientras haya un show vendido.
- `rutasPublicas` se montan en la raíz del sitio de la banda (`labanda.deocoartist.com<ruta>`).
  El componente recibe `{ tenantId, params, consulta }`. Es anónimo: no hay sesión.
- Segmentos dinámicos: `/tienda/[producto]` → `params.producto`. Las rutas fijas ganan.
- Parámetros de consulta: las dos superficies reciben `consulta` (`URLSearchParams`):
  `?estado=aprobado` → `consulta.get("estado")`; repetidos con `consulta.getAll(...)`.
- Rutas del núcleo, prohibidas: `/`, `/pago`, `/archivos`, `/dominios` y `/credenciales` en el panel;
  `/ingresar`, `/api`, `/b`, `/archivos`, `/admin`, `/avisos`, `/clave` y `/descargas` en el sitio.
- Las páginas públicas no leen sesión: es la superficie `"publico"`.
- Pantallas del panel: usá el kit `@/ui` (componentes oficiales de Untitled UI): `Tarjeta`,
  `Campo`, `AreaTexto`, `Selector`, `Casilla`, `CampoArchivo`, `Boton`, `Insignia` y
  `Formulario`. Ver "Formularios del panel".
- `marcoPublico`: el componente que envuelve TODAS las páginas públicas (cabecera,
  pestañas, identidad de la banda). Lo aporta un solo módulo (hoy `sitio`); si está
  apagado, el núcleo usa un marco neutro. Recibe `{ tenantId, pestanas, path, cabecera, children }`.
- `cabeceraPublica: { componente, orden }`: un elemento que el módulo pone en la cabecera del
  sitio, junto a las pestañas (el carrito de la tienda, orden 10). Uno por módulo; los de los
  módulos prendidos van en fila por `orden` (menor primero). El componente recibe
  `{ tenantId, path }`; el marco recibe la fila ya armada (`cabecera`).
- Título y vista previa (pestaña del navegador, al compartir en redes):
  - Cada ruta pública puede declarar `metadatos: (props) => ({ titulo, descripcion, imagen })`.
    El título queda `"<titulo> · <banda>"`.
  - `metadatosPublicos(tenantId)` (un solo módulo; hoy `sitio`) da el nombre de la banda y la
    descripción e imagen de cualquier página que no declare las suyas.
  - Sin nada de eso, el título es el nombre de la banda. Nunca "Deoco".
  - `imagen`: una URL absoluta o `urlArchivo(...)` de un archivo **público** (PNG/JPG/WebP;
    las redes no muestran SVG).
- `navegacion`: `publica: true` es una pestaña del sitio; si no, una entrada del menú del
  panel, que se oculta si el usuario no tiene `permiso`. `orden`: menor va primero.
  `href` tiene que ser una ruta declarada por el mismo módulo.

### Formularios del panel

Todo formulario de un módulo usa `<Formulario>` de `@/ui` y una server action que
**devuelve** el resultado en vez de tirar:

```ts
// index.ts (contrato): el permiso, la pantalla que se refresca y qué ve quien no puede.
// El registro lo valida al arrancar: un permiso mal escrito no arranca.
edicion: { permiso: "<id>.contenido.editar", ruta: "/<modulo>", sinPermiso: "Tu rol no puede editar esto." },
```

```tsx
// acciones.ts ("use server")
import { accionesDelPanel } from "@/nucleo/acceso/acciones";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, email, texto } from "@/ui/servidor";
import miModulo from "./index";

// Permiso → acción → refrescar la pantalla. Los errores de la lista se muestran tal cual.
// El contrato va con () =>: este archivo lo importan las pantallas, que importa index.ts.
const conEdicion = accionesDelPanel(() => miModulo, [ErrorFormulario, MiError]);

export async function guardarContacto(slug: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  return conEdicion(slug, async ({ tenantId }) => {
    const nombre = texto(fd, "nombre", 120);
    const correo = email(fd, "email");          // tira ErrorFormulario si es inválido
    await conTenant(tenantId, (tx) => /* guardar */);
    return "Guardado.";                          // opcional: si no, "Guardado." o `edicion.guardado`
  });
}

// pantalla
<Formulario accion={guardarContacto.bind(null, slug)} puedeEditar={puedeEditar}>
  <Campo name="nombre" etiqueta="Nombre" defaultValue={actual.nombre} />
</Formulario>
```

Lo que garantiza `<Formulario>`:

- **Si el servidor devuelve `{ error }`, nada de lo escrito se pierde** (React 19 vacía un
  `<form action>` al terminar cualquier acción; `Formulario` lo evita). El error se muestra
  debajo, en `role="alert"`.
- `limpiarAlGuardar`: para formularios de "agregar" (una fecha, un link): vacía los campos
  solo cuando guardar salió bien. Los de edición no lo llevan.
- `puedeEditar={false}`: todos los campos y el botón se ven deshabilitados. **El servidor
  igual tiene que verificar el permiso**: lo de la pantalla es solo la cara visible.
- Un envío antes de que React hidrate (o sin JavaScript) igual llega al servidor.
- `data-hidratado` en el `<form>`: en las pruebas de punta a punta, esperalo antes de escribir.

`@/ui/servidor` trae `texto` (normaliza los `\r\n` que manda un `<textarea>`), `obligatorio`,
`url`, `email`, `color` y `archivo`, todos con mensajes listos para mostrar.

## 6. Eventos

- Nombres `entidad.accion` en pasado: `pedido.pagado`, `entrada.validada`.
- Para emitir, declaralo en `eventosEmite` y llamá
  `emitir(nombre, tenantId, payload, usuarioId?)` (`src/nucleo/eventos/bus.ts`).
  Vuelve enseguida: los suscriptos corren después de responder al usuario.
- **Si el evento acompaña a un dato que guardás, emitilo en la misma transacción**, así
  el dato y el evento se confirman o se pierden juntos:

  ```ts
  await conTenant(tenantId, async (tx) => {
    const pedido = await tx.tiendaPedido.update({ where: { id }, data: { estado: "PAGADO" } });
    await emitir("pedido.pagado", tenantId, { pedidoId: pedido.id }, usuarioId, { tx });
  });
  ```

  Si la transacción se revierte, el evento no existe y nadie lo recibe. La entrega
  arranca recién cuando la transacción se confirma (y, en un pedido, después de responder).
- Para escuchar, `eventosEscucha: [{ evento, manejador }]`, un manejador por evento.
  Corre solo si el módulo está prendido para la banda del evento, en orden de emisión.
- Lo que el usuario ve al instante **no** depende de un evento. Un evento mueve trabajo
  de fondo.

### Los manejadores tienen que ser idempotentes

Un manejador puede recibir **el mismo evento más de una vez**: si falló y el staff lo
reprocesa (`reprocesarEvento`), se le vuelve a entregar, y puede que la primera vez haya
llegado a hacer parte del trabajo. Recibirlo dos veces tiene que dar el mismo resultado
que recibirlo una:

- Usá `evento.id` como clave: "si ya existe una orden de producción para este evento, no
  crees otra" (restricción única sobre el id del evento en tu tabla).
- Preferí "dejar en estado X" a "sumar 1".
- Un error sin atrapar marca el evento como FALLIDO para tu módulo, con el mensaje; no
  afecta a los demás suscriptos ni a quien lo emitió.

### Avisos repetidos: `emitir(..., { unica })`

Si el evento nace de algo que puede llegar dos veces (un aviso de pasarela que se reintenta),
pasale una clave de idempotencia: el mismo `nombre` + `unica` en la banda se guarda **una
sola vez**. El segundo `emitir` devuelve `{ id, repetido: true }` y no crea otro evento.

```ts
await emitir("pedido.pagado", tenantId, { pagoId }, undefined, { unica: `mp:pago:${pagoId}` });
```

Funciona también con `{ tx }`: el repetido no aborta la transacción.

## 6 bis. Avisos externos (webhooks)

Para que una pasarela avise "este pago se acreditó", el módulo declara un endpoint que no es
página:

```ts
avisos: [{ ruta: "/mercadopago", manejador: avisoMercadoPago }], // POST por defecto; `metodos: ["GET", "POST"]` si hace falta
```

- La URL es de la **plataforma**, no del host de la banda (no depende del dominio propio):
  `https://app.deocoartist.com/avisos/<tenantId>/<id del módulo><ruta>`. Armala con
  `urlAviso(tenantId, modulo, "/mercadopago")` (`@/nucleo/avisos`) y dásela a la pasarela
  (p. ej. `notification_url` al crear el cobro).
- El núcleo resuelve la banda: 404 si no existe, está archivada o tiene el módulo apagado;
  405 si el método no está declarado; 413 si el cuerpo pasa de 1 MB.
- El manejador recibe `{ tenantId, metodo, params, consulta, cabeceras, cuerpo, texto(), json() }`.
  `cuerpo` es el **crudo**, byte por byte: con eso se verifica la firma.
- **La firma la verifica el módulo** (es el que conoce la pasarela), con la credencial de la
  banda (`leerSecreto`). Sin firma válida, respondé 401 y no hagas nada.
- **Respondé rápido.** El manejador verifica, emite y vuelve; el trabajo pesado va por el bus:
  `emitir(..., { unica: <id del pago> })`.
- **Tiene que ser idempotente, como los manejadores de eventos**: la pasarela reintenta y
  puede mandar el mismo aviso varias veces. Recibirlo dos veces tiene que dar lo mismo que
  recibirlo una (para eso, `unica`).
- Devolvé `{ estado?, cuerpo? }` (por defecto 200 "ok"). Si el manejador tira un error, la
  respuesta es 500 (la pasarela reintenta) y al log va solo el mensaje, nunca el cuerpo.
- Ejemplo completo: `modulos/prueba/aviso.ts` (firma HMAC con la credencial de la banda).

## 6 bis′. Cobrar (pasarela de la banda)

Un módulo que cobra (tienda, ticketera) **no** habla con Mercado Pago ni guarda el token:
eso es del núcleo (`@/nucleo/pagos`). El dinero va directo a la cuenta de la banda.

```ts
cobros: true,
avisos: [{ ruta: "/pago/[pasarela]", metodos: ["POST", "GET"], manejador: avisoDePago }],
```

- Las credenciales las carga el titular **una vez** en Credenciales → Cobros (aparece si algún
  módulo prendido cobra). Ningún módulo las ve.
- `pasarelaLista(modulo, tenantId)`: ¿puede cobrar? (si no, no ofrezcas comprar).
- `crearCobro(modulo, tenantId, { referencia, items, extras, total, comprador, urls })` → adónde
  mandar al comprador. `referencia` es tu id (pedido, compra): vuelve en el cobro consultado.
- En el aviso: `const r = await cobroDelAviso(modulo, aviso)`. Si trae `respuesta`, devolvela;
  si trae `cobro`, es lo que dijo la **API** de la pasarela (nunca el cuerpo del aviso).
  Registralo con `registrarCobro(modulo, tenantId, r.pasarela, r.cobro, tuCosa)`
  (`@/nucleo/pagos/registro`): la regla es del núcleo (referencia de esta banda, monto y moneda,
  EN_REVISION, pago duplicado, pagado una sola vez, evento con clave única). Vos das `tuCosa`
  (`CosaACobrar`): cómo buscarla, pasarla a revisión, marcarla pagada **con un cambio
  condicional**, qué hacer al cobrarse y qué evento emitir. No escribas tu propia versión.
- Pagos duplicados: los guarda el núcleo (`cobro_duplicado`). Para mostrarlos en tu panel:
  `cobrosDuplicados(modulo, tenantId, referencias)`.
- `probarConexion(modulo, tenantId)`: a nombre de quién cobra (para que el titular confirme).
- Ejemplos: `modulos/tienda/pagos.ts` + `aviso.ts`, `modulos/ticketera/compras.ts` + `aviso.ts`.
- Montos: centavos (Int). `formatearPesos`, `leerPesos`, `pesosParaCampo` de `@/nucleo/dinero`;
  fechas en hora argentina, `@/nucleo/fechas`.
- Cupos (entradas, stock): un contador en la fila con `CHECK (ocupadas <= cupo)` y la fila
  bloqueada (`SELECT … FOR UPDATE`) al reservar; ver `modulos/ticketera/compras.ts`.

## 6 bis″. Lo común del sitio público

- Links absolutos al sitio de la banda (mails, vista previa): `origenDeBanda(tenantId, { tx? })`;
  la vuelta de la pasarela, `origenDelPedido()` (`@/nucleo/publico/origen`). No armes la URL a mano.
- Clases que toman el estilo de la banda (variables del marco): `c` de `@/nucleo/publico/estilo`.
- Página que espera un pago: `<Refrescar />` de `@/nucleo/publico/refrescar`.

## 6 ter. Consultas a otros módulos

Un módulo nunca importa código de otro. Cuando uno necesita **leer** datos de otro (el sitio
muestra las fechas de la ticketera), el que tiene los datos **ofrece una consulta** y el otro
la **pide por id**.

El que responde la declara en su contrato:

```ts
// modulos/ticketera/index.ts
consultas: [
  {
    nombre: "proximas-fechas", // se pide como "ticketera.proximas-fechas"
    // Responde: [{ id, nombre, fecha (ISO), lugar, ciudad, url }] — publicadas y por venir.
    responder: async (tenantId, params) => proximasFechas(tenantId, Number(params.limite) || 20),
  },
],
```

El que pregunta la pide con `consultar` (`@/nucleo/consultas`):

```ts
const fechas = await consultar(tenantId, "ticketera.proximas-fechas", { limite: 10 }, {
  vacio: [], // lo que recibe si no hay respuesta
  interpretar: (r) => validarFechas(r), // valida la forma; si tira, recibe `vacio`
});
```

- **Nunca rompe a quien pregunta.** Si el módulo que responde está **apagado** para la banda,
  no está en este build, tira un error o tarda más de 3 s (`esperaMs`), vuelve `vacio`. Así
  el que pregunta puede tener su propio plan B (el sitio muestra las fechas cargadas a mano).
- **La respuesta es JSON** (las fechas, como texto ISO) y llega copiada. Su forma es el
  contrato público del módulo que responde: documentala en un comentario junto a la
  declaración y no la cambies sin revisar a quién la usa (`grep "<id>.<nombre>"`).
- **Quien pregunta valida** con `interpretar`: no confía en la forma. Si no coincide, recibe
  `vacio` (y queda en el log).
- `responder` corre con la banda que pregunta y lee con `conTenant` como cualquier código del
  módulo: RLS sigue aislando. Solo lectura y rápida: para avisar que algo pasó, eventos.
- Nombres: minúsculas, números y guiones. El registro rechaza nombres inválidos o repetidos.

### Bloque en el inicio del panel

Una consulta llamada `inicio` pone un bloque en `/b/<slug>`:
`{ titulo, datos: [{ etiqueta, valor }], pendientes: [{ texto, href? }] }` (textos ya
formateados, hasta 8 de cada uno; `href` relativo al panel, p. ej. `"/tienda/pedidos"`).
Devolver `null` = sin bloque. Lo ve quien puede ver alguna entrada del menú del módulo. Sin
gráficos: lo que la banda tiene que saber o hacer hoy.

## 6 quater. Cuentas externas (portal)

Para gente que no es de una banda pero trabaja con el módulo (el proveedor de la tienda), el
módulo declara un **portal** en `app.<raiz>/portal/<id>`:

```ts
cuentasExternas: { etiqueta: "Panel de proveedor" },
rutasExternas: [{ ruta: "/", componente: PortalOrdenes }, { ruta: "/ordenes/[id]", componente: PortalOrden }],
navegacion: [{ etiqueta: "Órdenes", href: "/", externa: true, orden: 10 }],
```

- La cuenta la da el **staff** desde una pantalla del módulo en el back office:
  `crearCuentaExterna(tx de conStaff, modulo, { referencia, email, nombre, creadoPor })`
  (`@/nucleo/acceso/externas`). Usuario nuevo → clave temporal (se cambia al entrar).
  `referencia` es lo que el módulo vincula (el id del proveedor); el núcleo no sabe qué es.
- La persona entra por `app.<raiz>/ingresar`; si no tiene bandas, cae en su portal. No tiene
  membresía: nunca ve un panel de banda. Sin cuenta en ese módulo (o en un host de banda), 404.
- La página recibe `{ usuarioId, referencia, params, consulta }`. Para **leer** datos de
  varias bandas: `conCuentaExterna(usuarioId, modulo, (tx, referencia) => …)`. La transacción
  no tiene banda: solo se ven las filas que el módulo habilita con políticas de **solo lectura**
  en su migración:

  ```sql
  CREATE POLICY proveedor_lee ON "tienda_orden" FOR SELECT
    USING ("proveedorId"::text = app_referencia_externa('tienda'));
  ```

- Para **escribir** (despachar, saldar): `conCuentaExternaEnBanda(usuarioId, modulo, tenantId, fn)`.
  No abre la banda: solo llega a lo que tu migración habilita para ese contexto:
  - `CREATE POLICY … FOR UPDATE USING ("<ref>"::text = app_referencia_externa('<id>') AND "tenantId" = app_externo_tenant())`.
  - Un disparador BEFORE UPDATE que deja cambiar solo las columnas que correspondan.
  - `<id>_externo_banda(uuid)`: ¿tiene algo suyo en esa banda? Si no, no entra.
  - `<id>_externo_archivo(uuid)`: ¿qué archivos puede firmar con `urlFirmada(..., { tx })`?
  - Emitir eventos y auditar (con `createMany`) a su nombre ya lo deja el núcleo.
  Ejemplo: la migración `tienda_proveedor_escribe_en_la_base`. Nunca uses `conTenant` para la
  cuenta externa: le abre la banda entera.
- Elegí las columnas a mano: RLS filtra filas, no columnas (el proveedor no ve montos de venta).
- Quiénes entran al portal (back office): `cuentasDeReferencia(tx, modulo, referencia)` con la
  `tx` de `leerComoStaff` (o de `conStaff`). Ejemplo: `accesosDeProveedor` en la tienda.
- Personas: un módulo nunca lee ni escribe `usuario` (RLS no lo deja; `tests/modulos.test.ts`
  lo marca antes). Para el contacto de la banda: `titularDeBanda(tx)` de `@/nucleo/personas`.
- Ejemplo completo: `modulos/tienda/proveedor.ts` y `modulos/tienda/portal/`.

## 6 quinquies. Límites de la cuenta

Si el módulo tiene algo que un plan puede acotar (productos publicados, shows publicados),
lo declara y lo hace cumplir; el número lo pone el gestor de cuenta (el plan):

```ts
limites: [{
  clave: "productos-publicados",          // id completo: "tienda.productos-publicados"
  etiqueta: "productos publicados",       // va en el mensaje: "Llegaste al máximo de …"
  usados: (tenantId) => contar(tenantId),
  // El tope bajó (la banda bajó de plan): despublicar lo que sobra, lo último publicado
  // primero, SIN BORRAR. Devuelve cuántos despublicó.
  ajustar: (tenantId, maximo) => despublicarSobrante(tenantId, maximo),
}],
```

Y antes de publicar, dentro de la misma transacción de `conTenant`:

```ts
await exigirLimite(tx, contrato, tenantId, "productos-publicados", async () => (await contarEn(tx)) + 1);
```

Sin tope fijado (banda sin plan), no hace nada. Pasado el tope lanza `ErrorLimite` con un
mensaje para mostrar tal cual (dice el máximo y qué plan lo amplía): sumala a los errores de
`accionesDelPanel`. Dos pedidos a la vez no pasan el tope (bloqueo por banda + límite).

### El gestor de cuenta (`gestionaCuenta`, uno solo: hoy `comercial`)

Decide el estado automático de la banda, sus módulos y sus topes con las funciones de
`@/nucleo/cuenta` (`fijarEstado`, `fijarModulos`, `fijarLimites`, `bandaCreada`,
`catalogoDeCuenta`); el núcleo verifica que quien llama sea el gestor y nunca archiva solo.
Aporta `alCrearBanda`, la pantalla de `/b/<slug>/pago` y `comoAmpliar` (la línea del mensaje de
límite). Solo él puede declarar `avisosPlataforma` (webhooks sin banda,
`app.<raiz>/avisos/plataforma/<id><ruta>`) y usar la cuenta de cobro de Deoco
(`@/nucleo/pagos/cuota`, credenciales del entorno). Cualquier módulo puede declarar
`tareasPeriodicas: [{ nombre, cadaSegundos, correr(ahora) }]`: las corre el barrido (producción).

## 7. Encendido

- Un módulo nace apagado. Lo prende o apaga el staff (`prenderModulo`, `apagarModulo`
  en `src/nucleo/modulos/encendido.ts`) o, según el plan de la banda, el gestor de cuenta
  (`fijarModulos`).
- `dependencias`: no se puede prender si falta alguna; no se puede apagar uno que otro
  prendido usa.
- Un archivo `SOLO_DESARROLLO.md` en la carpeta deja el módulo afuera del build de
  producción (como `modulos/prueba`), con cualquier comando de build: lo aplica
  `next.config.ts`.
