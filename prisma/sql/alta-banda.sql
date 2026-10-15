-- Alta manual de una banda y su titular, mientras no exista el back office.
-- Correr con el rol DUEÑO (DATABASE_URL_MIGRACIONES), que no está sujeto a RLS:
--
--   psql "$DATABASE_URL_MIGRACIONES" \
--     -v email="'titular@labanda.com'" -v nombre="'Nombre Apellido'" -v hash="'<hash argon2>'" \
--     -v banda="'La Banda'" -v slug="'labanda'" -v dominio="'labanda.deocoartist.com'" \
--     -v staff=false -f prisma/sql/alta-banda.sql
--
-- El hash se genera en el contenedor (nunca guardes la clave en claro):
--   node -e "require('@node-rs/argon2').hash(process.argv[1]).then(console.log)" 'la-clave'
--
-- Si el usuario ya existe (otra banda), se reutiliza y no se toca su clave.
-- Con -v staff=true el usuario queda como staff de Deoco.
BEGIN;

INSERT INTO usuario (id, email, nombre, "hashContrasena", "esStaff")
VALUES (gen_random_uuid(), lower(:email), :nombre, :hash, :staff)
ON CONFLICT (email) DO NOTHING;

WITH t AS (
  INSERT INTO tenant (id, nombre, slug) VALUES (gen_random_uuid(), :banda, lower(:slug)) RETURNING id
), d AS (
  INSERT INTO dominio (id, dominio, "tenantId", "esPrincipal", verificado)
  SELECT gen_random_uuid(), lower(:dominio), t.id, true, true FROM t
), m AS (
  INSERT INTO membresia (id, "usuarioId", "tenantId", rol)
  SELECT gen_random_uuid(), u.id, t.id, 'TITULAR' FROM t, usuario u WHERE u.email = lower(:email)
)
-- El sitio (home y press kit) nace prendido.
INSERT INTO "moduloTenant" (id, "tenantId", "moduloId")
SELECT gen_random_uuid(), t.id, 'sitio' FROM t;

COMMIT;
