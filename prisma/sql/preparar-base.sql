-- Preparar el servidor Postgres para Deoco. Correr UNA vez, como superusuario
-- (en Easypanel: el usuario del servicio Postgres), conectado a la base "postgres":
--
--   psql "$URL_SUPERUSUARIO" -v clave_duena="'...'" -v clave_app="'...'" -v clave_admin="'...'" \
--     -f prisma/sql/preparar-base.sql
--
-- Crea:
--   deoco_owner  dueño de la base y de las tablas: SOLO corre migraciones.
--   deoco_app    con el que se conecta la aplicación: sin BYPASSRLS, no es dueño de nada.
--   deoco_admin  el back office (/admin): BYPASSRLS, ve todas las bandas. Solo desde /admin.
--   deoco        la base.
CREATE ROLE deoco_owner LOGIN PASSWORD :clave_duena NOSUPERUSER NOCREATEROLE;
CREATE ROLE deoco_app LOGIN PASSWORD :clave_app
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE deoco_admin LOGIN PASSWORD :clave_admin
  NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE deoco OWNER deoco_owner;
