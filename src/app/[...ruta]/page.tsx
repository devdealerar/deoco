import { notFound } from "next/navigation";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { SitioPublico } from "../sitio";

// Rutas del sitio público que aportan los módulos. Solo en hosts de banda.
export default async function RutaPublicaModulo({ params }: { params: Promise<{ ruta: string[] }> }) {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "sitio") notFound();
  const { ruta } = await params;
  return <SitioPublico tenantId={ctx.tenantId} path={"/" + ruta.map(decodeURIComponent).join("/")} />;
}
