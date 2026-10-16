import { redirect } from "next/navigation";
import { exigirPlataforma, usuarioActivo } from "@/nucleo/acceso/panel";
import { yaCreoBanda } from "@/nucleo/autogestion";
import { opcionesDeAlta } from "@/nucleo/cuenta";
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import { Aviso, Boton, Campo, Casilla, Formulario, Selector, Tarjeta } from "@/ui";
import { crearBandaAccion } from "../acciones";

// Crear la banda (autogestión): nombre, subdominio y, si el gestor de cuenta ofrece, prueba o plan.
export default async function CrearBanda() {
  await exigirPlataforma();
  const usuarioId = await usuarioActivo();
  if (!usuarioId) redirect("/ingresar?volver=/registro/banda");
  const [ya, opciones] = await Promise.all([yaCreoBanda(usuarioId), opcionesDeAlta()]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-8">
        <span className="text-center text-display-sm font-bold tracking-tight text-primary">deoco</span>
        <Tarjeta titulo="Creá tu banda" descripcion="Elegí el nombre y la dirección de tu sitio. Queda en línea enseguida y lo armás desde el panel.">
          {ya ? (
            <>
              <Aviso tono="info">Tu cuenta ya creó una banda. Para sumar otra, escribinos.</Aviso>
              <Boton href="/">Ir a mis bandas</Boton>
            </>
          ) : (
            <Formulario accion={crearBandaAccion} puedeEditar etiqueta="Crear banda">
              <Campo name="nombre" etiqueta="Nombre de la banda" required maxLength={80} />
              <Campo
                name="subdominio"
                etiqueta="Subdominio"
                required
                maxLength={40}
                placeholder="labanda"
                ayuda={`Así queda la dirección de tu sitio: labanda.${dominioRaiz()}. Solo minúsculas, números y guiones.`}
              />
              {opciones.length > 0 && <Selector name="opcion" etiqueta="Cómo empezás" opciones={opciones.map((o) => ({ valor: o.valor, texto: o.texto }))} />}
              {opciones.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm text-tertiary">
                  {opciones.map((o) => o.detalle && <li key={o.valor}>{`${o.texto}: ${o.detalle}`}</li>)}
                </ul>
              )}
              <Casilla name="acepto" etiqueta="Leí y acepto los términos del servicio (/terminos) y el contrato de encargo de tratamiento de datos (/encargo)" />
            </Formulario>
          )}
        </Tarjeta>
      </div>
    </main>
  );
}
