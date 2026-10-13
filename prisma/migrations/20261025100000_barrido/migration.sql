-- Barrido periódico de pendientes (src/nucleo/barrido.ts) y revisión de dominios.

-- Evento: quién lo está entregando. Sin esto, dos procesos (un deploy que se solapa)
-- podrían entregar el mismo evento. Se suelta al terminar; uno colgado se retoma.
ALTER TABLE "evento" ADD COLUMN "tomadoEn" TIMESTAMP(3);

-- Correo: cuándo se tomó para enviar (detecta uno colgado en ENVIANDO) y cuándo se
-- reintenta solo un FALLIDO (null = no se reintenta solo).
ALTER TABLE "correo" ADD COLUMN "tomadoEn" TIMESTAMP(3);
ALTER TABLE "correo" ADD COLUMN "reintentarEn" TIMESTAMP(3);

-- Dominio propio verificado: última revisión del DNS y desde cuándo no apunta al servidor.
ALTER TABLE "dominio" ADD COLUMN "revisadoEn" TIMESTAMP(3);
ALTER TABLE "dominio" ADD COLUMN "fallasSeguidas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dominio" ADD COLUMN "noApuntaDesde" TIMESTAMP(3);

CREATE INDEX "evento_pendiente" ON "evento" ("tenantId") WHERE "estado" = 'PENDIENTE';
CREATE INDEX "correo_sin_enviar" ON "correo" ("tenantId") WHERE "estado" <> 'ENVIADO';
CREATE INDEX "dominio_verificado" ON "dominio" ("revisadoEn") WHERE "verificado";

-- Bandas con algo para retomar. Cruza bandas (no hay una fijada), por eso es SECURITY
-- DEFINER; devuelve SOLO los ids, nada de las filas. El trabajo después va por conTenant.
CREATE FUNCTION bandas_con_pendientes(p_ahora timestamp, p_colgado_desde timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT "tenantId" FROM "evento" WHERE "estado" = 'PENDIENTE'
    UNION
    SELECT "tenantId" FROM "correo"
    WHERE "estado" = 'PENDIENTE'
       OR ("estado" = 'ENVIANDO' AND "tomadoEn" < p_colgado_desde)
       OR ("estado" = 'FALLIDO' AND "reintentarEn" <= p_ahora)
  $$;
REVOKE ALL ON FUNCTION bandas_con_pendientes(timestamp, timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_pendientes(timestamp, timestamp) TO deoco_app;

-- Bandas con dominios propios verificados que toca revisar (los de la plataforma no:
-- el comodín los cubre). Solo ids.
CREATE FUNCTION bandas_con_dominios_a_revisar(p_raiz text, p_revisado_antes timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "dominio"
    WHERE "verificado"
      AND "dominio" NOT LIKE '%.' || p_raiz
      AND ("revisadoEn" IS NULL OR "revisadoEn" < p_revisado_antes)
  $$;
REVOKE ALL ON FUNCTION bandas_con_dominios_a_revisar(text, timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_dominios_a_revisar(text, timestamp) TO deoco_app;
