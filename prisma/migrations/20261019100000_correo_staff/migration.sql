-- CreateEnum
CREATE TYPE "EstadoCorreo" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "correo" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "moduloId" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "responderA" TEXT,
    "nombreRemitente" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "estado" "EstadoCorreo" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "claveUnica" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" TIMESTAMP(3),

    CONSTRAINT "correo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "correo_tenantId_estado_idx" ON "correo"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "correo_tenantId_claveUnica_key" ON "correo"("tenantId", "claveUnica");

-- AddForeignKey
ALTER TABLE "correo" ADD CONSTRAINT "correo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Correo: aislado por banda como toda tabla con datos de banda.
SELECT deoco_aislar_tabla('correo');

-- Staff en una transacción de la app: conStaff() (src/nucleo/acceso/staff.ts) lo marca
-- después de verificar que el usuario es staff. La app es la misma (deoco_app, sin BYPASSRLS).
CREATE FUNCTION app_es_staff() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.staff', true), '') = 'si' $$;
GRANT EXECUTE ON FUNCTION app_es_staff() TO deoco_app;

-- deoco_tabla_global(tabla): tabla de módulo que no es de ninguna banda (el catálogo base
-- de la tienda). Todos la leen; solo se escribe dentro de conStaff(). Sin "tenantId".
CREATE FUNCTION deoco_tabla_global(tabla regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = tabla AND attname = 'tenantId' AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'La tabla % tiene "tenantId": es de una banda, usá deoco_aislar_tabla', tabla;
    END IF;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('CREATE POLICY lectura_global ON %s FOR SELECT USING (true)', tabla);
    EXECUTE format('CREATE POLICY escritura_staff ON %s FOR ALL USING (app_es_staff()) WITH CHECK (app_es_staff())', tabla);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO deoco_app', tabla);
  END
  $$;
REVOKE ALL ON FUNCTION deoco_tabla_global(regclass) FROM PUBLIC;

-- Lo que hace el staff desde rutas de módulos (conStaff) queda en la auditoría, sin banda.
CREATE POLICY auditoria_staff ON "auditoria" FOR INSERT WITH CHECK ("tenantId" IS NULL AND app_es_staff());
