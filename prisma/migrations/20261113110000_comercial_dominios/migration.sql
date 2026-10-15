-- Dominios que la banda le compra a Deoco (D9), en el gestor de cuenta. Misma cuenta de Mercado
-- Pago de Deoco que la cuota, pero NADA en común con ella: tablas propias (comercial_dominio_*,
-- nunca comercial_cobro), aviso propio (/dominio/<pasarela>, nunca /cuota) y estados propios.

CREATE TABLE "comercial_dominio_precio" (
    "tld" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "aLaVenta" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comercial_dominio_precio_pkey" PRIMARY KEY ("tld"),
    CONSTRAINT "comercial_dominio_precio_precio" CHECK ("precio" > 0),
    CONSTRAINT "comercial_dominio_precio_tld" CHECK ("tld" ~ '^[a-z0-9-]+(\.[a-z0-9-]+)?$')
);

CREATE TABLE "comercial_dominio_cobro" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "anios" INTEGER NOT NULL,
    "monto" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "usuarioId" UUID,
    "preferenciaId" TEXT,
    "vence" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'esperando',
    "pagoId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagadoEn" TIMESTAMP(3),
    CONSTRAINT "comercial_dominio_cobro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comercial_dominio_cobro_tipo" CHECK ("tipo" IN ('alta', 'renovacion')),
    CONSTRAINT "comercial_dominio_cobro_estado" CHECK ("estado" IN ('esperando', 'pagado', 'sin-pagar', 'devuelto')),
    CONSTRAINT "comercial_dominio_cobro_monto" CHECK ("monto" > 0 AND "anios" BETWEEN 1 AND 10),
    -- Pagado (o devuelto después) ⇔ tiene el pago aceptado.
    CONSTRAINT "comercial_dominio_cobro_pagado" CHECK (("estado" IN ('pagado', 'devuelto')) = ("pagoId" IS NOT NULL))
);
CREATE INDEX "comercial_dominio_cobro_tenantId_clave_idx" ON "comercial_dominio_cobro"("tenantId", "clave");
-- Por banda, un cobro pagado por clave: lo mismo no se paga dos veces (devuelto, se puede volver a comprar).
CREATE UNIQUE INDEX "comercial_dominio_cobro_pagado_por_clave" ON "comercial_dominio_cobro"("tenantId", "clave") WHERE "estado" = 'pagado';

CREATE TABLE "comercial_dominio_pago" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cobroId" UUID NOT NULL,
    "pagoId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "estadoPasarela" TEXT NOT NULL DEFAULT '',
    "medio" TEXT,
    "monto" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "entrega" TEXT,
    "entregaIntentos" INTEGER NOT NULL DEFAULT 0,
    "entregaError" TEXT,
    "devolucion" TEXT,
    "devolucionMotivo" TEXT,
    "devolucionIntentos" INTEGER NOT NULL DEFAULT 0,
    "devolucionProxima" TIMESTAMP(3),
    "devolucionError" TEXT,
    "devolucionId" TEXT,
    "devolucionDesde" TIMESTAMP(3),
    "devueltoEn" TIMESTAMP(3),
    "devolucionNota" TEXT,
    "tomadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comercial_dominio_pago_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comercial_dominio_pago_estado" CHECK ("estado" IN ('aprobado', 'rechazado', 'pendiente', 'devuelto')),
    CONSTRAINT "comercial_dominio_pago_entrega" CHECK ("entrega" IS NULL OR "entrega" IN ('pendiente', 'hecha')),
    CONSTRAINT "comercial_dominio_pago_devolucion" CHECK ("devolucion" IS NULL OR "devolucion" IN ('pendiente', 'en-proceso', 'hecha', 'fallida', 'a-mano')),
    -- Devuelta a mano por el staff: siempre con la nota de cómo.
    CONSTRAINT "comercial_dominio_pago_a_mano" CHECK ("devolucion" IS DISTINCT FROM 'a-mano' OR "devolucionNota" IS NOT NULL)
);
CREATE UNIQUE INDEX "comercial_dominio_pago_pagoId_key" ON "comercial_dominio_pago"("pagoId");
CREATE INDEX "comercial_dominio_pago_tenantId_creadoEn_idx" ON "comercial_dominio_pago"("tenantId", "creadoEn");
CREATE INDEX "comercial_dominio_pago_pendientes" ON "comercial_dominio_pago"("devolucionProxima")
  WHERE "devolucion" IN ('pendiente', 'en-proceso', 'fallida') OR "entrega" = 'pendiente';
ALTER TABLE "comercial_dominio_pago" ADD CONSTRAINT "comercial_dominio_pago_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "comercial_dominio_cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT deoco_tabla_global('comercial_dominio_precio');
SELECT deoco_aislar_tabla('comercial_dominio_cobro');
SELECT deoco_aislar_tabla('comercial_dominio_pago');

-- El back office ve los cobros y pagos de dominios de todas las bandas.
CREATE POLICY lectura_staff ON "comercial_dominio_cobro" FOR SELECT USING (app_es_staff());
CREATE POLICY lectura_staff ON "comercial_dominio_pago" FOR SELECT USING (app_es_staff());

-- Bandas con algo para hacer: cobros esperando el pago (se buscan sus pagos, por si un aviso se
-- perdió), compras para arrancar y devoluciones para correr. Solo ids.
CREATE FUNCTION comercial_dominios_a_revisar(p_ahora timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT "tenantId" FROM "comercial_dominio_cobro"
    WHERE "estado" = 'esperando' AND "preferenciaId" IS NOT NULL
    UNION
    SELECT "tenantId" FROM "comercial_dominio_pago"
    WHERE "entrega" = 'pendiente'
       OR ("devolucion" IN ('pendiente', 'en-proceso', 'fallida') AND "devolucionProxima" <= p_ahora)
  $$;
REVOKE ALL ON FUNCTION comercial_dominios_a_revisar(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comercial_dominios_a_revisar(timestamp) TO deoco_app;
