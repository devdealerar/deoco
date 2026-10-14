-- Autogestión del alta (src/nucleo/autogestion): una persona se registra sola en app.<raiz>,
-- verifica su email y crea su banda. deoco_app no puede crear usuarios ni ver los registros
-- pendientes: todo pasa por estas funciones acotadas (SECURITY DEFINER), que hacen UNA cosa.

-- Quién creó la banda: el staff (back office) o la persona misma (autogestión).
ALTER TABLE "tenant" ADD COLUMN "origen" TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_origen_check" CHECK ("origen" IN ('staff', 'autogestion'));
ALTER TABLE "tenant" ADD COLUMN "creadoPor" UUID;
CREATE INDEX "tenant_creadoPor_idx" ON "tenant"("creadoPor") WHERE "origen" = 'autogestion';

-- Registro sin verificar: el usuario recién existe cuando abre el link del mail. Sin tenantId:
-- nadie lo lee (RLS sin políticas, y sin permisos para deoco_app); solo las funciones de abajo.
CREATE TABLE "registro_pendiente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hashContrasena" TEXT NOT NULL,
    -- sha256 del token del link (el token mismo nunca se guarda).
    "tokenHash" TEXT NOT NULL,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "envios" INTEGER NOT NULL DEFAULT 1,
    "ultimoEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registro_pendiente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "registro_pendiente_email_key" ON "registro_pendiente"("email");
CREATE UNIQUE INDEX "registro_pendiente_tokenHash_key" ON "registro_pendiente"("tokenHash");
ALTER TABLE "registro_pendiente" ENABLE ROW LEVEL SECURITY;
-- Una política que no deja pasar nada: explícito que nadie (salvo las funciones) lo ve.
CREATE POLICY nadie ON "registro_pendiente" USING (false) WITH CHECK (false);
REVOKE ALL ON "registro_pendiente" FROM deoco_app;

-- Pide (o vuelve a pedir) el mail de verificación. Devuelve:
--   'existe'      ya hay una cuenta con ese email (se le avisa por mail, no en pantalla)
--   'demasiados'  3 mails en la última hora para ese email
--   'nuevo'       registro guardado: mandar el mail con el token
CREATE FUNCTION registro_solicitar(p_email text, p_nombre text, p_hash text, p_token_hash text, p_vence timestamp)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r registro_pendiente%ROWTYPE;
BEGIN
  DELETE FROM registro_pendiente WHERE "venceEn" < now() - interval '1 day';
  IF EXISTS (SELECT 1 FROM usuario WHERE email = lower(p_email)) THEN RETURN 'existe'; END IF;
  SELECT * INTO r FROM registro_pendiente WHERE email = lower(p_email) FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO registro_pendiente (email, nombre, "hashContrasena", "tokenHash", "venceEn")
      VALUES (lower(p_email), p_nombre, p_hash, p_token_hash, p_vence);
    RETURN 'nuevo';
  END IF;
  IF r."ultimoEnvio" > now() - interval '1 hour' AND r.envios >= 3 THEN RETURN 'demasiados'; END IF;
  UPDATE registro_pendiente SET nombre = p_nombre, "hashContrasena" = p_hash, "tokenHash" = p_token_hash, "venceEn" = p_vence,
    envios = CASE WHEN r."ultimoEnvio" > now() - interval '1 hour' THEN r.envios + 1 ELSE 1 END, "ultimoEnvio" = now()
    WHERE id = r.id;
  RETURN 'nuevo';
END $$;

-- Abre el link: crea el usuario (email verificado) y borra el registro. Devuelve su id, o NULL
-- si el token no existe, venció, o el email ya tiene cuenta.
CREATE FUNCTION registro_confirmar(p_token_hash text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r registro_pendiente%ROWTYPE;
  nuevo uuid;
BEGIN
  DELETE FROM registro_pendiente WHERE "tokenHash" = p_token_hash RETURNING * INTO r;
  IF NOT FOUND OR r."venceEn" < now() THEN RETURN NULL; END IF;
  INSERT INTO usuario (id, email, nombre, "hashContrasena", "claveTemporal", "esStaff")
    VALUES (gen_random_uuid(), r.email, r.nombre, r."hashContrasena", false, false)
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO nuevo;
  IF nuevo IS NOT NULL THEN
    INSERT INTO auditoria (id, "usuarioId", "tenantId", accion, detalle)
      VALUES (gen_random_uuid(), nuevo, NULL, 'usuario.registrado', jsonb_build_object('email', r.email));
  END IF;
  RETURN nuevo;
END $$;

-- La persona (con su email verificado: existe como usuario) crea SU banda: banda, subdominio y
-- membresía de titular, en una sola transacción. Una banda por autogestión por cuenta (las que
-- le dé el staff no cuentan). Slug o dominio tomados: error de unicidad de la base.
CREATE FUNCTION crear_banda_autogestion(p_usuario uuid, p_nombre text, p_slug text, p_dominio text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  banda uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuario WHERE id = p_usuario) THEN RAISE EXCEPTION 'deoco:sin-usuario'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('autogestion:' || p_usuario::text));
  IF EXISTS (SELECT 1 FROM tenant WHERE "creadoPor" = p_usuario AND origen = 'autogestion') THEN
    RAISE EXCEPTION 'deoco:ya-tiene-banda';
  END IF;
  IF EXISTS (SELECT 1 FROM dominio WHERE dominio = p_dominio) THEN RAISE EXCEPTION 'deoco:dominio-tomado'; END IF;
  INSERT INTO tenant (id, nombre, slug, origen, "creadoPor") VALUES (banda, p_nombre, p_slug, 'autogestion', p_usuario);
  INSERT INTO dominio (id, "tenantId", dominio, "esPrincipal", verificado) VALUES (gen_random_uuid(), banda, p_dominio, true, true);
  INSERT INTO membresia (id, "usuarioId", "tenantId", rol) VALUES (gen_random_uuid(), p_usuario, banda, 'TITULAR');
  INSERT INTO auditoria (id, "usuarioId", "tenantId", accion, detalle)
    VALUES (gen_random_uuid(), p_usuario, banda, 'banda.autogestionada', jsonb_build_object('nombre', p_nombre, 'slug', p_slug, 'dominio', p_dominio));
  RETURN banda;
END $$;

REVOKE ALL ON FUNCTION registro_solicitar(text, text, text, text, timestamp) FROM PUBLIC;
REVOKE ALL ON FUNCTION registro_confirmar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION crear_banda_autogestion(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registro_solicitar(text, text, text, text, timestamp) TO deoco_app;
GRANT EXECUTE ON FUNCTION registro_confirmar(text) TO deoco_app;
GRANT EXECUTE ON FUNCTION crear_banda_autogestion(uuid, text, text, text) TO deoco_app;

-- Cuántas bandas creó sola esta persona (para no ofrecerle crear otra). Solo un número.
CREATE FUNCTION bandas_autogestionadas(p_usuario uuid) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT count(*)::int FROM tenant WHERE "creadoPor" = p_usuario AND origen = 'autogestion'
  $$;
REVOKE ALL ON FUNCTION bandas_autogestionadas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_autogestionadas(uuid) TO deoco_app;
