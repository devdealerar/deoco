-- El proxy resuelve la banda de un host en UNA consulta (antes, dos: el id y después la banda
-- y su principal bajo RLS). Corre en cada pedido a un sitio público. SECURITY DEFINER como
-- resolver_tenant_por_host: devuelve solo lo que el proxy necesita (id, slug, estado y el
-- dominio principal), nada más de la banda.
CREATE FUNCTION resolver_banda_por_host(host text)
  RETURNS TABLE (id uuid, slug text, estado "EstadoTenant", principal text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t."id", t."slug", t."estado",
           (SELECT p."dominio" FROM "dominio" p WHERE p."tenantId" = t."id" AND p."esPrincipal" LIMIT 1)
    FROM "dominio" d JOIN "tenant" t ON t."id" = d."tenantId"
    WHERE d."dominio" = lower(host) AND d."verificado"
    LIMIT 1
  $$;
REVOKE ALL ON FUNCTION resolver_banda_por_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_banda_por_host(text) TO deoco_app;
