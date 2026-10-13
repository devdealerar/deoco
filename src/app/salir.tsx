import { salir } from "./ingresar/acciones";

export function BotonSalir() {
  return (
    <form action={salir}>
      <button type="submit" className="text-sm font-semibold text-tertiary hover:text-secondary">
        Salir
      </button>
    </form>
  );
}
