import Link from "next/link";
import { redirect } from "next/navigation";
import { bandasVisibles } from "@/nucleo/acceso/bandas";
import { usuarioDeSesion } from "@/nucleo/acceso/panel";
import { conTenant } from "@/nucleo/db/con-tenant";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { BotonSalir } from "./salir";

// "/" es dos cosas según el host:
//  - app.<raiz>: selector de bandas del usuario (con sesión).
//  - host de banda: home del sitio público (anónimo; no lee sesión).
export default async function Inicio() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie === "sitio") return <SitioPublico tenantId={ctx.tenantId} />;

  const usuarioId = await usuarioDeSesion();
  if (!usuarioId) redirect("/ingresar");
  const bandas = await bandasVisibles(usuarioId);

  return (
    <main>
      <h1>Tus bandas</h1>
      {bandas.length === 0 && <p>Todavía no tenés bandas.</p>}
      <ul>
        {bandas.map((b) => (
          <li key={b.tenantId} data-slug={b.slug}>
            <Link href={`/b/${b.slug}`}>{b.nombre}</Link> · {b.rol ?? "—"}
            {b.accesoStaff && <strong> · acceso de staff</strong>}
          </li>
        ))}
      </ul>
      <BotonSalir />
    </main>
  );
}

// Lugar provisorio: la home pública la aporta el módulo de sitio (más adelante).
async function SitioPublico({ tenantId }: { tenantId: string }) {
  const tenant = await conTenant(tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }),
  );
  return (
    <main>
      <h1>{tenant?.nombre}</h1>
    </main>
  );
}
