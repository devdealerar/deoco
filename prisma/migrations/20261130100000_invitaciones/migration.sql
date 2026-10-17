-- Invitaciones (D7): el titular suma gente a la banda sin pasar por el staff (un manager, un
-- integrante). Invita por email con un rol (nunca TITULAR: se pasa); la persona, con su cuenta y
-- ese mismo email, acepta desde el selector de bandas. Vence a los 14 días. Todo queda auditado.
CREATE TABLE "invitacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "invitadoPor" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence" TIMESTAMP(3) NOT NULL,
    -- "pendiente" | "aceptada" | "rechazada" | "cancelada"
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "resueltaEn" TIMESTAMP(3),
    CONSTRAINT "invitacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invitacion_rol" CHECK ("rol" <> 'TITULAR'),
    CONSTRAINT "invitacion_estado" CHECK ("estado" IN ('pendiente', 'aceptada', 'rechazada', 'cancelada'))
);
CREATE INDEX "invitacion_tenantId_estado_idx" ON "invitacion"("tenantId", "estado");
CREATE INDEX "invitacion_email_estado_idx" ON "invitacion"("email", "estado");
-- Una pendiente por banda y email.
CREATE UNIQUE INDEX "invitacion_una_pendiente" ON "invitacion"("tenantId", "email") WHERE "estado" = 'pendiente';
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('invitacion');

-- Las invitaciones vigentes para un email (el selector de bandas, antes de entrar a ninguna).
-- Cruza bandas: SECURITY DEFINER, y solo lo necesario para mostrarla.
CREATE FUNCTION invitaciones_para(p_email text) RETURNS TABLE (id uuid, tenant_id uuid, banda text, rol text, vence timestamp)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT i."id", i."tenantId", t."nombre", i."rol", i."vence"
    FROM "invitacion" i JOIN "tenant" t ON t."id" = i."tenantId"
    WHERE i."email" = lower(p_email) AND i."estado" = 'pendiente' AND i."vence" > now() AND t."estado" <> 'ARCHIVADO'
    ORDER BY i."creadoEn"
  $$;
REVOKE ALL ON FUNCTION invitaciones_para(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invitaciones_para(text) TO deoco_app;
