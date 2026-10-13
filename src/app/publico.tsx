import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { pestanasSitio } from "@/nucleo/modulos/navegacion";

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

  const marco = reg.marcoPublico && prendidos.has(reg.marcoPublico.moduloId) ? reg.marcoPublico.componente : null;
  if (marco) {
    const Marco = marco;
    return (
      <Marco tenantId={tenantId} pestanas={pestanas} path={path}>
        {contenido}
      </Marco>
    );
  }
  return (
    <MarcoNeutro tenantId={tenantId} pestanas={items}>
      {contenido}
    </MarcoNeutro>
  );
}

async function MarcoNeutro({
  tenantId,
  pestanas,
  children,
}: {
  tenantId: string;
  pestanas: { etiqueta: string; href: string; moduloId: string }[];
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
      </header>
      <main className="py-6">{children ?? <h1 className="text-2xl">{tenant?.nombre}</h1>}</main>
    </div>
  );
}
