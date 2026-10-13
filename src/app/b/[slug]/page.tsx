import Link from "next/link";
import { accesoPanel } from "@/nucleo/acceso/panel";
import { BotonSalir } from "../../salir";

// Panel de una banda. Vacío: lo llenan los módulos (registro de módulos, parte 4).
export default async function PanelBanda({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await accesoPanel(`/b/${slug}`);

  return (
    <main>
      <h1>Panel · {slug}</h1>
      {acceso.estado === "MOROSO" && acceso.rol === "TITULAR" && (
        <p role="alert" data-testid="aviso-mora">
          Hay una cuota pendiente. <Link href={`/b/${slug}/pago`}>Pagar</Link>
        </p>
      )}
      <p>
        Rol: <span data-testid="rol">{acceso.rol ?? "—"}</span>
        {acceso.viaStaff && <strong data-testid="acceso-staff"> · acceso de staff</strong>}
      </p>
      <Link href="/">Mis bandas</Link>
      <BotonSalir />
    </main>
  );
}
