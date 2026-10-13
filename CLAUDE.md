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

- `src/proxy.ts` (Next 16 renombró `middleware` → `proxy`; corre en Node) resuelve el
  tenant por host y aplica las reglas de estado (`src/nucleo/tenant/reglas.ts`).
- `app.<DEOCO_DOMINIO_RAIZ>` es la plataforma: sin tenant. Cualquier otro host se busca en `dominio`.
- En el host de una banda, `/panel/...` es su panel; el resto es el sitio público.
- El tenant viaja en cabeceras `x-deoco-*` del pedido; se lee con `tenantDelPedido()`.

## Comandos

- `npm test` — pruebas, contra la base de `.env.test` (ver `.env.test.example`)
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
Se eligió sobre `*.localhost` porque permite una cookie de sesión compartida
(`.lvh.me`) entre la plataforma y las bandas, igual que `.deoco.com` en producción.

- Plataforma: http://app.lvh.me:3000
- Bandas: http://banda-a.lvh.me:3000 · http://banda-b.lvh.me:3000 (panel en `/panel`)
- Sin internet (lvh.me necesita DNS): `curl -H "Host: banda-a.lvh.me" http://127.0.0.1:3000/`
