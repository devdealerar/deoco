import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { registro } from "@/nucleo/modulos";
import { nombreDeBanda, resolverMetadatos } from "@/nucleo/modulos/metadatos";
import { elementosDelMarco } from "@/nucleo/publico/marco";
import { CapaLegal } from "@/nucleo/publico/legal/pie";
import { origenDelPedido } from "@/nucleo/publico/origen";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";

/** <title>, descripción y Open Graph de una página pública: de la banda, nunca de Deoco. */
export async function metadataPublica(tenantId: string, path: string, consulta: URLSearchParams): Promise<Metadata> {
  const m = await resolverMetadatos(tenantId, path, consulta);
  const imagenes = m.imagen ? [m.imagen] : undefined;
  return {
    metadataBase: new URL(await origenDelPedido()), // base de las URLs absolutas de la vista previa
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
  const { prendidos } = await elementosDelMarco(tenantId, path, reg);
  const encontrada = reg.rutaPublica(path);
  const visible = encontrada && prendidos.has(encontrada.moduloId) ? encontrada : undefined;
  if (!visible && path !== "/") notFound();
  // Banda cerrada (cuota impaga: el sitio dejó de estar publicado): solo lo que la ruta abre igual
  // (las entradas o el pedido del fan).
  if ((await tenantDelPedido())?.bandaCerrada) {
    const abre = visible?.ruta.conBandaCerrada ? await visible.ruta.conBandaCerrada(tenantId, visible.params) : false;
    if (!abre) notFound();
  }

  const Componente = visible?.ruta.componente;
  const contenido = Componente ? <Componente tenantId={tenantId} params={visible.params} consulta={consulta} /> : null;
  return (
    <MarcoDeLaBanda tenantId={tenantId} path={path}>
      {contenido}
    </MarcoDeLaBanda>
  );
}

/**
 * El marco del sitio de la banda (el del módulo que lo da, o uno neutro), con lo legal abajo: el
 * pie (privacidad, términos, tus datos, arrepentimiento, cookies) y el aviso de cookies. Lo usan
 * las rutas de módulos y las páginas legales del núcleo.
 */
export async function MarcoDeLaBanda({ tenantId, path, children }: { tenantId: string; path: string; children: ReactNode }) {
  const reg = registro();
  const { prendidos, pestanas: items, cabecera } = await elementosDelMarco(tenantId, path, reg);
  const pestanas = items.map(({ etiqueta, href }) => ({ etiqueta, href }));
  const conVentas = reg.modulos.some((m) => m.cobros && prendidos.has(m.id));
  const legal = <CapaLegal conVentas={conVentas} />;
  const marco = reg.marcoPublico && prendidos.has(reg.marcoPublico.moduloId) ? reg.marcoPublico.componente : null;
  if (marco) {
    const Marco = marco;
    return (
      <Marco tenantId={tenantId} pestanas={pestanas} path={path} cabecera={cabecera}>
        {children}
        {legal}
      </Marco>
    );
  }
  return (
    <MarcoNeutro tenantId={tenantId} pestanas={items} cabecera={cabecera} pie={legal}>
      {children}
    </MarcoNeutro>
  );
}

async function MarcoNeutro({
  tenantId,
  pestanas,
  cabecera,
  children,
  pie,
}: {
  tenantId: string;
  pestanas: { etiqueta: string; href: string; moduloId: string }[];
  cabecera: ReactNode;
  children: ReactNode;
  pie: ReactNode;
}) {
  const tenant = await nombreDeBanda(tenantId);
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
      {pie}
    </div>
  );
}
