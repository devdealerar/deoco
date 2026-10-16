-- Sesiones que se cierran de verdad (3.2 núcleo d6: "se revoca un usuario con sesión abierta → la
-- sesión se invalida en el siguiente movimiento, no al vencer"). La sesión (JWT) lleva la versión
-- con la que se abrió; si la de la base cambió, en el próximo pedido la sesión deja de valer.
-- Sube sola al cambiar la clave (disparador: nadie se lo saltea); el staff también la puede subir
-- ("cerrar todas las sesiones").
ALTER TABLE "usuario" ADD COLUMN "versionSesion" INTEGER NOT NULL DEFAULT 0;

CREATE FUNCTION usuario_version_por_clave() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW."hashContrasena" IS DISTINCT FROM OLD."hashContrasena" THEN
      NEW."versionSesion" := OLD."versionSesion" + 1;
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER usuario_version_por_clave BEFORE UPDATE ON "usuario"
  FOR EACH ROW EXECUTE FUNCTION usuario_version_por_clave();

-- La versión vigente de una persona (en cada pedido con sesión, antes de que haya RLS por persona).
-- Solo un número: null si la persona no existe.
CREATE FUNCTION version_de_sesion(p_usuario uuid) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT "versionSesion" FROM "usuario" WHERE "id" = p_usuario $$;
REVOKE ALL ON FUNCTION version_de_sesion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION version_de_sesion(uuid) TO deoco_app;
