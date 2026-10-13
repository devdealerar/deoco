# Tareas · Paso 1 · Núcleo

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
- **Emitir dentro de la transacción de quien emite** (outbox): hoy `emitir` usa su propia
  transacción; si el proceso cae entre "guardé el pedido" y "emití", el evento se pierde.
- **Accesos del staff**: `registrarAccesoStaff()` no persiste. Tampoco hay registro de
  quién cambia la pasarela (spec); llega con el módulo que tenga la pasarela.
- **Una sola instancia**: el bus y el orden por banda viven en memoria del proceso.
- **Dominio propio**: verificación DNS y certificados (infra Easypanel) no están en el paso 1.

## Preguntas abiertas

- (ninguna)
