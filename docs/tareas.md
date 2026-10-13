# Tareas · Paso 1 · Núcleo

Fuente: `docs/spec/00-especificacion-nucleo.md`. Una parte por vez; cada una se
revisa y aprueba antes de pasar a la siguiente.

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Esquema Prisma + migraciones con RLS + `conTenant()` | ✅ aprobada |
| 2a | Estados del tenant + proxy de resolución por dominio | ✅ aprobada |
| 2a′ | Corrección: panel en `app.<raiz>/b/<slug>`, proxy con dos caminos | ✅ aprobada |
| 2c | Auth.js + membresía y rol por pedido + `puede()` + staff + solo titular | ✅ hecha, en revisión |
| 4 | Registro de módulos (contrato, descubrimiento, navegación, 404 si está apagado) | ⏳ |
| 5 | Bus de eventos: `emitir()` + suscriptos | ⏳ |

## Pruebas de aceptación del paso

- [x] 1. Dos tenants: una consulta con el tenant A jamás devuelve filas del B — `tests/aislamiento.test.ts`
- [x] 2. Una consulta SIN filtro de tenant no filtra datos (RLS) — `tests/aislamiento.test.ts`
- [ ] 3. Usuario en dos bandas con rol distinto; `puede()` lo refleja
- [ ] 4. Módulo de prueba aparece en la navegación; apagado devuelve 404
- [ ] 5. Evento emitido queda en la tabla y dispara a su suscripto

### Pruebas de la parte 2

- [x] 1. Host de la banda A → tenant A; host inexistente → 404 — `tests/proxy.test.ts`
- [x] 2. Usuario sin membresía en esa banda (`/b/<slug>`) → 403 — `tests/e2e/panel.e2e.ts`, `tests/permisos.test.ts`
- [x] 3. Mismo usuario, dos bandas, dos roles: `puede()` distinto en cada una — `tests/permisos.test.ts`
- [x] 4. Cambiar de `/b/banda-a` a `/b/banda-b` no pide re-login y cambia rol — `tests/e2e/panel.e2e.ts`
- [x] 5. `SUSPENDIDO`: panel 403, sitio 200. `ARCHIVADO`: ambos 404, por host y por slug — `tests/proxy.test.ts`
- [x] 6. Staff entra a cualquier banda pero no pasa el permiso de pasarela — ambos archivos
- [x] 7. Banda `SUSPENDIDO`: titular entra a `/pago`; `EDITOR` (y staff) 403 — `tests/e2e/panel.e2e.ts`
- [x] 8. La cookie de sesión no se manda a `banda-a.lvh.me` — `tests/e2e/panel.e2e.ts`

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

## Preguntas abiertas

- (ninguna por ahora)
