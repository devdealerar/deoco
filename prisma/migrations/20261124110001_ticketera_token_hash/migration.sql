-- El token de acceso del fan (link del mail, cookie) ya no se guarda en claro: su hash para
-- comprobarlo y su cifrado (AES-256-GCM, DEOCO_CLAVE_SECRETOS) para volver a armar el link.
ALTER TABLE "ticketera_compra" ADD COLUMN "tokenHash" TEXT;
UPDATE "ticketera_compra" SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
ALTER TABLE "ticketera_compra" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "ticketera_compra" ADD COLUMN "tokenCifrado" BYTEA;
ALTER TABLE "ticketera_compra" DROP COLUMN "token";
