-- Módulo fans (D4): la base de contactos de cada banda y su newsletter. Todo de banda (RLS).
-- CreateTable
CREATE TABLE "fans_contacto" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "ciudad" TEXT NOT NULL DEFAULT '',
    "provincia" TEXT NOT NULL DEFAULT '',
    "origen" TEXT NOT NULL,
    "compras" INTEGER NOT NULL DEFAULT 0,
    "primeraCompraEn" TIMESTAMP(3),
    "ultimaCompraEn" TIMESTAMP(3),
    "newsletter" TEXT NOT NULL DEFAULT 'no',
    "pedidoEn" TIMESTAMP(3),
    "consentimiento" TEXT,
    "consentimientoOrigen" TEXT,
    "confirmadoEn" TIMESTAMP(3),
    "bajaEn" TIMESTAMP(3),
    "confirmarHash" TEXT,
    "confirmarCifrado" BYTEA,
    "confirmarVence" TIMESTAMP(3),
    "bajaHash" TEXT,
    "bajaCifrado" BYTEA,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fans_contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fans_compra" (
    "tenantId" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "contactoId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fans_compra_pkey" PRIMARY KEY ("tenantId","clave")
);

-- CreateTable
CREATE TABLE "fans_envio" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "creadoPor" UUID,
    "enviadoEn" TIMESTAMP(3),
    "terminadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fans_envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fans_entrega" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "envioId" UUID NOT NULL,
    "contactoId" UUID NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "enviadaEn" TIMESTAMP(3),
    "abiertaEn" TIMESTAMP(3),
    "bajaEn" TIMESTAMP(3),

    CONSTRAINT "fans_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fans_contacto_tenantId_newsletter_idx" ON "fans_contacto"("tenantId", "newsletter");

-- CreateIndex
CREATE UNIQUE INDEX "fans_contacto_tenantId_id_key" ON "fans_contacto"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fans_contacto_tenantId_email_key" ON "fans_contacto"("tenantId", "email");

-- CreateIndex
CREATE INDEX "fans_envio_tenantId_estado_idx" ON "fans_envio"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "fans_envio_tenantId_id_key" ON "fans_envio"("tenantId", "id");

-- CreateIndex
CREATE INDEX "fans_entrega_tenantId_estado_idx" ON "fans_entrega"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "fans_entrega_tenantId_enviadaEn_idx" ON "fans_entrega"("tenantId", "enviadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "fans_entrega_tenantId_id_key" ON "fans_entrega"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fans_entrega_tenantId_envioId_contactoId_key" ON "fans_entrega"("tenantId", "envioId", "contactoId");

-- AddForeignKey
ALTER TABLE "fans_compra" ADD CONSTRAINT "fans_compra_tenantId_contactoId_fkey" FOREIGN KEY ("tenantId", "contactoId") REFERENCES "fans_contacto"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fans_entrega" ADD CONSTRAINT "fans_entrega_tenantId_envioId_fkey" FOREIGN KEY ("tenantId", "envioId") REFERENCES "fans_envio"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fans_entrega" ADD CONSTRAINT "fans_entrega_tenantId_contactoId_fkey" FOREIGN KEY ("tenantId", "contactoId") REFERENCES "fans_contacto"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT deoco_aislar_tabla('fans_contacto');
SELECT deoco_aislar_tabla('fans_compra');
SELECT deoco_aislar_tabla('fans_envio');
SELECT deoco_aislar_tabla('fans_entrega');

-- Bandas con envíos en curso (para la tarea del barrido). Cruza bandas: SECURITY DEFINER y SOLO ids.
CREATE FUNCTION fans_bandas_con_envios() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT DISTINCT "tenantId" FROM "fans_envio" WHERE "estado" = 'ENVIANDO' $$;
REVOKE ALL ON FUNCTION fans_bandas_con_envios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fans_bandas_con_envios() TO deoco_app;
