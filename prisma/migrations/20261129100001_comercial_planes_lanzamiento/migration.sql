-- El organizador de lanzamientos va en todos los planes (los planes se distinguen por topes).
UPDATE "comercial_plan" SET "modulos" = array_append("modulos", 'lanzamiento') WHERE NOT ('lanzamiento' = ANY("modulos"));
