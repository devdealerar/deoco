-- Privacidad del WHOIS incluida en el precio: si la terminación la permite y cuánto cuesta por año
-- (se suma al precio del registro). Tabla global del gestor (la escribe el staff con conStaff).
ALTER TABLE "comercial_dominio_precio" ADD COLUMN "privacidad" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "comercial_dominio_precio" ADD COLUMN "costoPrivacidad" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "comercial_dominio_precio" ADD CONSTRAINT "comercial_dominio_precio_costo_privacidad" CHECK ("costoPrivacidad" >= 0);
