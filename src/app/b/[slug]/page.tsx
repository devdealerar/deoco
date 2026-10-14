import Link from "next/link";
import { accesoPanel } from "@/nucleo/acceso/panel";
import { Aviso } from "@/ui";
import { MarcoPanel } from "./marco";

// Inicio del panel de una banda. Lo demás lo aportan los módulos prendidos.
export default async function PanelBanda({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await accesoPanel(`/b/${slug}`);

  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <main>
        <h1>Panel · {slug}</h1>
        {acceso.estado === "MOROSO" && acceso.rol === "TITULAR" && (
          <Aviso titulo="Hay una cuota pendiente." data-testid="aviso-mora">
            <Link href={`/b/${slug}/pago`} className="font-semibold underline">
              Pagar
            </Link>
          </Aviso>
        )}
        <p>
          Rol: <span data-testid="rol">{acceso.rol ?? "—"}</span>
          {acceso.viaStaff && <strong data-testid="acceso-staff"> · acceso de staff</strong>}
        </p>
      </main>
    </MarcoPanel>
  );
}
