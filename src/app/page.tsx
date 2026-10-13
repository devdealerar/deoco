import Link from "next/link";
import { redirect } from "next/navigation";
import { bandasVisibles } from "@/nucleo/acceso/bandas";
import { portalesDe } from "@/nucleo/acceso/externas";
import { usuarioActivo } from "@/nucleo/acceso/panel";
import { consultaDe, type SearchParamsNext } from "@/nucleo/modulos/consulta";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { BotonSalir } from "./salir";
import { metadataPublica, SuperficiePublica } from "./publico";

type Props = { searchParams: Promise<SearchParamsNext> };

export async function generateMetadata({ searchParams }: Props) {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return {};
  return metadataPublica(ctx.tenantId, "/", consultaDe(await searchParams));
}

// "/" es dos cosas según el host:
//  - app.<raiz>: selector de bandas del usuario (con sesión).
//  - host de banda: home del sitio público (anónimo; no lee sesión).
export default async function Inicio({ searchParams }: Props) {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie === "publico") {
    return <SuperficiePublica tenantId={ctx.tenantId} path="/" consulta={consultaDe(await searchParams)} />;
  }

  const usuarioId = await usuarioActivo();
  if (!usuarioId) redirect("/ingresar");
  const [bandas, portales] = await Promise.all([bandasVisibles(usuarioId), portalesDe(usuarioId)]);
  // Una cuenta externa sin bandas (un proveedor) va directo a su portal.
  if (bandas.length === 0 && portales.length === 1) redirect(portales[0].href);

  return (
    <main>
      <h1>Tus bandas</h1>
      {bandas.length === 0 && portales.length === 0 && <p>Todavía no tenés bandas.</p>}
      <ul>
        {bandas.map((b) => (
          <li key={b.tenantId} data-slug={b.slug}>
            <Link href={`/b/${b.slug}`}>{b.nombre}</Link> · {b.rol ?? "—"}
            {b.accesoStaff && <strong> · acceso de staff</strong>}
          </li>
        ))}
      </ul>
      {portales.length > 0 && (
        <ul>
          {portales.map((p) => (
            <li key={p.moduloId} data-portal={p.moduloId}>
              <Link href={p.href}>{p.etiqueta}</Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-4">
        <Link href="/clave">Cambiar clave</Link>
        <BotonSalir />
      </div>
    </main>
  );
}
