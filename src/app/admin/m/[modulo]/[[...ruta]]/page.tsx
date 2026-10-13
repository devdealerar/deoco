import { notFound } from "next/navigation";
import { registro } from "@/nucleo/modulos";
import { consultaDe, type SearchParamsNext } from "@/nucleo/modulos/consulta";
import { exigirStaff } from "../../../_servidor/acceso";

// Pantallas que los módulos aportan al back office (rutasAdmin): /admin/m/<id><ruta>.
// Solo staff (404 si no). No están atadas a una banda: el staff ve todo.
export default async function RutaAdminModulo({
  params,
  searchParams,
}: {
  params: Promise<{ modulo: string; ruta?: string[] }>;
  searchParams: Promise<SearchParamsNext>;
}) {
  const { usuarioId } = await exigirStaff();
  const { modulo, ruta = [] } = await params;
  const encontrada = registro().rutaAdmin(modulo, "/" + ruta.map(decodeURIComponent).join("/"));
  if (!encontrada) notFound();
  const Componente = encontrada.ruta.componente;
  return <Componente usuarioId={usuarioId} params={encontrada.params} consulta={consultaDe(await searchParams)} />;
}
