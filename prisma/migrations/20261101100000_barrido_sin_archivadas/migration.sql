-- El barrido no trabaja para bandas ARCHIVADAS: ni retoma sus eventos y correos pendientes ni
-- revisa sus dominios. (Las SUSPENDIDAS sí: un mail de una compra ya pagada tiene que salir.)
CREATE OR REPLACE FUNCTION bandas_con_pendientes(p_ahora timestamp, p_colgado_desde timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT p.id FROM (
      SELECT "tenantId" AS id FROM "evento" WHERE "estado" = 'PENDIENTE'
      UNION
      SELECT "tenantId" FROM "correo"
      WHERE "estado" = 'PENDIENTE'
         OR ("estado" = 'ENVIANDO' AND "tomadoEn" < p_colgado_desde)
         OR ("estado" = 'FALLIDO' AND "reintentarEn" <= p_ahora)
    ) p JOIN "tenant" t ON t."id" = p.id
    WHERE t."estado" <> 'ARCHIVADO'
  $$;

CREATE OR REPLACE FUNCTION bandas_con_dominios_a_revisar(p_raiz text, p_revisado_antes timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT d."tenantId" FROM "dominio" d JOIN "tenant" t ON t."id" = d."tenantId"
    WHERE d."verificado"
      AND d."dominio" NOT LIKE '%.' || p_raiz
      AND (d."revisadoEn" IS NULL OR d."revisadoEn" < p_revisado_antes)
      AND t."estado" <> 'ARCHIVADO'
  $$;
