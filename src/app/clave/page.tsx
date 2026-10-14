import { redirect } from "next/navigation";
import { exigirPlataforma, usuarioDeSesion } from "@/nucleo/acceso/panel";
import { usuarioPropio } from "@/nucleo/acceso/usuario";
import { LARGO_MINIMO_CLAVE } from "@/nucleo/auth/clave";
import { Campo, Formulario, Tarjeta } from "@/ui";
import { BotonSalir } from "../salir";
import { guardarClave } from "./acciones";

// Cambio de clave. Con clave temporal es obligatorio: el resto de la plataforma manda acá.
export default async function Clave({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  await exigirPlataforma();
  const usuarioId = await usuarioDeSesion();
  if (!usuarioId) redirect("/ingresar?volver=/clave");
  const usuario = await usuarioPropio(usuarioId);
  const { volver = "/" } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-4">
      <Tarjeta
        titulo={usuario?.claveTemporal ? "Elegí tu clave" : "Cambiar clave"}
        descripcion={
          usuario?.claveTemporal
            ? `Entraste con una clave temporal. Antes de seguir, elegí la tuya (${usuario.email}).`
            : `Cuenta ${usuario?.email}.`
        }
      >
        <Formulario accion={guardarClave.bind(null, volver)} puedeEditar etiqueta="Guardar clave">
          <Campo name="actual" type="password" etiqueta={usuario?.claveTemporal ? "Clave temporal" : "Clave actual"} required />
          <Campo name="nueva" type="password" etiqueta="Clave nueva" required ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres.`} />
          <Campo name="repetida" type="password" etiqueta="Repetí la clave nueva" required />
        </Formulario>
      </Tarjeta>
      <BotonSalir />
    </main>
  );
}
