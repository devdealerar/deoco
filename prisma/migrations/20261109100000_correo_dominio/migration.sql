-- Correo desde el dominio de la banda (docs/diseno-dominios.md §5, D5): la dirección de envío
-- (dominio verificado en Resend) y, en los dominios delegados sin correo propio, el reenvío de lo
-- que llega (Email Routing → Email Worker → Resend). Una por banda.

CREATE TABLE "correo_dominio" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "dominioId" UUID NOT NULL,
    -- El dominio de envío (sin www): labanda.com.
    "dominio" TEXT NOT NULL,
    -- La parte de adelante de la dirección: merch@labanda.com.
    "local" TEXT NOT NULL,
    -- Resend: id del dominio, su estado (pendiente | verificado | fallido) y los registros a crear.
    "envioId" TEXT,
    "envioEstado" TEXT NOT NULL DEFAULT 'pendiente',
    "registros" JSONB NOT NULL DEFAULT '[]',
    -- Recepción: no (conectado por CNAME) | propio (el dominio ya tiene MX: no se toca) | activa.
    "recepcion" TEXT NOT NULL DEFAULT 'no',
    "reenvioA" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correo_dominio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "correo_dominio_envio_estado" CHECK ("envioEstado" IN ('pendiente', 'verificado', 'fallido')),
    CONSTRAINT "correo_dominio_recepcion" CHECK ("recepcion" IN ('no', 'propio', 'activa'))
);

CREATE UNIQUE INDEX "correo_dominio_tenantId_key" ON "correo_dominio"("tenantId");

ALTER TABLE "correo_dominio" ADD CONSTRAINT "correo_dominio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "correo_dominio" ADD CONSTRAINT "correo_dominio_dominioId_fkey" FOREIGN KEY ("dominioId") REFERENCES "dominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT deoco_aislar_tabla('correo_dominio');

-- Bandas con una dirección de envío esperando que Resend la verifique. Solo ids.
CREATE FUNCTION bandas_con_correo_pendiente(p_revisado_antes timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c."tenantId" FROM "correo_dominio" c JOIN "tenant" t ON t."id" = c."tenantId"
    WHERE c."envioEstado" = 'pendiente'
      AND (c."revisadoEn" IS NULL OR c."revisadoEn" < p_revisado_antes)
      AND t."estado" <> 'ARCHIVADO'
  $$;
REVOKE ALL ON FUNCTION bandas_con_correo_pendiente(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_correo_pendiente(timestamp) TO deoco_app;
