-- Banda archivada: el titular la sigue viendo en el selector, para llegar a Dominios y llevarse
-- sus dominios (docs/diseno-dominios.md §2: "ninguna banda queda presa"). Otros roles y el staff
-- no la ven (como antes).
CREATE OR REPLACE FUNCTION bandas_visibles(p_usuario uuid)
  RETURNS TABLE (
    tenant_id uuid,
    slug text,
    nombre text,
    estado "EstadoTenant",
    rol text,
    acceso_staff boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t."id", t."slug", t."nombre", t."estado", m."rol", (m."id" IS NULL)
    FROM "tenant" t
    LEFT JOIN "membresia" m ON m."tenantId" = t."id" AND m."usuarioId" = p_usuario
    WHERE (t."estado" <> 'ARCHIVADO' OR m."rol" = 'TITULAR')
      AND (
        m."id" IS NOT NULL
        OR EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = p_usuario AND u."esStaff")
      )
    ORDER BY t."nombre"
  $$;
