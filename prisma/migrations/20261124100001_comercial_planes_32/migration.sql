-- Los planes del 3.2 (núcleo d1/d2, cierre): DEMO y ESCENARIO a la venta; GIRA y SELLO definidos y
-- cerrados (se abren cuando haya quien los pida). Precios de referencia acercándose a 1/3/7; en
-- pesos quedan vacíos (los carga el staff). Sin plan gratuito: la prueba de 14 días no es un plan.
-- Se diferencian por topes de productos y de shows; el espacio es una red de seguridad de unos
-- siete años de uso al máximo (docs/planes.md): Demo 0,20 GB/año → 1,5 GB; Escenario 1,45 → 10 GB;
-- Gira 5,10 → 36 GB. Sello: por banda, como Gira.
ALTER TABLE "comercial_plan" ADD COLUMN "dominioPropio" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "comercial_plan" ("id", "nombre", "descripcion", "precioUsd", "modulos", "almacenamiento", "topes", "aLaVenta", "orden", "dominioPropio") VALUES
  ('demo', 'Demo', 'Para arrancar: sitio con subdominio, tienda y un show a la venta', '8 USD/mes', ARRAY['sitio', 'tienda', 'ticketera'], 1610612736,
   '{"tienda.productos-publicados": 5, "ticketera.shows-publicados": 1}', true, 1, false),
  ('escenario', 'Escenario', 'Con dominio propio y hasta 6 shows a la venta a la vez', '24 USD/mes', ARRAY['sitio', 'tienda', 'ticketera'], 10737418240,
   '{"tienda.productos-publicados": 30, "ticketera.shows-publicados": 6}', true, 2, true),
  ('gira', 'Gira', 'Para giras: hasta 20 shows a la venta a la vez', '56 USD/mes', ARRAY['sitio', 'tienda', 'ticketera'], 38654705664,
   '{"tienda.productos-publicados": 100, "ticketera.shows-publicados": 20}', false, 3, true),
  ('sello', 'Sello', 'Para managers: desde tres bandas, con precio por banda decreciente', 'por banda, a convenir', ARRAY['sitio', 'tienda', 'ticketera'], 38654705664,
   '{"tienda.productos-publicados": 100, "ticketera.shows-publicados": 20}', false, 4, true);

-- Las cuentas que ya existen pasan al plan equivalente (ninguna pierde lo que tenía).
UPDATE "comercial_cuenta" SET "planId" = CASE "planId" WHEN 'esencial' THEN 'demo' WHEN 'medium' THEN 'escenario' WHEN 'premium' THEN 'gira' WHEN 'pro' THEN 'sello' ELSE "planId" END;
UPDATE "comercial_cuenta" SET "planElegido" = CASE "planElegido" WHEN 'esencial' THEN 'demo' WHEN 'medium' THEN 'escenario' WHEN 'premium' THEN 'gira' WHEN 'pro' THEN 'sello' ELSE "planElegido" END WHERE "planElegido" IS NOT NULL;
UPDATE "comercial_cuenta" SET "excedentePlanId" = CASE "excedentePlanId" WHEN 'esencial' THEN 'demo' WHEN 'medium' THEN 'escenario' WHEN 'premium' THEN 'gira' WHEN 'pro' THEN 'sello' ELSE "excedentePlanId" END WHERE "excedentePlanId" IS NOT NULL;
ALTER TABLE "comercial_config" ALTER COLUMN "planPrueba" SET DEFAULT 'escenario';
UPDATE "comercial_config" SET "planPrueba" = CASE "planPrueba" WHEN 'esencial' THEN 'demo' WHEN 'medium' THEN 'escenario' WHEN 'premium' THEN 'gira' WHEN 'pro' THEN 'sello' ELSE "planPrueba" END;
DELETE FROM "comercial_plan" WHERE "id" IN ('esencial', 'medium', 'premium', 'pro');

-- Prorrateo (núcleo d6: subir a mitad de período cobra la diferencia proporcional): se suma al
-- próximo cobro de la suscripción y después vuelve el precio del plan.
ALTER TABLE "comercial_cuenta" ADD COLUMN "cargoPendiente" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "comercial_cuenta" ADD COLUMN "cargoDetalle" TEXT;

-- Cuentas a revisar: también las de planes cerrados con precio (Gira o Sello asignados por el
-- staff y cobrados con la suscripción). El Pro a medida sigue a mano.
CREATE OR REPLACE FUNCTION comercial_cuentas_a_revisar(p_ahora timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c."tenantId"
    FROM "comercial_cuenta" c
    JOIN "tenant" t ON t.id = c."tenantId"
    JOIN "comercial_plan" p ON p.id = c."planId"
    WHERE t.estado IN ('ACTIVO', 'MOROSO', 'MOROSO_GRAVE', 'SOLO_LECTURA', 'SUSPENDIDO') AND (p."aLaVenta" OR p."precio" IS NOT NULL) AND c.pro IS NULL
      AND (c."moraDesde" IS NOT NULL OR COALESCE(c."pagoHasta", c."pruebaHasta") <= p_ahora)
  $$;
