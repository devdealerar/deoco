-- D4: la base de fans y el newsletter van en todos los planes (los planes se distinguen por topes,
-- no por módulos: 3.2 núcleo d2). Las bandas que ya existen lo reciben cuando el gestor vuelve a
-- aplicar su plan (cambio de plan, cobro o edición del plan por el staff).
UPDATE "comercial_plan" SET "modulos" = array_append("modulos", 'fans') WHERE NOT ('fans' = ANY("modulos"));
