-- Adjuntos de un correo (p. ej. los QR de las entradas, embebidos con cid:). En base64.
ALTER TABLE "correo" ADD COLUMN "adjuntos" JSONB NOT NULL DEFAULT '[]';
