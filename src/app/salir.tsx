import { Boton } from "@/ui";
import { salir } from "./ingresar/acciones";

export function BotonSalir() {
  return (
    <form action={salir}>
      <Boton type="submit" variante="enlaceGris">
        Salir
      </Boton>
    </form>
  );
}
