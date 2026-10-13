import Link from "next/link";
import { redirect } from "next/navigation";
import { bandasVisibles } from "@/nucleo/acceso/bandas";
import { usuarioActivo } from "@/nucleo/acceso/panel";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { BotonSalir } from "./salir";
import { SuperficiePublica } from "./publico";

// "/" es dos cosas según el host:
//  - app.<raiz>: selector de bandas del usuario (con sesión).
//  - host de banda: home del sitio público (anónimo; no lee sesión).
export default async function Inicio() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie === "publico") return <SuperficiePublica tenantId={ctx.tenantId} path="/" />;

  const usuarioId = await usuarioActivo();
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
      <div className="flex gap-4">
        <Link href="/clave">Cambiar clave</Link>
        <BotonSalir />
      </div>
    </main>
  );
}
