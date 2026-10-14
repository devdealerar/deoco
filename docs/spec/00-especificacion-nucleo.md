# Deoco · Especificación del núcleo

Oct 12, 2026 · @Deoco

## Alcance y regla de oro

El núcleo no sabe qué módulos existen. Expone contratos y los módulos se registran contra ellos; un módulo nuevo se enchufa sin tocar una línea del núcleo.

En el núcleo viven cinco cosas, y nada más:

1. Identidad y sesión
2. Tenant y aislamiento
3. Roles y permisos
4. Registro de módulos
5. Bus de eventos

Lo que el núcleo **no** hace: no conoce bandas, merch, entradas ni proveedores. No conoce planes comerciales. No tiene lógica de negocio de ningún módulo.

Los planes son empaquetado, no arquitectura. El código no conoce «Esencial» ni «Pro»: conoce módulos encendidos o apagados por tenant. Cambiar un plan es cambiar una lista, no tocar código.

Regla de negocio que condiciona todo el diseño: el dinero de las ventas nunca pasa por Deoco. El fan le paga a la banda en la pasarela de la banda. El ingreso de Deoco es la cuota mensual.

## Stack

Monolito modular: un solo proyecto para desplegar, con núcleo y módulos adentro. Se separa en servicios recién el día que un módulo lo pida, sin rehacer nada.

| Capa | Elección | Por qué |
| --- | --- | --- |
| Framework | Next.js (App Router) | React con servidor en el mismo proyecto; una sola cosa que mantener |
| Lenguaje | TypeScript | Un solo lenguaje de punta a punta |
| UI | React + Tailwind CSS | Pedido del proyecto |
| Componentes | Untitled UI | Hecho para React + Tailwind; encaja directo |
| Base de datos | PostgreSQL | Ya disponible en el VPS con Easypanel |
| Acceso a datos | Prisma | Esquema único, tipos automáticos; Claude Code rinde mejor con esto |
| Aislamiento | Row Level Security de Postgres | La base impone la separación, no el código |
| Autenticación | Auth.js | Usuarios en la misma base |
| Despliegue | VPS Hostinger + Easypanel | Infraestructura ya existente |

El plan pro de Untitled UI se compra cuando un módulo necesite componentes que no estén en la versión gratuita. No hace falta para el tramo 1.

## Identidad y sesión

Una persona es un usuario único en toda la plataforma, y puede pertenecer a varias bandas con un rol distinto en cada una. La identidad es global; el rol es por tenant.

Tres tablas en el núcleo:

- `usuario` — la persona: email, nombre, credenciales.
- `tenant` — la banda.
- `membresia` — une usuario y tenant, y guarda el rol. Una fila por cada banda a la que pertenece una persona.

El back office de Deoco no es una membresía: es una marca en el usuario (`esStaff`) que lo habilita por encima de todos los tenants.

Entrada: email y contraseña al arrancar, con la puerta abierta a Google después. La sesión guarda quién es el usuario, nunca qué banda está viendo — eso lo resuelve el dominio en cada pedido.

Un usuario con varias bandas no elige banda en un menú: entra por el dominio de la banda que quiere.

## Tenant y aislamiento

Decisión: **base única con columna de tenant, protegida por Row Level Security de Postgres.** No una base por banda ni un esquema por banda.

Por qué: una base por banda hace imposible migrar 500 bandas a la vez y multiplica el costo. Con RLS, la separación la impone el motor de la base, no el código. Si alguien se olvida de filtrar en una consulta, la base igual devuelve solo lo del tenant activo. Es la única forma en que un olvido no se convierte en una filtración entre bandas.

Cómo funciona, en tres pasos por cada pedido:

1. Llega un pedido a un dominio. El middleware resuelve qué tenant es, buscando ese dominio en la tabla `dominio`.
2. Antes de tocar la base, se fija la variable de sesión de Postgres `app.tenant_id` con ese valor.
3. Toda tabla con datos de banda lleva la columna `tenantId` y una política RLS que la compara contra esa variable. La base devuelve solo lo que corresponde.

Reglas que no se negocian:

- Ninguna consulta de la aplicación usa el superusuario de Postgres. La app se conecta con un rol que **no** puede saltear RLS.
- Toda tabla nueva de cualquier módulo nace con `tenantId` y su política. Sin eso, no se mergea.
- El back office de Deoco usa una conexión aparte, con un rol distinto que sí ve todo, y solo para las pantallas de administración.

## Roles y permisos

Cinco roles dentro de cada banda, más el staff de Deoco por encima de todos los tenants.

El núcleo no define permisos de negocio: define el mecanismo. Cada módulo declara sus propios permisos al registrarse, con la forma `modulo.recurso.accion` (por ejemplo `tienda.producto.editar`). El núcleo solo responde una pregunta: ¿este usuario, en este tenant, tiene este permiso?

| Rol | Qué hace | Lo que nunca toca |
| --- | --- | --- |
| Titular | Todo: configura, paga, invita, conecta la pasarela | — |
| Editor de contenido | Carga y edita sitio, press kit y fichas de merch | Plata, configuración, usuarios |
| Responsable comercial | Ventas, precios, tienda, entradas | Configuración de la cuenta, usuarios |
| Puerta | Valida entradas el día del show | Todo lo demás |
| Solo lectura | Mira todo | No modifica nada |
| Staff Deoco | Alta de bandas, soporte, administración | La pasarela de cobro de una banda |

> Implementación (trabajo largo P4): Titular, Editor y Solo lectura son del núcleo. Responsable
> comercial (`COMERCIAL`) y Puerta (`PUERTA`) los declaran los módulos que los usan (tienda y
> ticketera; ticketera) con `roles` en su contrato. Un rol de módulo no da permisos en una banda
> que no tiene prendido ninguno de sus módulos.

Dos actores que no son usuarios de gestión y no entran al panel: el **fan**, que compra, y el **proveedor**, que produce y envía el merch. Cada uno tendrá su propio acceso acotado cuando lleguen esos módulos.

Regla: la conexión de la pasarela de cobro la toca solo el titular. Ni el staff de Deoco puede, y queda registrado quién la cambió.

## Registro de módulos

Cada módulo vive en su propia carpeta (`modulos/tienda`, `modulos/ticketera`) y exporta un solo objeto que lo describe. El núcleo los descubre al arrancar y no sabe nada más de ellos.

El contrato que cada módulo declara:

- `id` y nombre visible.
- `permisos` — la lista de permisos que define, con qué roles los traen por defecto.
- `rutas` — qué pantallas aporta al panel y al sitio público.
- `navegacion` — dónde aparece en el menú, y con qué permiso se ve.
- `eventos` — qué eventos emite y a cuáles se suscribe.
- `migraciones` — sus propias tablas, siempre con `tenantId` y su política RLS.
- `dependencias` — qué otros módulos necesita encendidos.

Encendido y apagado: una tabla `moduloTenant` dice qué módulos tiene prendidos cada banda. Si un módulo está apagado, sus rutas devuelven 404 y su entrada de menú no existe. Los planes comerciales son nada más que listas de módulos a prender.

Regla de dependencias: un módulo puede depender de otro, pero nunca importar su código directamente. Se hablan por eventos o por el contrato que el otro expone. Así se puede apagar o reemplazar uno sin romper el resto.

## Bus de eventos

Los módulos no se llaman entre sí: emiten eventos y escuchan los de otros. Es lo que permite agregar un módulo nuevo que reaccione a algo existente sin tocar el módulo que lo emitió.

Todo evento lleva nombre en pasado (`pedido.pagado`, `entrada.validada`), el `tenantId`, quién lo disparó, la fecha y su carga de datos.

Ejemplo concreto de por qué sirve: cuando el módulo de tienda emite `pedido.pagado`, el módulo de proveedor lo escucha y genera la orden de producción. El día que sumes un módulo de avisos por mail, se suscribe al mismo evento y manda la confirmación. La tienda nunca se entera de que existen esos dos módulos.

Arranque simple, a propósito: los eventos se procesan en el mismo proceso, y se guardan en una tabla `evento` del núcleo. Esa tabla es la bitácora de todo lo que pasó, y es lo que permite reprocesar algo que falló. El día que haga falta, se cambia por una cola de verdad sin tocar quien emite ni quien escucha.

Regla: lo que el fan ve al instante no depende de un evento. Un evento mueve trabajo de fondo, nunca la respuesta que el usuario está esperando.

## Dominios

Decisión: **la banda se identifica por el dominio desde el día uno.** Es lo que permite que después ponga su dominio propio sin rehacer nada.

Una tabla `dominio` del núcleo: cada fila es un dominio, apunta a un tenant, y marca cuál es el principal. Una banda puede tener varios; siempre tiene al menos el subdominio.

Tres etapas, sin migración entre ellas:

1. **Al dar de alta** — la banda recibe `labanda.deoco.com`, que funciona al instante.
2. **Dominio propio** — en su panel escribe `labanda.com`. Deoco le muestra el registro DNS exacto para copiar, ella lo pega donde compró el dominio, y la plataforma verifica sola cuando ya apunta.
3. **Certificado** — se emite automático al verificar, y se renueva solo. La banda no hace nada.

El subdominio nunca se da de baja: queda como respaldo, y redirige al dominio principal.

Pendiente de infraestructura: la emisión automática de certificados para dominios de terceros se resuelve en Easypanel con Let's Encrypt. Hay que confirmar el límite de dominios por proyecto antes de pasar las primeras diez bandas con dominio propio.

El panel de gestión vive en `app.deoco.com`, separado del sitio público. Mismo código, distinto punto de entrada.

## Sitio público de la banda

Cuatro pestañas, siempre las mismas. La home es una síntesis corta de todo el ecosistema de la banda; las otras tres son el detalle.

| Pestaña | Qué tiene | Módulo que la aporta |
| --- | --- | --- |
| Home | Logo e identidad, slider de imágenes, próximas fechas, bio corta, redes y escucha | Sitio |
| Press kit | Bio larga, fotos en alta, rider, logos descargables, contacto de prensa | Sitio |
| Tienda | Catálogo de merch y compra | Tienda |
| Ticketera | Fechas con venta de entradas | Ticketera |

La home es corta a propósito: no repite el contenido de las otras pestañas, lo resume y linkea. Las fechas que muestra salen del módulo de ticketera cuando está prendido; si está apagado, la banda las carga a mano como texto.

La navegación la arma el núcleo, no el módulo de sitio: cada módulo declara su pestaña al registrarse, y el menú muestra solo las de los módulos prendidos para esa banda. Una banda en el plan más barato ve dos pestañas; una con todo prendido ve cuatro. Mismo código.

Identidad visual: cada banda carga su logo, su paleta y su tipografía. El sitio se arma con eso; no hay plantillas distintas por banda en el tramo 1.

## Tramo 1 de construcción

Decisión: se construye el núcleo, el panel mínimo y el sitio público con home y press kit. Tienda y ticketera quedan declaradas en la navegación pero apagadas.

&#91;embedded content: orden de construcción · 3 pasos, 2 módulos apagados\]

Por qué este corte y no otro: es el tramo más chico que deja una banda real operando en su sitio, y obliga a que el contrato de módulos funcione de verdad desde el día uno. Si el sitio se enchufa bien al núcleo, la tienda y la ticketera después entran igual, sin discusión.

Criterio de terminado del tramo 1:

- [ ] Una banda se da de alta y entra a su panel
- [ ] El titular invita a un editor y el editor solo ve lo que le toca
- [ ] Dos bandas distintas conviven sin verse datos entre sí
- [ ] La home y el press kit se cargan desde el panel y se publican
- [ ] El sitio se ve en `labanda.deoco.com` con la identidad de la banda
- [ ] Las pestañas de tienda y ticketera no aparecen, porque están apagadas

Revisión del tramo: Nov 10, 2026
