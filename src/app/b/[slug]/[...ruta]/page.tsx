import { notFound } from "next/navigation";
import { accesoPanel, exigirPermiso, prendidosDelPedido } from "@/nucleo/acceso/panel";
import { registro } from "@/nucleo/modulos";
import { MarcoPanel } from "../marco";

// Rutas de panel que aportan los módulos: /b/<slug>/<ruta del módulo>.
// Ruta no declarada o módulo apagado para la banda → 404.
export default async function RutaPanelModulo({
  params,
}: {
  params: Promise<{ slug: string; ruta: string[] }>;
}) {
  const { slug, ruta } = await params;
  const path = "/" + ruta.map(decodeURIComponent).join("/");
  const encontrada = registro().rutaPanel(path);
  if (!encontrada) notFound();

  const volver = `/b/${slug}${path}`;
  const acceso = await accesoPanel(volver); // sin sesión → login; sin membresía → 403
  if (!(await prendidosDelPedido(acceso.tenantId)).has(encontrada.moduloId)) notFound();
  if (encontrada.ruta.permiso) await exigirPermiso(encontrada.ruta.permiso, volver);

  const Componente = encontrada.ruta.componente;
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <Componente tenantId={acceso.tenantId} slug={slug} acceso={acceso} params={encontrada.params} />
    </MarcoPanel>
  );
}
