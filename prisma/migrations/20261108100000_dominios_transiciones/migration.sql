-- Dominios: vencimiento de las delegaciones sin completar y el paso de conectado (CNAME) a
-- delegado sin corte (docs/diseno-dominios.md §3.2, D4).

-- Desde cuándo está el dominio en la banda: una delegación que nadie completa vence a los 14 días.
ALTER TABLE "dominio" ADD COLUMN "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Conectado por CNAME pasándose a delegado: la zona a la que va. Mientras tanto sigue andando
-- por su custom hostname.
ALTER TABLE "dominio" ADD COLUMN "migrandoA" TEXT;
-- Ya delegado: el custom hostname que tenía, a borrar cuando el certificado de la zona esté activo.
ALTER TABLE "dominio" ADD COLUMN "hostnameViejo" TEXT;
