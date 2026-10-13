import { notFound } from "next/navigation";
import { consultaDe, type SearchParamsNext } from "@/nucleo/modulos/consulta";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { SuperficiePublica } from "../publico";

// Rutas del sitio público que aportan los módulos. Solo en hosts de banda.
export default async function RutaPublicaModulo({
  params,
  searchParams,
}: {
  params: Promise<{ ruta: string[] }>;
  searchParams: Promise<SearchParamsNext>;
}) {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") notFound();
  const { ruta } = await params;
  return (
    <SuperficiePublica
      tenantId={ctx.tenantId}
      path={"/" + ruta.map(decodeURIComponent).join("/")}
      consulta={consultaDe(await searchParams)}
    />
  );
}
