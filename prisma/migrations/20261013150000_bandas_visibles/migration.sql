-- Selector de bandas en app.<raiz>: las bandas donde el usuario tiene membresía.
-- Si el usuario es staff, además todas las demás, marcadas acceso_staff.
-- Cruza tenants (no hay uno fijado), por eso es SECURITY DEFINER; el chequeo de
-- esStaff lo hace la base, no quien llama. Las bandas ARCHIVADAS no se listan
-- (su panel devuelve 404).
CREATE FUNCTION bandas_visibles(p_usuario uuid)
  RETURNS TABLE (
    tenant_id uuid,
    slug text,
    nombre text,
    estado "EstadoTenant",
    rol "Rol",
    acceso_staff boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t."id", t."slug", t."nombre", t."estado", m."rol", (m."id" IS NULL)
    FROM "tenant" t
    LEFT JOIN "membresia" m ON m."tenantId" = t."id" AND m."usuarioId" = p_usuario
    WHERE t."estado" <> 'ARCHIVADO'
      AND (
        m."id" IS NOT NULL
        OR EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = p_usuario AND u."esStaff")
      )
    ORDER BY t."nombre"
  $$;
REVOKE ALL ON FUNCTION bandas_visibles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_visibles(uuid) TO deoco_app;
