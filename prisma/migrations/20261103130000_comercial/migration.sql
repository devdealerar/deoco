-- Módulo comercial: planes y cuota de Deoco (la banda le paga A DEOCO; la excepción a la regla
-- del dinero). Estas tablas son SOLO de la cuota: las ventas de la banda nunca pasan por acá.


-- CreateTable
CREATE TABLE "comercial_plan" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "precioUsd" TEXT NOT NULL DEFAULT '',
    "precio" INTEGER,
    "modulos" TEXT[],
    "almacenamiento" BIGINT,
    "topes" JSONB,
    "aLaVenta" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercial_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comercial_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "diasPrueba" INTEGER NOT NULL DEFAULT 14,
    "planPrueba" TEXT NOT NULL DEFAULT 'medium',
    "diasGracia" INTEGER NOT NULL DEFAULT 3,
    "diasMoraASuspender" INTEGER NOT NULL DEFAULT 10,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercial_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comercial_cuenta" (
    "tenantId" UUID NOT NULL,
    "planId" TEXT NOT NULL,
    "pro" JSONB,
    "pruebaHasta" TIMESTAMP(3),
    "planElegido" TEXT,
    "suscripcionId" TEXT,
    "suscripcionEstado" TEXT,
    "medioDePago" TEXT,
    "montoSuscripcion" INTEGER,
    "proximoCobro" TIMESTAMP(3),
    "pagoHasta" TIMESTAMP(3),
    "moraDesde" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercial_cuenta_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "comercial_cobro" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cobroId" TEXT NOT NULL,
    "suscripcionId" TEXT,
    "estado" TEXT NOT NULL,
    "estadoPasarela" TEXT NOT NULL DEFAULT '',
    "monto" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercial_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comercial_cuenta_suscripcionId_idx" ON "comercial_cuenta"("suscripcionId");

-- CreateIndex
CREATE UNIQUE INDEX "comercial_cobro_cobroId_key" ON "comercial_cobro"("cobroId");

-- CreateIndex
CREATE INDEX "comercial_cobro_tenantId_fecha_idx" ON "comercial_cobro"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "comercial_cobro_estado_fecha_idx" ON "comercial_cobro"("estado", "fecha");

-- AddForeignKey
ALTER TABLE "comercial_cobro" ADD CONSTRAINT "comercial_cobro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "comercial_cuenta"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;


SELECT deoco_tabla_global('comercial_plan');
SELECT deoco_tabla_global('comercial_config');
SELECT deoco_aislar_tabla('comercial_cuenta');
SELECT deoco_aislar_tabla('comercial_cobro');

-- El back office (conStaff / leerComoStaff) ve las cuentas y los cobros de todas las bandas.
CREATE POLICY lectura_staff ON "comercial_cuenta" FOR SELECT USING (app_es_staff());
CREATE POLICY lectura_staff ON "comercial_cobro" FOR SELECT USING (app_es_staff());

ALTER TABLE "comercial_config" ADD CONSTRAINT "comercial_config_una_fila" CHECK ("id" = 1);
ALTER TABLE "comercial_config" ADD CONSTRAINT "comercial_config_plazos" CHECK (
  "diasPrueba" >= 0 AND "diasGracia" >= 0 AND "diasMoraASuspender" >= 0);
ALTER TABLE "comercial_plan" ADD CONSTRAINT "comercial_plan_precio" CHECK ("precio" IS NULL OR "precio" > 0);

-- Planes de arranque. Los PRECIOS EN PESOS quedan vacíos: los carga el staff (no hay conversión
-- automática). Los topes y el espacio son un punto de partida: el staff los edita.
INSERT INTO "comercial_plan" ("id", "nombre", "descripcion", "precioUsd", "modulos", "almacenamiento", "topes", "aLaVenta", "orden") VALUES
  ('esencial', 'Esencial', 'Banda que arranca: sitio y press kit', '8 USD/mes', ARRAY['sitio'], 1073741824, NULL, true, 1),
  ('medium', 'Medium', 'Suma la tienda', '20 USD/mes', ARRAY['sitio', 'tienda'], 5368709120, '{"tienda.productos-publicados": 20}', true, 2),
  ('premium', 'Premium', 'Suma la ticketera', '45 USD/mes', ARRAY['sitio', 'tienda', 'ticketera'], 21474836480,
   '{"tienda.productos-publicados": 100, "ticketera.shows-publicados": 30}', true, 3),
  ('pro', 'Pro', 'Todo, sin topes, trato directo', 'a convenir', ARRAY['sitio', 'tienda', 'ticketera'], 107374182400, NULL, false, 4);
INSERT INTO "comercial_config" ("id") VALUES (1);

-- Cuentas que el barrido tiene que mirar (vencidas, en mora o con la prueba terminada), de todas
-- las bandas. Cruza bandas, por eso es SECURITY DEFINER; devuelve SOLO los ids. Lo que se hace
-- con cada una corre después con conTenant. El Pro (no a la venta) y el a medida se manejan a mano.
CREATE FUNCTION comercial_cuentas_a_revisar(p_ahora timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c."tenantId"
    FROM "comercial_cuenta" c
    JOIN "tenant" t ON t.id = c."tenantId"
    JOIN "comercial_plan" p ON p.id = c."planId"
    WHERE t.estado IN ('ACTIVO', 'MOROSO') AND p."aLaVenta" AND c.pro IS NULL
      AND (c."moraDesde" IS NOT NULL OR COALESCE(c."pagoHasta", c."pruebaHasta") <= p_ahora)
  $$;
REVOKE ALL ON FUNCTION comercial_cuentas_a_revisar(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comercial_cuentas_a_revisar(timestamp) TO deoco_app;
