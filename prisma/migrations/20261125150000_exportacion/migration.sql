-- Exportación completa de los datos de la banda (td3: "los datos son de la banda, con
-- exportación completa siempre disponible: sin pedir permiso y sin trámite de baja"). Un zip con
-- un CSV y un JSON por tabla de la banda más los archivos originales; se arma en segundo plano y
-- se avisa por mail. Abierta en todos los estados de la banda, también archivada.
CREATE TABLE "exportacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "pedidaPor" UUID,
    -- pendiente | armando | lista | fallida | vencida
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "tomadaEn" TIMESTAMP(3),
    "terminadaEn" TIMESTAMP(3),
    -- Hasta cuándo se puede bajar; después el zip se borra.
    "venceEn" TIMESTAMP(3),
    "bytes" BIGINT,
    "tablas" INTEGER,
    "archivos" INTEGER,
    "error" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exportacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exportacion_estado" CHECK ("estado" IN ('pendiente', 'armando', 'lista', 'fallida', 'vencida'))
);
CREATE INDEX "exportacion_tenantId_creadoEn_idx" ON "exportacion"("tenantId", "creadoEn");
-- Una sola en curso por banda.
CREATE UNIQUE INDEX "exportacion_una_en_curso" ON "exportacion"("tenantId") WHERE "estado" IN ('pendiente', 'armando');
ALTER TABLE "exportacion" ADD CONSTRAINT "exportacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('exportacion');

-- El barrido: qué bandas tienen una exportación por armar (o colgada) o una lista que venció.
-- Solo ids, como bandas_con_pendientes().
CREATE FUNCTION exportaciones_por_revisar(p_ahora timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "exportacion"
    WHERE "estado" = 'pendiente'
       OR ("estado" = 'armando' AND "tomadaEn" < p_ahora - interval '30 minutes')
       OR ("estado" = 'lista' AND "venceEn" < p_ahora)
  $$;
REVOKE ALL ON FUNCTION exportaciones_por_revisar(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exportaciones_por_revisar(timestamp) TO deoco_app;
