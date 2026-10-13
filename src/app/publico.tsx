import Link from "next/link";
import { notFound } from "next/navigation";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { pestanasSitio } from "@/nucleo/modulos/navegacion";

/**
 * Sitio público de una banda (anónimo: no lee sesión). Pestañas = entradas públicas
 * de los módulos prendidos. Ruta no declarada o módulo apagado → 404.
 * La home ("/") la aportará un módulo; mientras ninguno la declare, se muestra el nombre.
 */
export async function SuperficiePublica({ tenantId, path }: { tenantId: string; path: string }) {
  const reg = registro();
  const prendidos = await modulosPrendidos(tenantId, reg);
  const encontrada = reg.rutaPublica(path);
  const visible = encontrada && prendidos.has(encontrada.moduloId) ? encontrada : undefined;
  if (!visible && path !== "/") notFound();

  const tenant = await conTenant(tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }),
  );
  const pestanas = pestanasSitio(reg, prendidos);
  const Componente = visible?.ruta.componente;

  return (
    <>
      <header>
        <Link href="/">{tenant?.nombre}</Link>
        {pestanas.length > 0 && (
          <nav aria-label="Sitio">
            <ul>
              {pestanas.map((p) => (
                <li key={p.href} data-modulo={p.moduloId}>
                  <Link href={p.href}>{p.etiqueta}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main>
        {Componente ? <Componente tenantId={tenantId} params={visible!.params} /> : <h1>{tenant?.nombre}</h1>}
      </main>
    </>
  );
}
