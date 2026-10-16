-- La red de seguridad de la banda: el subdominio (y cualquier otro dominio suyo) redirige al
-- principal SOLO si el principal anda. Con una revisión fallida (`fallasSeguidas` > 0, o el
-- problema ya marcado) no se redirige: el sitio se sirve donde se pidió, en vez de mandar a la
-- gente a un dominio roto.
CREATE OR REPLACE FUNCTION resolver_banda_por_host(host text)
  RETURNS TABLE (id uuid, slug text, estado "EstadoTenant", principal text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t."id", t."slug", t."estado",
           (SELECT p."dominio" FROM "dominio" p
             WHERE p."tenantId" = t."id" AND p."esPrincipal" AND p."fallasSeguidas" = 0 AND p."problemaDesde" IS NULL
             LIMIT 1)
    FROM "dominio" d JOIN "tenant" t ON t."id" = d."tenantId"
    WHERE d."dominio" = lower(host) AND d."verificado"
    LIMIT 1
  $$;
