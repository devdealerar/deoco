import { exigirTitular } from "@/nucleo/acceso/panel";
import { datosDeLaPersona, pedidosDeDatos, TIPOS, type TipoPedido } from "@/nucleo/legal/derechos";
import { esEmail } from "@/nucleo/correo/direccion";
import { AreaTexto, Aviso, Campo, Casilla, Filtros, Formulario, Insignia, Selector, Tabla, Tarjeta } from "@/ui";
import { MarcoPanel } from "../marco";
import { resolverPedidoAccion } from "./acciones";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const ESTADO = { abierto: { texto: "Abierto", color: "advertencia" }, resuelto: { texto: "Resuelto", color: "exito" }, rechazado: { texto: "Rechazado", color: "gris" } } as const;

// Datos personales (núcleo, solo el titular; abierta en todos los estados de la banda): los
// pedidos de los fans sobre sus datos con su vencimiento legal, y "los datos de esta persona".
export default async function DatosPersonales({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/datos-personales`);
  const email = String([(await searchParams).email].flat()[0] ?? "").trim().toLowerCase();
  const [pedidos, datos] = await Promise.all([pedidosDeDatos(acceso.tenantId), esEmail(email) ? datosDeLaPersona(acceso.tenantId, email) : Promise.resolve(null)]);
  const ahora = new Date();
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Datos personales de los fans</h1>
          <p className="mt-1 text-md text-tertiary">
            Lo que piden tus fans sobre sus datos desde tu sitio, con el plazo de la ley: acceso, 10 días corridos; corregir, borrar u oponerse, 5 días
            hábiles; arrepentimiento, confirmación con código. Al resolver un acceso le mandamos sus datos; al resolver un borrado, se anonimiza lo que
            se puede (los comprobantes de venta se conservan por ley).
          </p>
        </header>
        <Tabla
          titulo="Pedidos"
          columnas={[
            { id: "pedido", etiqueta: "Pedido" },
            { id: "vence", etiqueta: "Vence" },
            { id: "accion", etiqueta: "" },
          ]}
          filas={pedidos.map((p) => ({
            id: p.id,
            celdas: [
              <div key="p" data-pedido-datos={p.id}>
                <div className="font-medium text-primary">{TIPOS[p.tipo as TipoPedido]?.texto ?? p.tipo}</div>
                <div className="text-sm text-tertiary">
                  {p.email} · código {p.id.slice(0, 8).toUpperCase()} · {FECHA.format(p.creadoEn)}
                </div>
                {p.detalle && <div className="text-sm text-secondary">“{p.detalle}”</div>}
                {p.respuesta && <div className="text-sm text-tertiary">Respuesta: {p.respuesta}</div>}
              </div>,
              <div key="v" className="flex flex-col gap-1">
                <Insignia color={ESTADO[p.estado as keyof typeof ESTADO]?.color ?? "gris"}>{ESTADO[p.estado as keyof typeof ESTADO]?.texto ?? p.estado}</Insignia>
                {p.estado === "abierto" && p.venceEn && (
                  <span className={`text-sm ${p.venceEn < ahora ? "font-semibold text-error-primary" : "text-tertiary"}`}>{p.venceEn < ahora ? "Venció el " : ""}{FECHA.format(p.venceEn)}</span>
                )}
              </div>,
              p.estado === "abierto" ? (
                <div key="a" className="flex flex-col gap-2">
                  <a className="text-sm font-semibold text-brand-secondary underline" href={`/b/${slug}/datos-personales?email=${encodeURIComponent(p.email)}`}>
                    Ver sus datos
                  </a>
                  <Formulario accion={resolverPedidoAccion.bind(null, slug, p.id)} puedeEditar etiqueta="Responder">
                    <Selector name="estado" etiqueta="Respuesta" defaultValue="resuelto" opciones={[{ valor: "resuelto", texto: p.tipo === "supresion" ? "Borrar sus datos y avisarle" : p.tipo === "acceso" ? "Mandarle sus datos" : "Resuelto" }, { valor: "rechazado", texto: "Rechazar (con motivo)" }]} />
                    <AreaTexto name="respuesta" etiqueta="Mensaje para el fan" />
                    <Casilla name="confirmar" etiqueta="Confirmo: se le manda por mail" />
                  </Formulario>
                </div>
              ) : (
                <span key="a" />
              ),
            ],
          }))}
        />
        <Tarjeta titulo="Los datos de una persona" descripcion="Todo lo que tu banda tiene de un email: pedidos, compras, entradas, correos que se le mandaron.">
          <Filtros>
            <Campo name="email" type="email" etiqueta="Email" defaultValue={email} />
          </Filtros>
          {datos && datos.length === 0 && <Aviso tono="info">No hay nada de {email}.</Aviso>}
          {datos?.map((s) => (
            <section key={s.titulo} className="mt-4" data-seccion-datos={s.titulo}>
              <h3 className="text-md font-semibold text-primary">{s.titulo}</h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm text-secondary">
                {s.filas.map((f, i) => (
                  <li key={i}>
                    {Object.entries(f)
                      .filter(([, v]) => v !== null && v !== "")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Tarjeta>
      </div>
    </MarcoPanel>
  );
}
