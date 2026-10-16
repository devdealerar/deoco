-- Un pedido devuelto (o contracargado) después de mandarse a producir queda para que la banda lo
-- resuelva con el proveedor. Ahora la banda lo marca resuelto, con una nota: deja de figurar como
-- pendiente (en el panel y en el inicio) y queda el registro.
ALTER TABLE "tienda_pedido" ADD COLUMN "resueltoConProveedorEn" TIMESTAMP(3), ADD COLUMN "resueltoConProveedorNota" TEXT;
