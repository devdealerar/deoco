-- D12: un dominio comprado en Deoco cuya banda se llevó solo el DNS (sigue registrado acá y lo
-- renueva Deoco). Como el dominio está en la subcuenta de la banda, los nameservers nuevos los pone
-- Deoco por ella (operación "dns" de la máquina). Cuando la zona se va, la fila del dominio queda
-- (para renovarlo, llevárselo o cambiar el titular) pero ya no llega a Deoco: "soloRegistro".
ALTER TABLE "dominio" ADD COLUMN "soloRegistro" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "dominio_compra" DROP CONSTRAINT "dominio_compra_tipo";
ALTER TABLE "dominio_compra" ADD CONSTRAINT "dominio_compra_tipo" CHECK ("tipo" IN ('alta', 'renovacion', 'titular', 'dns'));
