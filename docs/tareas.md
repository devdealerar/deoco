# Tareas · Paso 1 · Núcleo

Fuente: `docs/spec/00-especificacion-nucleo.md`. Una parte por vez; cada una se
revisa y aprueba antes de pasar a la siguiente.

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Esquema Prisma + migraciones con RLS + `conTenant()` | ✅ aprobada |
| 2a | Estados del tenant + proxy de resolución por dominio | ✅ hecha, en revisión |
| 2b | Auth.js (sesión solo con el usuario) + rol por pedido + `puede()` + staff | ⏳ |
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
- [ ] 2. Usuario logueado sin membresía en el tenant del host → 403
- [ ] 3. Mismo usuario, dos bandas, dos roles: `puede()` distinto en cada host
- [ ] 4. La sesión no contiene el tenant: cambiar de host cambia el contexto sin re-login
- [x] 5. `SUSPENDIDO`: panel 403, sitio 200. `ARCHIVADO`: ambos 404 — `tests/proxy.test.ts`
- [ ] 6. Staff entra a cualquier tenant pero no pasa el permiso de pasarela

## Decisiones tomadas en la parte 2a

- El panel de una banda vive en su propio host bajo `/panel`; `app.<raiz>` no tiene tenant.
- El tenant viaja en cabeceras `x-deoco-*`; el proxy borra las que vengan de afuera.
- Rutas de pago con tenant suspendido: `/panel/pago/...`, marcadas `soloTitular`
  (el chequeo del rol titular se hace en 2b, con la sesión).
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

- ¿Las rutas de pago las fija el núcleo (`/panel/pago`) o las declara un módulo?
- Dominio propio (`labanda.com`): la cookie de sesión de `.deoco.com` no viaja ahí.
  ¿Login aparte en ese dominio, o el panel solo se usa por el subdominio?
