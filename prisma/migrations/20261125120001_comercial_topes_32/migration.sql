-- La grilla con los topes nuevos (docs/planes.md). Imágenes: 30 / 150 / 600 (Sello, por banda).
-- Entradas por mes (solo mide): 200 / 2.000 / 10.000.
UPDATE "comercial_plan" SET "topes" = '{"tienda.productos-publicados": 5, "ticketera.shows-por-mes": 1, "ticketera.entradas-por-mes": 200, "sitio.imagenes": 30}' WHERE "id" = 'demo';
UPDATE "comercial_plan" SET "topes" = '{"tienda.productos-publicados": 30, "ticketera.shows-por-mes": 6, "ticketera.entradas-por-mes": 2000, "sitio.imagenes": 150}' WHERE "id" = 'escenario';
UPDATE "comercial_plan" SET "topes" = '{"tienda.productos-publicados": 100, "ticketera.shows-por-mes": 20, "ticketera.entradas-por-mes": 10000, "sitio.imagenes": 600}' WHERE "id" = 'gira';
UPDATE "comercial_plan" SET "topes" = '{"tienda.productos-publicados": 100, "ticketera.shows-por-mes": 20, "ticketera.entradas-por-mes": 10000, "sitio.imagenes": 600}' WHERE "id" = 'sello';
