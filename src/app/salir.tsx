import { salir } from "./ingresar/acciones";

export function BotonSalir() {
  return (
    <form action={salir}>
      <button type="submit">Salir</button>
    </form>
  );
}
