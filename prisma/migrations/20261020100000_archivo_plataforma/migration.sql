-- CreateTable
CREATE TABLE "archivo_plataforma" (
    "id" UUID NOT NULL,
    "moduloId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "variantes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivo_plataforma_pkey" PRIMARY KEY ("id")
);


-- Global: todos leen, solo el staff escribe (conStaff).
SELECT deoco_tabla_global('archivo_plataforma');
