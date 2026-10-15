-- Salir de Deoco con un dominio delegado (docs/diseno-dominios.md §3.2, D6): la banda se lleva
-- el DNS (cambia los nameservers) o deja de usar el dominio. La zona sigue andando hasta que los
-- nameservers se van (o 90 días), con aviso antes de darla de baja. Sin intervención del staff.

CREATE TABLE "zona_saliente" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "zonaId" TEXT NOT NULL,
    -- El dominio de la zona (sin www).
    "dominio" TEXT NOT NULL,
    -- "Me llevo el DNS" (true) o quitó el dominio (false).
    "seLlevaElDns" BOOLEAN NOT NULL DEFAULT false,
    -- Seguir con el sitio en Deoco por CNAME (www): el custom hostname creado de antemano.
    "seguirConSitio" BOOLEAN NOT NULL DEFAULT false,
    "hostnameId" TEXT,
    -- Lo que tiene que cargar en su DNS nuevo: [{ tipo, nombre, valor, para, prioridad? }].
    "registros" JSONB NOT NULL DEFAULT '[]',
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bajaEn" TIMESTAMP(3) NOT NULL,
    "avisadoEn" TIMESTAMP(3),
    "revisadoEn" TIMESTAMP(3),

    CONSTRAINT "zona_saliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zona_saliente_tenantId_zonaId_key" ON "zona_saliente"("tenantId", "zonaId");

ALTER TABLE "zona_saliente" ADD CONSTRAINT "zona_saliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT deoco_aislar_tabla('zona_saliente');

-- Bandas con zonas saliendo que toca revisar. Solo ids. (Las de bandas archivadas también: la
-- salida corre igual.)
CREATE FUNCTION bandas_con_zonas_salientes(p_revisado_antes timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "zona_saliente"
    WHERE "revisadoEn" IS NULL OR "revisadoEn" < p_revisado_antes
  $$;
REVOKE ALL ON FUNCTION bandas_con_zonas_salientes(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_zonas_salientes(timestamp) TO deoco_app;
