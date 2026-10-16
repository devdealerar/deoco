-- Privacidad del WHOIS: la compra registra el dominio con o sin privacidad según lo que se cobró
-- (incluida en el precio donde la terminación la permite). Las compras anteriores fueron sin.
ALTER TABLE "dominio_compra" ADD COLUMN "privacidad" BOOLEAN NOT NULL DEFAULT false;
