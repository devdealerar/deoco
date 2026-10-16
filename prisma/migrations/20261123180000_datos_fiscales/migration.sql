-- Datos fiscales de la banda (3.2, fiscal d1: desde la primera venta, cada orden guarda la
-- condición fiscal del vendedor, la identificación del comprador y los impuestos
-- discriminados). Todavía no hay facturación ni pantalla: se guardan para que ninguna venta de
-- hoy quede sin poder facturarse mañana. Sin fila: "sin declarar".
CREATE TABLE "datos_fiscales" (
    "tenantId" UUID NOT NULL,
    -- responsable_inscripto | monotributo | exento | sin_declarar
    "condicion" TEXT NOT NULL DEFAULT 'sin_declarar',
    "cuit" TEXT,
    "razonSocial" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "datos_fiscales_pkey" PRIMARY KEY ("tenantId"),
    CONSTRAINT "datos_fiscales_condicion" CHECK ("condicion" IN ('responsable_inscripto', 'monotributo', 'exento', 'sin_declarar')),
    CONSTRAINT "datos_fiscales_cuit" CHECK ("cuit" IS NULL OR "cuit" ~ '^[0-9]{11}$')
);
ALTER TABLE "datos_fiscales" ADD CONSTRAINT "datos_fiscales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('datos_fiscales');
