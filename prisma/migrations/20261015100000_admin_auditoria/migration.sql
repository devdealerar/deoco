-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" UUID NOT NULL,
    "tenantId" UUID,
    "accion" TEXT NOT NULL,
    "detalle" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_tenantId_fecha_idx" ON "auditoria"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "auditoria_usuarioId_fecha_idx" ON "auditoria"("usuarioId", "fecha");


-- Auditoría aislada por banda para la app (las filas sin banda solo las ve el back office).
SELECT deoco_aislar_tabla('auditoria');

-- Back office: el rol deoco_admin (prisma/sql/crear-rol-admin.sql) lee y escribe datos de
-- todas las bandas (BYPASSRLS). No puede tocar el esquema ni la tabla de migraciones.
GRANT USAGE ON SCHEMA public TO deoco_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO deoco_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO deoco_admin;
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM deoco_admin;
  END IF;
END $$;
-- Lo que creen migraciones futuras (de módulos), también.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO deoco_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO deoco_admin;
