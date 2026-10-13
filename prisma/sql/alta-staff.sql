-- Alta de una persona del staff de Deoco (sin banda). Rol DUEÑO:
--   psql "$DATABASE_URL_MIGRACIONES" -v email="'vos@deoco.com'" -v nombre="'Tu Nombre'" \
--     -v hash="'<hash argon2>'" -f prisma/sql/alta-staff.sql
INSERT INTO usuario (id, email, nombre, "hashContrasena", "esStaff")
VALUES (gen_random_uuid(), lower(:email), :nombre, :hash, true)
ON CONFLICT (email) DO UPDATE SET "esStaff" = true;
