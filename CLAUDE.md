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

## Comandos

- `npm test` — pruebas (requieren Postgres con `.env`, ver `.env.example`)
- `npm run typecheck` · `npm run lint`
- `npx prisma migrate dev` — migraciones (rol dueño)

## Base local

```sh
psql -c "CREATE ROLE deoco_owner LOGIN PASSWORD 'owner' CREATEDB"
psql -c "CREATE DATABASE deoco OWNER deoco_owner"
psql -d deoco -v clave="'app'" -f prisma/sql/crear-rol-app.sql
npx prisma migrate dev
```
