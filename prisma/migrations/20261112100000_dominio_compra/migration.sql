-- Compra de dominios (docs/diseno-dominios.md §8, D8): la máquina de estados que, una vez pagado,
-- registra el dominio a nombre del titular, crea su zona, pone los nameservers y espera que se
-- active; y la renovación. Cada compra avanza paso a paso desde el barrido: si Deoco se reinicia,
-- retoma desde el último paso confirmado. Nunca se registra antes de cobrar ni dos veces.

-- La subcuenta de la banda en el registrador (una por banda y registrador).
CREATE TABLE "registrador_cliente" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "registrador" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registrador_cliente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "registrador_cliente_tenantId_registrador_key" ON "registrador_cliente"("tenantId", "registrador");
ALTER TABLE "registrador_cliente" ADD CONSTRAINT "registrador_cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('registrador_cliente');

CREATE TABLE "dominio_compra" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    -- Quién la pidió (el titular): con su nombre queda en la auditoría.
    "usuarioId" UUID,
    "tipo" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "registrador" TEXT NOT NULL,
    "anios" INTEGER NOT NULL DEFAULT 1,
    -- El titular registral y la aceptación de las condiciones (fecha, IP, claves).
    "contacto" JSONB NOT NULL DEFAULT '{}',
    "aceptacion" JSONB NOT NULL DEFAULT '{}',
    "hacerPrincipal" BOOLEAN NOT NULL DEFAULT false,
    -- El cobro del gestor de cuenta que la pagó (idempotencia: un cobro, una compra).
    "cobroId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'en-curso',
    "paso" TEXT NOT NULL,
    -- La operación del registrador en curso ({ id, estado }), para volver a consultarla.
    "operacion" JSONB,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "primerFalloEn" TIMESTAMP(3),
    "error" TEXT,
    -- Por qué falló o espera: no-disponible | sin-saldo | datos-invalidos | temporal | desconocido.
    "motivo" TEXT,
    -- datos-invalidos: el dato del titular a revisar.
    "campo" TEXT,
    -- Sin registrar y sin vuelta: el gestor devuelve el pago (pendiente | hecha).
    "devolucion" TEXT,
    "venceEn" TIMESTAMP(3),
    "tomadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoEn" TIMESTAMP(3),
    CONSTRAINT "dominio_compra_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dominio_compra_tipo" CHECK ("tipo" IN ('alta', 'renovacion')),
    CONSTRAINT "dominio_compra_estado" CHECK ("estado" IN ('en-curso', 'datos', 'listo', 'fallido')),
    CONSTRAINT "dominio_compra_devolucion" CHECK ("devolucion" IS NULL OR "devolucion" IN ('pendiente', 'hecha'))
);
CREATE UNIQUE INDEX "dominio_compra_tenantId_cobroId_key" ON "dominio_compra"("tenantId", "cobroId");
CREATE INDEX "dominio_compra_pendientes" ON "dominio_compra"("proximoIntento") WHERE "estado" = 'en-curso';
ALTER TABLE "dominio_compra" ADD CONSTRAINT "dominio_compra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SELECT deoco_aislar_tabla('dominio_compra');

-- Un dominio comprado en Deoco: su zona la maneja la compra (no vence como una delegación, y
-- llevárselo es con el código de transferencia, D11).
ALTER TABLE "dominio" ADD COLUMN "comprado" BOOLEAN NOT NULL DEFAULT false;

-- Bandas con compras para avanzar ya. Solo ids. (Archivadas también: lo pagado se termina.)
CREATE FUNCTION bandas_con_compras_pendientes(p_ahora timestamp) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT "tenantId" FROM "dominio_compra"
    WHERE "estado" = 'en-curso' AND "proximoIntento" <= p_ahora
  $$;
REVOKE ALL ON FUNCTION bandas_con_compras_pendientes(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bandas_con_compras_pendientes(timestamp) TO deoco_app;
