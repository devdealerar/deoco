-- Bandas archivadas que todavía tienen la suscripción de la cuota viva (las archivó el gestor
-- o el staff): el barrido la cancela en la pasarela, para que no se le cobre a una banda que no
-- tiene servicio. Cruza bandas: SECURITY DEFINER y SOLO ids.
CREATE FUNCTION comercial_archivadas_con_suscripcion() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c."tenantId" FROM "comercial_cuenta" c JOIN "tenant" t ON t.id = c."tenantId"
    WHERE t.estado = 'ARCHIVADO' AND c."suscripcionId" IS NOT NULL
      AND COALESCE(c."suscripcionEstado", '') NOT IN ('cancelada')
  $$;
REVOKE ALL ON FUNCTION comercial_archivadas_con_suscripcion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comercial_archivadas_con_suscripcion() TO deoco_app;
