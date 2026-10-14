-- `usuario` con RLS. Antes no tenía: cualquier transacción de la app (también la de un módulo)
-- podía leer emails y hashes de todas las personas, y escribir `esStaff`.
--
-- Quién toca la tabla desde la app (deoco_app), y cómo:
--   · la propia persona: lee y edita SU fila, en una transacción con `app.usuario_id`
--     (la fija conUsuario() del núcleo, con el id de la sesión). Solo nombre y clave.
--   · el login, antes de que haya sesión: usuario_para_ingresar(email) → id + hash, nada más.
--   · el staff dentro de conStaff(): busca por email y da de alta con clave temporal
--     (cuentas externas), y lista las cuentas de un portal. Siempre por funciones acotadas.
--   · un módulo: nada. Lo que necesite de una persona viene por el núcleo
--     (titular_de_banda(), en su banda).
-- El back office (deoco_admin, BYPASSRLS) sigue viendo y escribiendo todo por su conexión.
-- `esStaff` y `email` no los puede escribir deoco_app de ninguna forma (privilegios por columna).

CREATE FUNCTION app_usuario_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.usuario_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION app_usuario_id() TO deoco_app;

ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY propio_lee ON "usuario" FOR SELECT USING ("id" = app_usuario_id());
CREATE POLICY propio_edita ON "usuario" FOR UPDATE
  USING ("id" = app_usuario_id()) WITH CHECK ("id" = app_usuario_id());

-- Sin INSERT ni DELETE; UPDATE solo de lo que la persona puede cambiar de sí misma.
REVOKE INSERT, UPDATE, DELETE ON "usuario" FROM deoco_app;
GRANT UPDATE ("nombre", "hashContrasena", "claveTemporal") ON "usuario" TO deoco_app;

-- La marca de clave temporal se saca solo cambiando la clave (y desde la app no se pone).
CREATE FUNCTION usuario_clave_temporal() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF current_user = 'deoco_app' AND NEW."claveTemporal" IS DISTINCT FROM OLD."claveTemporal"
       AND (NEW."claveTemporal" OR NEW."hashContrasena" = OLD."hashContrasena") THEN
      RAISE EXCEPTION 'La clave temporal solo se quita cambiando la clave.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER usuario_clave_temporal BEFORE UPDATE ON "usuario"
  FOR EACH ROW EXECUTE FUNCTION usuario_clave_temporal();

-- Login: por email, sin sesión. Devuelve lo mínimo para verificar la clave.
CREATE FUNCTION usuario_para_ingresar(p_email text) RETURNS TABLE (id uuid, hash text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT "id", "hashContrasena" FROM "usuario" WHERE "email" = lower(p_email) $$;
REVOKE ALL ON FUNCTION usuario_para_ingresar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION usuario_para_ingresar(text) TO deoco_app;

-- Staff (conStaff): ¿hay alguien con ese email? (para no duplicar ni dar portal a un staff).
CREATE FUNCTION usuario_por_email_staff(p_email text) RETURNS TABLE (id uuid, es_staff boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT app_es_staff() THEN RAISE EXCEPTION 'Solo el staff.' USING ERRCODE = '42501'; END IF;
    RETURN QUERY SELECT u."id", u."esStaff" FROM "usuario" u WHERE u."email" = lower(p_email);
  END
  $$;
REVOKE ALL ON FUNCTION usuario_por_email_staff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION usuario_por_email_staff(text) TO deoco_app;

-- Staff (conStaff): alta con clave temporal. Nunca staff.
CREATE FUNCTION crear_usuario_temporal(p_email text, p_nombre text, p_hash text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE nuevo uuid;
  BEGIN
    IF NOT app_es_staff() THEN RAISE EXCEPTION 'Solo el staff.' USING ERRCODE = '42501'; END IF;
    INSERT INTO "usuario" ("id", "email", "nombre", "hashContrasena", "claveTemporal", "esStaff")
      VALUES (gen_random_uuid(), lower(p_email), p_nombre, p_hash, true, false)
      RETURNING "id" INTO nuevo;
    RETURN nuevo;
  END
  $$;
REVOKE ALL ON FUNCTION crear_usuario_temporal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crear_usuario_temporal(text, text, text) TO deoco_app;

-- Staff: las personas con acceso a un portal (back office del módulo).
CREATE FUNCTION cuentas_externas_de(p_modulo text, p_referencia text)
  RETURNS TABLE (id uuid, email text, nombre text, clave_temporal boolean, creado_en timestamp(3))
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT app_es_staff() THEN RAISE EXCEPTION 'Solo el staff.' USING ERRCODE = '42501'; END IF;
    RETURN QUERY
      SELECT c."id", u."email", u."nombre", u."claveTemporal", c."creadoEn"
      FROM "cuenta_externa" c JOIN "usuario" u ON u."id" = c."usuarioId"
      WHERE c."moduloId" = p_modulo AND c."referencia" = p_referencia
      ORDER BY c."creadoEn";
  END
  $$;
REVOKE ALL ON FUNCTION cuentas_externas_de(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cuentas_externas_de(text, text) TO deoco_app;

-- El titular de la banda de la transacción (conTenant): nombre y email, para contacto.
-- Es lo único de una persona que un módulo puede pedir, y solo de su banda.
CREATE FUNCTION titular_de_banda() RETURNS TABLE (nombre text, email text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT u."nombre", u."email" FROM "membresia" m JOIN "usuario" u ON u."id" = m."usuarioId"
    WHERE m."tenantId" = app_tenant_id() AND m."rol" = 'TITULAR'
    ORDER BY m."id" LIMIT 1
  $$;
REVOKE ALL ON FUNCTION titular_de_banda() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION titular_de_banda() TO deoco_app;
