import Link from "next/link";
import { redirect } from "next/navigation";
import { bandasVisibles } from "@/nucleo/acceso/bandas";
import { usuarioDeSesion } from "@/nucleo/acceso/panel";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { BotonSalir } from "./salir";
import { SitioPublico } from "./sitio";

// "/" es dos cosas según el host:
//  - app.<raiz>: selector de bandas del usuario (con sesión).
//  - host de banda: home del sitio público (anónimo; no lee sesión).
export default async function Inicio() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie === "sitio") return <SitioPublico tenantId={ctx.tenantId} path="/" />;

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
