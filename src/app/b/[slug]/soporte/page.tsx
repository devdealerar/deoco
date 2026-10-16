import { notFound } from "next/navigation";
import { usuarioActivo } from "@/nucleo/acceso/panel";
import { DURACIONES_SOPORTE, sesionDeSoporte } from "@/nucleo/acceso/soporte";
import { usuarioPropio } from "@/nucleo/acceso/usuario";
import { conTenant } from "@/nucleo/db/con-tenant";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { AreaTexto, Aviso, Formulario, Selector, Tarjeta } from "@/ui";
import { iniciarSoporteAccion, terminarSoporteAccion } from "./acciones";

const HORA = new Intl.DateTimeFormat("es-AR", { timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

// Entrar como soporte (D3): el staff escribe para qué entra y por cuánto. La banda lo ve.
export default async function Soporte({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const volver = String([(await searchParams).volver].flat()[0] ?? `/b/${slug}`);
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "panel") notFound();
  const usuarioId = await usuarioActivo();
  if (!usuarioId || !(await usuarioPropio(usuarioId))?.esStaff) notFound();
  const [banda, vigente] = await Promise.all([
    conTenant(ctx.tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { nombre: true } })),
    sesionDeSoporte(usuarioId, ctx.tenantId),
  ]);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Entrar a {banda.nombre} como soporte</h1>
        <p className="mt-1 text-md text-tertiary">
          Entrás con permisos de gestor: todo lo que la banda gestiona, nada de la plata ni del control de la cuenta. La sesión vence sola. La banda ve
          que entraste, cuándo y para qué, y todo lo que hagas queda en su actividad como hecho por soporte.
        </p>
      </header>
      {vigente && (
        <Aviso tono="info" titulo={`Tenés una sesión hasta las ${HORA.format(vigente.venceEn)}`} data-testid="soporte-vigente">
          Motivo: {vigente.motivo}
          <div className="mt-3">
            <Formulario accion={terminarSoporteAccion.bind(null, slug)} puedeEditar enLinea variante="secundario" etiqueta="Terminar ahora" />
          </div>
        </Aviso>
      )}
      <Tarjeta titulo={vigente ? "Pedir otra (termina la actual)" : "Pedir una sesión"}>
        <Formulario accion={iniciarSoporteAccion.bind(null, slug, volver)} puedeEditar etiqueta="Entrar como soporte">
          <AreaTexto name="motivo" etiqueta="Para qué entrás (lo ve la banda)" maxLength={500} />
          <Selector name="minutos" etiqueta="Por cuánto" defaultValue="30" opciones={DURACIONES_SOPORTE.map((m) => ({ valor: String(m), texto: `${m} minutos` }))} />
        </Formulario>
      </Tarjeta>
    </main>
  );
}
