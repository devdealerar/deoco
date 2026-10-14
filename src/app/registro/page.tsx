import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirPlataforma, usuarioDeSesion } from "@/nucleo/acceso/panel";
import { LARGO_MINIMO_CLAVE } from "@/nucleo/auth/clave";
import { Campo, Formulario, Tarjeta } from "@/ui";
import { registrarseAccion } from "./acciones";

// Crear una cuenta (autogestión): nombre, email y contraseña. El usuario recién existe cuando
// abre el link del mail (/registro/verificar).
export default async function Registro() {
  await exigirPlataforma();
  if (await usuarioDeSesion()) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <span className="text-center text-display-sm font-bold tracking-tight text-primary">deoco</span>
        <Tarjeta titulo="Creá tu cuenta" descripcion="Después confirmás tu email y armás tu banda.">
          <Formulario accion={registrarseAccion} puedeEditar etiqueta="Crear cuenta">
            <Campo name="nombre" etiqueta="Tu nombre" autoComplete="name" required maxLength={80} />
            <Campo name="email" type="email" etiqueta="Email" autoComplete="email" required />
            <Campo name="contrasena" type="password" etiqueta="Contraseña" autoComplete="new-password" required ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres.`} />
            <Campo name="repetida" type="password" etiqueta="Repetí la contraseña" autoComplete="new-password" required />
            {/* Trampa para bots: una persona no lo ve ni lo llena. */}
            <div className="hidden" aria-hidden="true">
              <Campo name="sitio_web" etiqueta="Sitio web" autoComplete="off" />
            </div>
          </Formulario>
        </Tarjeta>
        <p className="text-center text-sm text-tertiary">
          ¿Ya tenés cuenta?{" "}
          <Link href="/ingresar" className="font-semibold text-brand-secondary">
            Ingresá
          </Link>
        </p>
      </div>
    </main>
  );
}
