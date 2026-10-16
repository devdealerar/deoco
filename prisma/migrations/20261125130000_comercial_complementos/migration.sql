-- Complementos sueltos (3.2 núcleo d6: "un evento puntual que excede el plan → complemento suelto
-- en lugar de cambio de plan"). El staff los define; la banda los compra desde Plan y pago, con un
-- pago único a la cuenta de Deoco (es lo que la banda le paga a Deoco por su servicio: la
-- excepción de td3). Suman a un tope por un mes (o varios) con `limite_extra`.
CREATE TABLE "comercial_complemento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    -- Centavos de peso.
    "precio" INTEGER NOT NULL,
    -- El límite al que suma ("ticketera.shows-por-mes").
    "limite" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    -- Cuántos meses calendario dura, desde el que elige la banda.
    "meses" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comercial_complemento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comercial_complemento_id" CHECK ("id" ~ '^[a-z0-9-]{2,40}$'),
    CONSTRAINT "comercial_complemento_numeros" CHECK ("precio" > 0 AND "cantidad" > 0 AND "meses" BETWEEN 1 AND 12)
);
SELECT deoco_tabla_global('comercial_complemento');

-- El cobro único de Deoco (el de los dominios: pago inmediato, monto exacto, devoluciones con
-- reintentos y alerta al staff) sirve también para un complemento: tipo "complemento".
ALTER TABLE "comercial_dominio_cobro" DROP CONSTRAINT "comercial_dominio_cobro_tipo";
ALTER TABLE "comercial_dominio_cobro" ADD CONSTRAINT "comercial_dominio_cobro_tipo" CHECK ("tipo" IN ('alta', 'renovacion', 'complemento'));

-- Los de arranque (los precios los ajusta el staff).
INSERT INTO "comercial_complemento" ("id", "nombre", "descripcion", "precio", "limite", "cantidad", "meses", "orden") VALUES
  ('show-extra', 'Un show más este mes', 'Para una fecha puntual que se pasa de tu plan, sin cambiar de plan.', 500000, 'ticketera.shows-por-mes', 1, 1, 1),
  ('entradas-1000', '1.000 entradas más', 'Para un mes con una venta grande.', 800000, 'ticketera.entradas-por-mes', 1000, 1, 2);
