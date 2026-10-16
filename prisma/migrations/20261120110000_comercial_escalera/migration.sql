-- Comercial: la escalera de la cuota impaga, en la base (el staff la cambia sin deploy). Días
-- desde el vencimiento: 3 aviso, 15 aviso fuerte, 30 solo lectura, 60 suspendida, 90 archivada.
-- Reemplaza la suspensión a los 10 días.
ALTER TABLE "comercial_config" ADD COLUMN "diasAvisoFuerte" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "comercial_config" ADD COLUMN "diasSoloLectura" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "comercial_config" ADD COLUMN "diasArchivo" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "comercial_config" ALTER COLUMN "diasMoraASuspender" SET DEFAULT 60;
UPDATE "comercial_config" SET "diasMoraASuspender" = 60 WHERE "diasMoraASuspender" = 10;

-- Las cuentas a revisar: también las que ya están en algún escalón (hasta archivarse).
CREATE OR REPLACE FUNCTION comercial_cuentas_a_revisar(p_ahora timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c."tenantId"
    FROM "comercial_cuenta" c
    JOIN "tenant" t ON t.id = c."tenantId"
    JOIN "comercial_plan" p ON p.id = c."planId"
    WHERE t.estado IN ('ACTIVO', 'MOROSO', 'MOROSO_GRAVE', 'SOLO_LECTURA', 'SUSPENDIDO') AND p."aLaVenta" AND c.pro IS NULL
      AND (c."moraDesde" IS NOT NULL OR COALESCE(c."pagoHasta", c."pruebaHasta") <= p_ahora)
  $$;
