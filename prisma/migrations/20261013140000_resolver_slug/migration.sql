-- Resolución de tenant por slug, para el panel (app.<raiz>/b/<slug>/...).
-- Igual que resolver_tenant_por_host: corre como dueño y devuelve SOLO el id.
CREATE FUNCTION resolver_tenant_por_slug(slug_buscado text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT "id" FROM "tenant" WHERE "slug" = lower(slug_buscado) LIMIT 1 $$;
REVOKE ALL ON FUNCTION resolver_tenant_por_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_tenant_por_slug(text) TO deoco_app;
