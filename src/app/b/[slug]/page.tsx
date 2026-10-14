import { accesoPanel } from "@/nucleo/acceso/panel";
import { MarcoPanel } from "./marco";

// Inicio del panel de una banda. Lo demás lo aportan los módulos prendidos.
export default async function PanelBanda({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await accesoPanel(`/b/${slug}`);

  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <main>
        <h1>Panel · {slug}</h1>
        <p>
          Rol: <span data-testid="rol">{acceso.rol ?? "—"}</span>
          {acceso.viaStaff && <strong data-testid="acceso-staff"> · acceso de staff</strong>}
        </p>
      </main>
    </MarcoPanel>
  );
}
