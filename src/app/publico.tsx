import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { resolverMetadatos } from "@/nucleo/modulos/metadatos";
import { pestanasSitio } from "@/nucleo/modulos/navegacion";

/** Origen del pedido (`https://labanda.com`): base de las URLs absolutas de la vista previa. */
async function origen(): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (process.env.NODE_ENV === "production" ? "https" : "http");
  return new URL(`${proto}://${h.get("host")}`);
}

/** <title>, descripción y Open Graph de una página pública: de la banda, nunca de Deoco. */
export async function metadataPublica(tenantId: string, path: string, consulta: URLSearchParams): Promise<Metadata> {
  const m = await resolverMetadatos(tenantId, path, consulta);
  const imagenes = m.imagen ? [m.imagen] : undefined;
  return {
    metadataBase: await origen(),
    title: { absolute: m.titulo },
    description: m.descripcion,
    openGraph: { type: "website", siteName: m.banda, title: m.titulo, description: m.descripcion, url: path, images: imagenes },
    twitter: { card: m.imagen ? "summary_large_image" : "summary", title: m.titulo, description: m.descripcion, images: imagenes },
  };
}

/**
 * Superficie pública de una banda (anónima: no lee sesión). Pestañas = entradas
 * públicas de los módulos prendidos. Ruta no declarada o módulo apagado → 404.
 * El marco lo aporta un módulo (`marcoPublico`) si está prendido; si no, uno neutro.
 */
export async function SuperficiePublica({
  tenantId,
  path,
  consulta,
}: {
  tenantId: string;
  path: string;
  consulta: URLSearchParams;
}) {
  const reg = registro();
  const prendidos = await modulosPrendidos(tenantId, reg);
  const encontrada = reg.rutaPublica(path);
  const visible = encontrada && prendidos.has(encontrada.moduloId) ? encontrada : undefined;
  if (!visible && path !== "/") notFound();

  const items = pestanasSitio(reg, prendidos);
  const pestanas = items.map(({ etiqueta, href }) => ({ etiqueta, href }));
  const Componente = visible?.ruta.componente;
  const contenido = Componente ? <Componente tenantId={tenantId} params={visible.params} consulta={consulta} /> : null;

  const Cabecera = reg.cabeceraPublica && prendidos.has(reg.cabeceraPublica.moduloId) ? reg.cabeceraPublica.componente : null;
  const cabecera = Cabecera ? <Cabecera tenantId={tenantId} path={path} /> : null;

  const marco = reg.marcoPublico && prendidos.has(reg.marcoPublico.moduloId) ? reg.marcoPublico.componente : null;
  if (marco) {
    const Marco = marco;
    return (
      <Marco tenantId={tenantId} pestanas={pestanas} path={path} cabecera={cabecera}>
        {contenido}
      </Marco>
    );
  }
  return (
    <MarcoNeutro tenantId={tenantId} pestanas={items} cabecera={cabecera}>
      {contenido}
    </MarcoNeutro>
  );
}

async function MarcoNeutro({
  tenantId,
  pestanas,
  cabecera,
  children,
}: {
  tenantId: string;
  pestanas: { etiqueta: string; href: string; moduloId: string }[];
  cabecera: ReactNode;
  children: ReactNode;
}) {
  const tenant = await conTenant(tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }),
  );
  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="flex flex-wrap items-center gap-6 border-b pb-4">
        <Link href="/" className="text-xl font-semibold">
          {tenant?.nombre}
        </Link>
        {pestanas.length > 0 && (
          <nav aria-label="Sitio">
            <ul className="flex gap-4">
              {pestanas.map((p) => (
                <li key={p.href} data-modulo={p.moduloId}>
                  <Link href={p.href}>{p.etiqueta}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {cabecera && <div className="ml-auto">{cabecera}</div>}
      </header>
      <main className="py-6">{children ?? <h1 className="text-2xl">{tenant?.nombre}</h1>}</main>
    </div>
  );
}
