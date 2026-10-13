-- Rol del BACK OFFICE de Deoco (app.deoco.com/admin). Correr UNA vez por servidor, con un
-- administrador, ANTES de aplicar las migraciones (la migración *_admin_auditoria le da permisos):
--
--   psql "$URL_ADMIN_POSTGRES" -v clave="'...'" -f prisma/sql/crear-rol-admin.sql
--
-- BYPASSRLS: ve y escribe datos de TODAS las bandas. No es superusuario ni dueño de tablas
-- (no puede cambiar el esquema). La app solo lo usa desde src/app/admin (DATABASE_URL_ADMIN),
-- y tests/admin.test.ts falla si otro código importa esa conexión.
CREATE ROLE deoco_admin LOGIN PASSWORD :clave
  NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
