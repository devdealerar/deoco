-- Módulo manager (3.2, etapa 2; plan Sello): los sellos o representantes (globales, los da el staff).
-- Sus personas son cuentas externas del módulo (referencia = el sello). Las bandas del roster son las
-- que los invitan a su equipo: nada de esta tabla da acceso a una banda.
CREATE TABLE "manager_sello" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "manager_sello_pkey" PRIMARY KEY ("id")
);
SELECT deoco_tabla_global('manager_sello');
