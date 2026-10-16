-- Newsletter (D4): la baja en un clic desde el cliente de correo (List-Unsubscribe, RFC 8058).
ALTER TABLE "correo" ADD COLUMN "cabeceras" JSONB NOT NULL DEFAULT '{}';
