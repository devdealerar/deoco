-- CreateEnum
CREATE TYPE "EstadoEvento" AS ENUM ('PENDIENTE', 'PROCESADO', 'FALLIDO');

-- AlterTable
ALTER TABLE "evento" ADD COLUMN     "estado" "EstadoEvento" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "fallos" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "intentos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "procesadoEn" TIMESTAMP(3),
ADD COLUMN     "secuencia" BIGSERIAL NOT NULL,
ADD COLUMN     "soloPara" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "evento_secuencia_key" ON "evento"("secuencia");

-- CreateIndex
CREATE INDEX "evento_tenantId_estado_secuencia_idx" ON "evento"("tenantId", "estado", "secuencia");


-- La app inserta eventos: necesita usar la secuencia.
GRANT USAGE ON SEQUENCE "evento_secuencia_seq" TO deoco_app;
-- Las secuencias que creen migraciones futuras (de módulos) también.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO deoco_app;
