-- D5: transferir una entrada (el QR anterior deja de valer; si nadie acepta, vence y queda intacta).
ALTER TABLE "ticketera_entrada" ADD COLUMN "emailTitular" TEXT;
CREATE UNIQUE INDEX "ticketera_entrada_tenantId_id_key" ON "ticketera_entrada"("tenantId", "id");

CREATE TABLE "ticketera_transferencia" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entradaId" UUID NOT NULL,
    "deEmail" TEXT NOT NULL,
    "aEmail" TEXT NOT NULL,
    "aNombre" TEXT NOT NULL,
    "aDocumento" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'por-confirmar',
    "confirmarHash" TEXT,
    "confirmarCifrado" BYTEA,
    "aceptarHash" TEXT,
    "aceptarCifrado" BYTEA,
    "vence" TIMESTAMP(3) NOT NULL,
    "codigoAnterior" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaEn" TIMESTAMP(3),
    CONSTRAINT "ticketera_transferencia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ticketera_transferencia_tenantId_entradaId_idx" ON "ticketera_transferencia"("tenantId", "entradaId");
CREATE INDEX "ticketera_transferencia_tenantId_estado_vence_idx" ON "ticketera_transferencia"("tenantId", "estado", "vence");
CREATE INDEX "ticketera_transferencia_tenantId_codigoAnterior_idx" ON "ticketera_transferencia"("tenantId", "codigoAnterior");
ALTER TABLE "ticketera_transferencia" ADD CONSTRAINT "ticketera_transferencia_tenantId_entradaId_fkey" FOREIGN KEY ("tenantId", "entradaId") REFERENCES "ticketera_entrada"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Una sola transferencia abierta por entrada (la base lo impone).
CREATE UNIQUE INDEX "ticketera_transferencia_una_abierta" ON "ticketera_transferencia"("tenantId", "entradaId") WHERE "estado" IN ('por-confirmar', 'por-aceptar');
SELECT deoco_aislar_tabla('ticketera_transferencia');

-- Bandas con transferencias abiertas (para vencerlas). Cruza bandas: SECURITY DEFINER y SOLO ids.
CREATE FUNCTION ticketera_bandas_con_transferencias() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT DISTINCT "tenantId" FROM "ticketera_transferencia" WHERE "estado" IN ('por-confirmar', 'por-aceptar') $$;
REVOKE ALL ON FUNCTION ticketera_bandas_con_transferencias() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketera_bandas_con_transferencias() TO deoco_app;
