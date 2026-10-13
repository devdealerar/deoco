# Tareas · Paso 1 · Núcleo

Fuente: `docs/spec/00-especificacion-nucleo.md`. Una parte por vez; cada una se
revisa y aprueba antes de pasar a la siguiente.

| # | Parte | Estado |
| --- | --- | --- |
| 1 | Esquema Prisma + migraciones con RLS + `conTenant()` | ✅ hecha, en revisión |
| 2 | Middleware de tenant por dominio (+ Auth.js: sesión solo con el usuario) | ⏳ |
| 3 | Permisos: `puede(usuario, tenant, permiso)` | ⏳ |
| 4 | Registro de módulos (contrato, descubrimiento, navegación, 404 si está apagado) | ⏳ |
| 5 | Bus de eventos: `emitir()` + suscriptos | ⏳ |

## Pruebas de aceptación del paso

- [x] 1. Dos tenants: una consulta con el tenant A jamás devuelve filas del B — `tests/aislamiento.test.ts`
- [x] 2. Una consulta SIN filtro de tenant no filtra datos (RLS) — `tests/aislamiento.test.ts`
- [ ] 3. Usuario en dos bandas con rol distinto; `puede()` lo refleja
- [ ] 4. Módulo de prueba aparece en la navegación; apagado devuelve 404
- [ ] 5. Evento emitido queda en la tabla y dispara a su suscripto

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

- Valores de `tenant.estado`: se dejó `ACTIVO | SUSPENDIDO` provisorio. ¿Cuáles son?
