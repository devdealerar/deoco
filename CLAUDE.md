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
- Cualquier otro host (`labanda.deoco.com`, dominio propio) → sitio público, tenant por host. Anónimo.
- `/b/<slug>/pago` lo define el núcleo: abierto con la banda suspendida, solo para el titular.
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
- Staff sin membresía: pasa por `registrarAccesoStaff()` (hoy no persiste).

## Módulos

Guía para escribir uno: `docs/guia-modulos.md`.

- Cada módulo es `modulos/<id>/index.ts` con `export default` un objeto `Modulo`
  (`src/nucleo/modulos/contrato.ts`). Ejemplo completo: `modulos/prueba/`.
- Descubrimiento: `scripts/descubrir-modulos.mjs` genera `src/generated/modulos.ts`
  (imports estáticos, no versionado). Corre solo antes de dev/build/test/typecheck.
  El núcleo nunca nombra un módulo (lo verifica `tests/modulos.test.ts`).
- El registro (`src/nucleo/modulos/registro.ts`) valida el contrato al arrancar: ids, permisos
  `<id>.recurso.accion`, rutas sin choques ni rutas del núcleo (`/`, `/pago` en el panel;
  `/ingresar`, `/api`, `/b` en el sitio), navegación que apunta a rutas propias.
- Rutas: las de panel se montan en `/b/<slug>/<ruta>`, las públicas en la raíz del host de
  la banda. Admiten segmentos `[param]`. Módulo apagado → 404.
- Encendido: fila en `moduloTenant`. `prenderModulo()` / `apagarModulo()` son del staff;
  validan dependencias (no se prende sin ellas, no se apaga una que otro prendido usa).
- `SOLO_DESARROLLO.md` en la carpeta de un módulo lo excluye de `npm run build` (producción).
- Navegación: menú del panel = entradas de módulos prendidos filtradas por permiso; pestañas
  públicas = entradas `publica: true` de módulos prendidos. Ordena `orden` (menor primero).
- Un módulo nunca importa código de otro. Sus tablas nacen con `tenantId` + RLS
  (`tests/aislamiento.test.ts` falla si una tabla no tiene RLS y política).

## Bus de eventos

- `emitir(nombre, tenantId, payload, usuarioId?)` (`src/nucleo/eventos/bus.ts`): guarda la fila
  en `evento` (PENDIENTE) y vuelve. La entrega se programa con `after()` de Next (después de
  responder); fuera de un pedido, en segundo plano.
- Nombres `entidad.accion` en participio, declarados en `eventosEmite` de algún módulo.
- Una cola por banda, por `secuencia`: orden de emisión. Módulo apagado no recibe.
- Un suscripto que falla queda en `evento.fallos`; el evento termina FALLIDO.
  `reprocesarEvento()` reentrega solo a los que fallaron. Manejadores idempotentes.

## Comandos

- `npm test` — pruebas, contra la base de `.env.test` (ver `.env.test.example`)
- `npm run test:e2e` — punta a punta: levanta `next dev` en :3200 sobre la base de pruebas
  y navega con Chromium (`/opt/pw-browsers/chromium`, o la ruta en `CHROMIUM`)
- `npm run typecheck` · `npm run lint`
- `npx prisma migrate dev` — migraciones (rol dueño)

## Base local

```sh
psql -c "CREATE ROLE deoco_owner LOGIN PASSWORD 'owner' CREATEDB"
psql -c "CREATE DATABASE deoco OWNER deoco_owner"
psql -d deoco -v clave="'app'" -f prisma/sql/crear-rol-app.sql
npx prisma migrate dev
npm run db:semilla            # banda-a.lvh.me y banda-b.lvh.me

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
