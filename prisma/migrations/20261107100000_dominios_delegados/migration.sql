-- Dominios delegados (docs/diseno-dominios.md, D3): la zona es nuestra, la banda cambia los
-- nameservers en su registrador (o en nic.ar) y el barrido detecta cuándo se activa.

-- Los dos nameservers que Cloudflare asignó a la zona (los que la banda copia).
ALTER TABLE "dominio" ADD COLUMN "nameservers" TEXT[] NOT NULL DEFAULT '{}';

-- ¿La zona `p_zona` la usa otra banda? Una zona es de una sola banda: los nameservers son los
-- mismos para cualquiera, así que no prueban de cuál es. Solo un sí o un no.
CREATE FUNCTION zona_de_otra_banda(p_zona text, p_tenant uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT EXISTS (SELECT 1 FROM "dominio" WHERE "via" = 'zona' AND "proveedorId" = p_zona AND "tenantId" <> p_tenant)
  $$;
REVOKE ALL ON FUNCTION zona_de_otra_banda(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zona_de_otra_banda(text, uuid) TO deoco_app;

-- Bandas con dominios delegados esperando que la banda cambie los nameservers, que toca mirar
-- (más seguido que la revisión de 6 h). Solo ids.
CREATE FUNCTION bandas_con_zonas_pendientes(p_revisado_antes timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT d."tenantId" FROM "dominio" d JOIN "tenant" t ON t."id" = d."tenantId"
    WHERE NOT d."verificado"
      AND d."via" = 'zona'
      AND (d."revisadoEn" IS NULL OR d."revisadoEn" < p_revisado_antes)
      AND t."estado" <> 'ARCHIVADO'
  $$;
REVOKE ALL ON FUNCTION bandas_con_zonas_pendientes(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_zonas_pendientes(timestamp) TO deoco_app;
