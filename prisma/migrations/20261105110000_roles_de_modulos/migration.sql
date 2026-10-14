-- Los roles de negocio (PUERTA, COMERCIAL) pasan a ser de los módulos: el núcleo se queda con
-- TITULAR, EDITOR y LECTURA, y los módulos declaran los suyos (`roles` en el contrato). La base
-- ya no los enumera: `membresia.rol` es texto con forma de rol; qué roles existen lo valida la
-- app contra el registro al asignar.
DROP FUNCTION bandas_visibles(uuid);
ALTER TABLE "membresia" ALTER COLUMN "rol" TYPE TEXT USING "rol"::text;
DROP TYPE "Rol";
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_rol_check" CHECK ("rol" ~ '^[A-Z][A-Z_]{1,29}$');

CREATE FUNCTION bandas_visibles(p_usuario uuid)
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
    WHERE t."estado" <> 'ARCHIVADO'
      AND (
        m."id" IS NOT NULL
        OR EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = p_usuario AND u."esStaff")
      )
    ORDER BY t."nombre"
  $$;
REVOKE ALL ON FUNCTION bandas_visibles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_visibles(uuid) TO deoco_app;
