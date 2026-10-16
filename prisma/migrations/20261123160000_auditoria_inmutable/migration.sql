-- Registro de actividad obligatorio (td3, regla inviolable 4): la auditoría solo se agrega.
-- Ni la app (deoco_app) ni el back office (deoco_admin) pueden cambiar o borrar una fila; la
-- retención (si algún día se borra lo viejo) la corre el rol dueño, en una migración o script.
REVOKE UPDATE, DELETE, TRUNCATE ON "auditoria" FROM deoco_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "auditoria" FROM deoco_admin;

-- Y por si alguien vuelve a dar el permiso: un disparador que solo deja pasar al dueño.
CREATE FUNCTION auditoria_inmutable() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF current_user IS DISTINCT FROM (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'auditoria') THEN
    RAISE EXCEPTION 'deoco:auditoria-inmutable: la auditoría no se cambia ni se borra';
  END IF;
  RETURN COALESCE(OLD, NEW);
END $$;
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON "auditoria" FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();

-- Quién hizo cada cosa, para mostrarle a la banda su actividad: el nombre de quien es (o fue)
-- miembro de la banda de la transacción; el staff aparece como "Equipo de Deoco"; nadie más.
-- Solo los ids que se piden, solo de esta banda (app_tenant_id()).
CREATE FUNCTION autores_de_actividad(p_ids uuid[]) RETURNS TABLE (id uuid, nombre text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT u."id", CASE WHEN u."esStaff" THEN 'Equipo de Deoco' ELSE u."nombre" END
    FROM "usuario" u
    WHERE u."id" = ANY(p_ids)
      AND (u."esStaff" OR EXISTS (SELECT 1 FROM "auditoria" a WHERE a."usuarioId" = u."id" AND a."tenantId" = app_tenant_id()))
  $$;
REVOKE ALL ON FUNCTION autores_de_actividad(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION autores_de_actividad(uuid[]) TO deoco_app;
