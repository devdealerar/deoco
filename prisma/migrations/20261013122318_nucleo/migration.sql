-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('TITULAR', 'EDITOR', 'COMERCIAL', 'PUERTA', 'LECTURA');

-- CreateEnum
CREATE TYPE "EstadoTenant" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hashContrasena" TEXT NOT NULL,
    "esStaff" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "estado" "EstadoTenant" NOT NULL DEFAULT 'ACTIVO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "rol" "Rol" NOT NULL,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dominio" (
    "id" UUID NOT NULL,
    "dominio" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "verificado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moduloTenant" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "moduloId" TEXT NOT NULL,

    CONSTRAINT "moduloTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "usuarioId" UUID,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateIndex
CREATE INDEX "membresia_tenantId_idx" ON "membresia"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "membresia_usuarioId_tenantId_key" ON "membresia"("usuarioId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "dominio_dominio_key" ON "dominio"("dominio");

-- CreateIndex
CREATE INDEX "dominio_tenantId_idx" ON "dominio"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "moduloTenant_tenantId_moduloId_key" ON "moduloTenant"("tenantId", "moduloId");

-- CreateIndex
CREATE INDEX "evento_tenantId_nombre_idx" ON "evento"("tenantId", "nombre");

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dominio" ADD CONSTRAINT "dominio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moduloTenant" ADD CONSTRAINT "moduloTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
