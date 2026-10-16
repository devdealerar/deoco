-- El token de acceso del fan (link del mail, cookie) ya no se guarda en claro: su hash para
-- comprobarlo y su cifrado (AES-256-GCM, DEOCO_CLAVE_SECRETOS) para volver a armar el link.
ALTER TABLE "tienda_pedido" ADD COLUMN "tokenHash" TEXT;
UPDATE "tienda_pedido" SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
ALTER TABLE "tienda_pedido" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "tienda_pedido" ADD COLUMN "tokenCifrado" BYTEA;
ALTER TABLE "tienda_pedido" DROP COLUMN "token";
