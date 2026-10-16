-- Dominio propio según el plan (3.2, núcleo d6: "baja de plan con dominio propio activo → el
-- dominio deja de servirse y vuelve el subdominio; el dominio sigue siendo de la banda"). Lo fija
-- el gestor de cuenta (fijarLimites). Sin permiso: el proxy manda el dominio propio al subdominio,
-- no se suman dominios nuevos, y nada se borra.
ALTER TABLE "tenant" ADD COLUMN "dominiosPropios" BOOLEAN NOT NULL DEFAULT true;

DROP FUNCTION resolver_banda_por_host(text);
CREATE FUNCTION resolver_banda_por_host(host text)
  RETURNS TABLE (id uuid, slug text, estado "EstadoTenant", principal text, "dominiosPropios" boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t."id", t."slug", t."estado",
           (SELECT p."dominio" FROM "dominio" p
             WHERE p."tenantId" = t."id" AND p."esPrincipal" AND p."fallasSeguidas" = 0 AND p."problemaDesde" IS NULL
             LIMIT 1),
           t."dominiosPropios"
    FROM "dominio" d JOIN "tenant" t ON t."id" = d."tenantId"
    WHERE d."dominio" = lower(host) AND d."verificado"
    LIMIT 1
  $$;
REVOKE ALL ON FUNCTION resolver_banda_por_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_banda_por_host(text) TO deoco_app;
