-- CreateEnum
CREATE TYPE "SitioTipografia" AS ENUM ('SANS', 'SERIF', 'MONO');

-- CreateEnum
CREATE TYPE "SitioTipoLink" AS ENUM ('RED', 'ESCUCHA');

-- CreateEnum
CREATE TYPE "SitioTipoDescargable" AS ENUM ('FOTO', 'LOGO');

-- CreateTable
CREATE TABLE "sitio_perfil" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "logoArchivoId" UUID,
    "fondoArchivoId" UUID,
    "colorFondo" TEXT,
    "colorAcento" TEXT NOT NULL DEFAULT '#6941c6',
    "tipografia" "SitioTipografia" NOT NULL DEFAULT 'SANS',
    "bioCorta" TEXT NOT NULL DEFAULT '',
    "bioLarga" TEXT NOT NULL DEFAULT '',
    "riderArchivoId" UUID,
    "prensaNombre" TEXT NOT NULL DEFAULT '',
    "prensaEmail" TEXT NOT NULL DEFAULT '',
    "prensaTelefono" TEXT NOT NULL DEFAULT '',
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sitio_perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitio_slide" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "archivoId" UUID NOT NULL,
    "textoAlt" TEXT NOT NULL DEFAULT '',
    "orden" INTEGER NOT NULL,

    CONSTRAINT "sitio_slide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitio_fecha" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "link" TEXT,

    CONSTRAINT "sitio_fecha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitio_link" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tipo" "SitioTipoLink" NOT NULL,
    "plataforma" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "sitio_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitio_descargable" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tipo" "SitioTipoDescargable" NOT NULL,
    "archivoId" UUID NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "orden" INTEGER NOT NULL,

    CONSTRAINT "sitio_descargable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sitio_perfil_tenantId_key" ON "sitio_perfil"("tenantId");

-- CreateIndex
CREATE INDEX "sitio_slide_tenantId_orden_idx" ON "sitio_slide"("tenantId", "orden");

-- CreateIndex
CREATE INDEX "sitio_fecha_tenantId_fecha_idx" ON "sitio_fecha"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "sitio_link_tenantId_orden_idx" ON "sitio_link"("tenantId", "orden");

-- CreateIndex
CREATE INDEX "sitio_descargable_tenantId_tipo_orden_idx" ON "sitio_descargable"("tenantId", "tipo", "orden");


-- Aislamiento por banda (RLS + política + permisos).
SELECT deoco_aislar_tabla('sitio_perfil');
SELECT deoco_aislar_tabla('sitio_slide');
SELECT deoco_aislar_tabla('sitio_fecha');
SELECT deoco_aislar_tabla('sitio_link');
SELECT deoco_aislar_tabla('sitio_descargable');
