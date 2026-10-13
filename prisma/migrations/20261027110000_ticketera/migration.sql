-- Módulo ticketera.
CREATE TYPE "TicketeraEstadoCompra" AS ENUM ('RESERVADA', 'PAGADA', 'VENCIDA', 'EN_REVISION');

CREATE TABLE "ticketera_evento" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "direccion" TEXT NOT NULL DEFAULT '',
    "descripcion" TEXT NOT NULL DEFAULT '',
    "fotoArchivoId" UUID,
    "fotoNombre" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticketera_evento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ticketera_evento_tenantId_id_key" ON "ticketera_evento"("tenantId", "id");
CREATE INDEX "ticketera_evento_tenantId_fecha_idx" ON "ticketera_evento"("tenantId", "fecha");

CREATE TABLE "ticketera_tipo" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "eventoId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "cupo" INTEGER NOT NULL,
    "ocupadas" INTEGER NOT NULL DEFAULT 0,
    "ventaDesde" TIMESTAMP(3),
    "ventaHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticketera_tipo_pkey" PRIMARY KEY ("id"),
    -- El cupo lo garantiza la base: dos compras a la vez no lo pasan.
    CONSTRAINT "ticketera_tipo_cupo" CHECK ("ocupadas" >= 0 AND "ocupadas" <= "cupo"),
    CONSTRAINT "ticketera_tipo_precio" CHECK ("precio" > 0 AND "cupo" >= 0)
);
CREATE UNIQUE INDEX "ticketera_tipo_tenantId_id_key" ON "ticketera_tipo"("tenantId", "id");
CREATE INDEX "ticketera_tipo_tenantId_eventoId_idx" ON "ticketera_tipo"("tenantId", "eventoId");
ALTER TABLE "ticketera_tipo" ADD CONSTRAINT "ticketera_tipo_tenantId_eventoId_fkey" FOREIGN KEY ("tenantId", "eventoId") REFERENCES "ticketera_evento"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticketera_compra" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "eventoId" UUID NOT NULL,
    "tipoId" UUID NOT NULL,
    "estado" "TicketeraEstadoCompra" NOT NULL DEFAULT 'RESERVADA',
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "asistentes" JSONB NOT NULL,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "pasarela" TEXT,
    "preferenciaId" TEXT,
    "urlPago" TEXT,
    "cobroId" TEXT,
    "estadoCobro" TEXT,
    "pagadaEn" TIMESTAMP(3),
    "observacion" TEXT,
    "token" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticketera_compra_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticketera_compra_cantidad" CHECK ("cantidad" > 0)
);
CREATE UNIQUE INDEX "ticketera_compra_tenantId_id_key" ON "ticketera_compra"("tenantId", "id");
CREATE INDEX "ticketera_compra_tenantId_tipoId_estado_idx" ON "ticketera_compra"("tenantId", "tipoId", "estado");
ALTER TABLE "ticketera_compra" ADD CONSTRAINT "ticketera_compra_tenantId_eventoId_fkey" FOREIGN KEY ("tenantId", "eventoId") REFERENCES "ticketera_evento"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticketera_compra" ADD CONSTRAINT "ticketera_compra_tenantId_tipoId_fkey" FOREIGN KEY ("tenantId", "tipoId") REFERENCES "ticketera_tipo"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ticketera_entrada" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "compraId" UUID NOT NULL,
    "eventoId" UUID NOT NULL,
    "tipoId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "validadaEn" TIMESTAMP(3),
    "validadaPor" UUID,
    "validadaIntento" TEXT,
    CONSTRAINT "ticketera_entrada_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ticketera_entrada_tenantId_codigo_key" ON "ticketera_entrada"("tenantId", "codigo");
CREATE INDEX "ticketera_entrada_tenantId_eventoId_idx" ON "ticketera_entrada"("tenantId", "eventoId");
ALTER TABLE "ticketera_entrada" ADD CONSTRAINT "ticketera_entrada_tenantId_compraId_fkey" FOREIGN KEY ("tenantId", "compraId") REFERENCES "ticketera_compra"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticketera_entrada" ADD CONSTRAINT "ticketera_entrada_tenantId_eventoId_fkey" FOREIGN KEY ("tenantId", "eventoId") REFERENCES "ticketera_evento"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticketera_entrada" ADD CONSTRAINT "ticketera_entrada_tenantId_tipoId_fkey" FOREIGN KEY ("tenantId", "tipoId") REFERENCES "ticketera_tipo"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT deoco_aislar_tabla('ticketera_evento');
SELECT deoco_aislar_tabla('ticketera_tipo');
SELECT deoco_aislar_tabla('ticketera_compra');
SELECT deoco_aislar_tabla('ticketera_entrada');
