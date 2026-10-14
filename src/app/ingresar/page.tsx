import { exigirPlataforma } from "@/nucleo/acceso/panel";
import { Aviso, Boton, Campo, Tarjeta } from "@/ui";
import { ingresar } from "./acciones";

// Ingreso al panel. Formulario común (sin JavaScript también entra): la acción redirige a
// `volver` o, si falla, de nuevo acá con `?error=1`.
export default async function Ingresar({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; error?: string }>;
}) {
  await exigirPlataforma();
  const { volver = "/", error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <span className="text-center text-display-sm font-bold tracking-tight text-primary">deoco</span>
        <Tarjeta titulo="Ingresá a tu panel">
          {error && (
            <Aviso tono="error" titulo="Email o contraseña incorrectos.">
              Revisá los dos y probá de nuevo.
            </Aviso>
          )}
          <form action={ingresar} className="flex flex-col gap-5">
            <input type="hidden" name="volver" value={volver} />
            <Campo name="email" type="email" etiqueta="Email" autoComplete="username" required />
            <Campo name="contrasena" type="password" etiqueta="Contraseña" autoComplete="current-password" required />
            <Boton type="submit" tamano="md">
              Ingresar
            </Boton>
          </form>
        </Tarjeta>
      </div>
    </main>
  );
}
