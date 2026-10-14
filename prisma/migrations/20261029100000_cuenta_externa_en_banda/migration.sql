-- Cuenta externa DENTRO de una banda (conCuentaExternaEnBanda): para que una cuenta externa (un
-- proveedor) escriba lo suyo en una banda sin abrirle la banda. NO fija app.tenant_id: fija
-- app.externo_tenant, y solo lo que una política nombra explícitamente queda a su alcance.
-- Todo lo demás de la banda, sin política para este contexto, no existe para ella.

CREATE FUNCTION app_externo_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.externo_tenant', true), '')::uuid $$;

CREATE FUNCTION app_externo_usuario() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.externo_usuario', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app_externo_tenant() TO deoco_app;
GRANT EXECUTE ON FUNCTION app_externo_usuario() TO deoco_app;

-- El MÓDULO decide qué ve su cuenta externa de una banda, con funciones de su migración:
--   <modulo>_externo_banda(tenant uuid) → ¿tiene algo suyo en esa banda? (si no, no entra)
--   <modulo>_externo_archivo(archivo uuid) → ¿ese archivo de la banda es suyo de ver?
-- Corren como quien llama (con RLS): solo ven lo que las políticas del módulo le dejan ver.
-- Sin la función, la respuesta es no. El núcleo no nombra ningún módulo.
CREATE FUNCTION app_externo_permite(que text, id uuid) RETURNS boolean
  LANGUAGE plpgsql STABLE
  AS $$
  DECLARE
    modulo text := nullif(current_setting('app.externo_modulo', true), '');
    funcion text;
    permitido boolean;
  BEGIN
    IF modulo IS NULL OR app_referencia_externa(modulo) IS NULL OR que NOT IN ('banda', 'archivo') THEN
      RETURN false;
    END IF;
    funcion := replace(modulo, '-', '_') || '_externo_' || que;
    IF to_regprocedure(funcion || '(uuid)') IS NULL THEN
      RETURN false;
    END IF;
    EXECUTE format('SELECT %I($1)', funcion) INTO permitido USING id;
    RETURN coalesce(permitido, false);
  END
  $$;
GRANT EXECUTE ON FUNCTION app_externo_permite(text, uuid) TO deoco_app;

-- Evento: la cuenta externa emite en la banda (p. ej. "orden despachada") a su nombre, solo en
-- una banda donde tiene algo, y lee solo los que emitió (para el id). Nada más del bus.
CREATE POLICY externa_emite ON "evento" FOR INSERT
  WITH CHECK ("tenantId" = app_externo_tenant() AND "usuarioId" = app_externo_usuario() AND app_externo_permite('banda', "tenantId"));
CREATE POLICY externa_lee_lo_suyo ON "evento" FOR SELECT
  USING ("tenantId" = app_externo_tenant() AND "usuarioId" = app_externo_usuario());

-- Auditoría: lo que hace queda en la banda, a su nombre.
CREATE POLICY externa_audita ON "auditoria" FOR INSERT
  WITH CHECK ("tenantId" = app_externo_tenant() AND "usuarioId" = app_externo_usuario() AND app_externo_permite('banda', "tenantId"));

-- Archivo: solo los que el módulo diga (el diseño de una orden suya), para firmar su link.
CREATE POLICY externa_lee_archivo ON "archivo" FOR SELECT
  USING ("tenantId" = app_externo_tenant() AND app_externo_permite('archivo', "id"));
