-- Rol con el que se conecta la aplicación. Correr UNA vez por servidor,
-- con un usuario administrador, ANTES de aplicar las migraciones.
--
--   psql "$URL_ADMIN" -v clave="'...'" -f prisma/sql/crear-rol-app.sql
--
-- NOSUPERUSER + NOBYPASSRLS: este rol no puede saltear RLS bajo ningún concepto.
-- Tampoco es dueño de ninguna tabla (el dueño las saltea), así que el aislamiento
-- lo impone siempre la base.
CREATE ROLE deoco_app LOGIN PASSWORD :clave
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
