import { notFound } from "next/navigation";
import { consultaDe, type SearchParamsNext } from "@/nucleo/modulos/consulta";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { metadataPublica, SuperficiePublica } from "../publico";

type Props = { params: Promise<{ ruta: string[] }>; searchParams: Promise<SearchParamsNext> };

const pathDe = (ruta: string[]) => "/" + ruta.map(decodeURIComponent).join("/");

export async function generateMetadata({ params, searchParams }: Props) {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return {};
  return metadataPublica(ctx.tenantId, pathDe((await params).ruta), consultaDe(await searchParams));
}

// Rutas del sitio público que aportan los módulos. Solo en hosts de banda.
export default async function RutaPublicaModulo({ params, searchParams }: Props) {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") notFound();
  const { ruta } = await params;
  return (
    <SuperficiePublica
      tenantId={ctx.tenantId}
      path={pathDe(ruta)}
      consulta={consultaDe(await searchParams)}
    />
  );
}
