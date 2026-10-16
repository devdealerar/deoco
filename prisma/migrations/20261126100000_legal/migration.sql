-- Legal y privacidad (bloque D2; docs/privacidad.md). La banda es la responsable de los datos de
-- sus fans; Deoco los trata por su cuenta (encargado). Todo con RLS por banda.

-- Lo que la política de privacidad y los términos del sitio de la banda necesitan saber de ella
-- (Ley 25.326 art. 6: identidad y domicilio del responsable, cómo ejercer los derechos).
CREATE TABLE "legal_banda" (
    "tenantId" UUID NOT NULL,
    -- Quién responde por los datos: la persona o la razón social.
    "responsable" TEXT NOT NULL DEFAULT '',
    "domicilio" TEXT NOT NULL DEFAULT '',
    -- Adónde escribe un fan por sus datos (si está vacío, el formulario del sitio).
    "emailDatos" TEXT NOT NULL DEFAULT '',
    "extraPrivacidad" TEXT NOT NULL DEFAULT '',
    "extraTerminos" TEXT NOT NULL DEFAULT '',
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_banda_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "legal_banda" ADD CONSTRAINT "legal_banda_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('legal_banda');

-- Cada texto publicado (política y términos del sitio), tal cual se mostró. Un pedido o compra
-- guarda la versión de la política que tenía a la vista.
CREATE TABLE "legal_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    -- privacidad | terminos
    "tipo" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contenido" TEXT NOT NULL,
    "publicadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_version_tipo" CHECK ("tipo" IN ('privacidad', 'terminos'))
);
CREATE UNIQUE INDEX "legal_version_tenantId_tipo_version_key" ON "legal_version"("tenantId", "tipo", "version");
ALTER TABLE "legal_version" ADD CONSTRAINT "legal_version_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('legal_version');

-- Lo que la banda aceptó de Deoco (términos del servicio, contrato de encargo de tratamiento):
-- quién, qué versión y cuándo. Solo se agrega.
CREATE TABLE "aceptacion_legal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    -- terminos-deoco | encargo-tratamiento
    "documento" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "aceptadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aceptacion_legal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "aceptacion_legal_tenantId_documento_idx" ON "aceptacion_legal"("tenantId", "documento");
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('aceptacion_legal');
REVOKE UPDATE, DELETE ON "aceptacion_legal" FROM deoco_app;

-- Consentimiento de cookies de cada visitante del sitio de una banda: qué aceptó y cuándo. Una
-- fila por decisión (aceptar, rechazar, cambiar, revocar): la última manda. Sin IP ni datos de la
-- persona: un id al azar que vive en la cookie del sitio.
CREATE TABLE "consentimiento_cookies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "visitante" UUID NOT NULL,
    "analitica" BOOLEAN NOT NULL,
    "marketing" BOOLEAN NOT NULL,
    -- La versión del aviso de cookies que vio.
    "version" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consentimiento_cookies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consentimiento_cookies_tenantId_visitante_idx" ON "consentimiento_cookies"("tenantId", "visitante", "creadoEn");
ALTER TABLE "consentimiento_cookies" ADD CONSTRAINT "consentimiento_cookies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('consentimiento_cookies');
REVOKE UPDATE, DELETE ON "consentimiento_cookies" FROM deoco_app;

-- Pedidos de un fan sobre sus datos (Ley 25.326 arts. 14 y 16; LGPD art. 18) y el botón de
-- arrepentimiento (Defensa del Consumidor). Con su vencimiento legal calculado.
CREATE TABLE "pedido_datos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    -- acceso | rectificacion | supresion | oposicion | arrepentimiento
    "tipo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "detalle" TEXT NOT NULL DEFAULT '',
    -- sin-verificar (el fan no confirmó el mail) | abierto | resuelto | rechazado
    "estado" TEXT NOT NULL DEFAULT 'sin-verificar',
    "tokenHash" TEXT,
    "verificadoEn" TIMESTAMP(3),
    "venceEn" TIMESTAMP(3),
    "respuesta" TEXT,
    "respondidoEn" TIMESTAMP(3),
    "respondidoPor" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pedido_datos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pedido_datos_tipo" CHECK ("tipo" IN ('acceso', 'rectificacion', 'supresion', 'oposicion', 'arrepentimiento')),
    CONSTRAINT "pedido_datos_estado" CHECK ("estado" IN ('sin-verificar', 'abierto', 'resuelto', 'rechazado'))
);
CREATE INDEX "pedido_datos_tenantId_estado_idx" ON "pedido_datos"("tenantId", "estado");
ALTER TABLE "pedido_datos" ADD CONSTRAINT "pedido_datos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('pedido_datos');

-- Emails que pidieron la supresión, en hash (sha256 del email por banda): si se restaura una
-- copia anterior, la supresión se vuelve a aplicar; y la newsletter no los vuelve a sumar.
CREATE TABLE "supresion_datos" (
    "tenantId" UUID NOT NULL,
    "emailHash" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supresion_datos_pkey" PRIMARY KEY ("tenantId", "emailHash")
);
ALTER TABLE "supresion_datos" ADD CONSTRAINT "supresion_datos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('supresion_datos');
