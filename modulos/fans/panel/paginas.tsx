import Link from "next/link";
import { notFound } from "next/navigation";
import { puedeEnPedido } from "@/nucleo/acceso/panel";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { FECHA_CORTA } from "@/nucleo/fechas";
import { AreaTexto, Aviso, Boton, Campo, Casilla, Filtros, Formulario, Insignia, Selector, Tabla, Tarjeta } from "@/ui";
import { ESTADOS_NEWSLETTER, listarContactos, metricas, ORIGENES, POR_PAGINA } from "../contactos";
import { cupoDiario, envioDeBanda, listarEnvios } from "../envios";
import { bajaContactoAccion, cancelarEnvioAccion, crearEnvioAccion, guardarEnvioAccion, mandarEnvioAccion } from "./acciones";

const puedeEditar = (slug: string) => puedeEnPedido("fans.envios.editar", `/b/${slug}/fans/envios`);
const fecha = (d: Date | null) => (d ? FECHA_CORTA.format(d) : "—");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

function Encabezado({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <header>
      <h1 className="text-display-xs font-semibold text-primary">{titulo}</h1>
      {children && <p className="mt-1 text-md text-tertiary">{children}</p>}
    </header>
  );
}

/** Panel · Fans: la base de la banda (quién, de dónde, si repite) y cómo crece el newsletter. */
export async function FansPanel({ tenantId, slug, consulta }: PropsRutaPanel) {
  const filtro = { buscar: consulta.get("q") ?? "", newsletter: consulta.get("newsletter") ?? "", pagina: Number(consulta.get("pagina")) || 1 };
  const [m, lista, editar] = await Promise.all([metricas(tenantId), listarContactos(tenantId, filtro), puedeEditar(slug)]);
  const paginas = Math.max(1, Math.ceil(lista.total / POR_PAGINA));
  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo="Fans">
        Tu base: quienes te compraron y quienes se suscribieron a las novedades. Es tuya y de nadie más (ni un manager la ve, ni se cruza con la de otra banda). Te la
        llevás entera desde <Link href={`/b/${slug}/exportar`} className="font-semibold underline">Exportar mis datos</Link> (con la prueba de cada consentimiento).
      </Encabezado>
      <dl className="grid gap-4 sm:grid-cols-4" data-metricas-fans>
        {[
          ["En la base", m.total, "total"],
          ["Suscriptos", m.suscriptos, "suscriptos"],
          ["Sin confirmar", m.pendientes, "pendientes"],
          ["Repiten compra", `${m.repiten} de ${m.conCompra}`, "repiten"],
        ].map(([t, v, k]) => (
          <Tarjeta key={String(k)} titulo={String(t)} data-metrica={String(k)}>
            <dd className="text-display-xs font-semibold text-primary tabular-nums">{v}</dd>
          </Tarjeta>
        ))}
      </dl>
      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta titulo="Suscriptos nuevos por mes" descripcion="Los que confirmaron su mail.">
          <ul className="flex flex-col gap-1 text-sm" data-crecimiento>
            {m.meses.map((x) => (
              <li key={x.mes} className="flex justify-between tabular-nums">
                <span>{x.mes}</span>
                <span>{x.nuevos}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta titulo="De dónde son" descripcion="Por la provincia de envío de sus compras.">
          {m.provincias.length === 0 ? (
            <p className="text-sm text-tertiary">Todavía no hay compras con envío.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {m.provincias.map((p) => (
                <li key={p.provincia} className="flex justify-between tabular-nums">
                  <span>{p.provincia}</span>
                  <span>{p.cantidad}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
      <Filtros>
        <Campo name="q" etiqueta="Buscar (email o nombre)" defaultValue={filtro.buscar} />
        <Selector
          name="newsletter"
          etiqueta="Newsletter"
          defaultValue={filtro.newsletter}
          opciones={[{ valor: "", texto: "Todos" }, ...Object.entries(ESTADOS_NEWSLETTER).map(([valor, texto]) => ({ valor, texto }))]}
        />
      </Filtros>
      <Tabla
        titulo="Contactos"
        paginacion={{ pagina: lista.pagina, paginas, total: lista.total }}
        columnas={[
          { id: "persona", etiqueta: "Persona" },
          { id: "origen", etiqueta: "Entró por" },
          { id: "compras", etiqueta: "Compras" },
          { id: "newsletter", etiqueta: "Newsletter" },
          { id: "acciones", etiqueta: "" },
        ]}
        filas={lista.filas.map((c) => ({
          id: c.id,
          celdas: [
            <div key="p" data-contacto={c.email}>
              <div className="font-medium text-primary">{c.nombre || c.email}</div>
              <div className="text-sm text-tertiary">
                {c.nombre ? c.email : ""} {c.ciudad || c.provincia ? `· ${[c.ciudad, c.provincia].filter(Boolean).join(", ")}` : ""}
              </div>
            </div>,
            <span key="o">{ORIGENES[c.origen] ?? c.origen}</span>,
            <span key="c" className="tabular-nums">
              {c.compras}
            </span>,
            <Insignia key="n" color={c.newsletter === "confirmado" ? "exito" : c.newsletter === "pendiente" ? "advertencia" : "gris"}>
              {ESTADOS_NEWSLETTER[c.newsletter] ?? c.newsletter}
            </Insignia>,
            c.newsletter === "confirmado" || c.newsletter === "pendiente" ? (
              <Formulario key="a" accion={bajaContactoAccion.bind(null, slug, c.id)} puedeEditar={editar} enLinea variante="secundario" etiqueta="Dar de baja" />
            ) : (
              <span key="a" />
            ),
          ],
        }))}
      />
    </div>
  );
}

const ESTADOS_ENVIO: Record<string, { texto: string; color: "gris" | "advertencia" | "exito" | "error" }> = {
  BORRADOR: { texto: "Borrador", color: "gris" },
  ENVIANDO: { texto: "Saliendo", color: "advertencia" },
  ENVIADO: { texto: "Enviado", color: "exito" },
  CANCELADO: { texto: "Cancelado", color: "error" },
};

async function Cupo({ tenantId }: { tenantId: string }) {
  const c = await cupoDiario(tenantId);
  return (
    <Aviso tono="info" titulo={`Hoy pueden salir ${Math.max(0, c.cupo - c.usado)} mails más (de ${c.cupo}).`} data-cupo={c.cupo}>
      {c.propio ? "Salen desde tu dirección." : "Salen desde Deoco con el nombre de tu banda; con tu dominio de correo verificado (Correo), salen desde tu dirección y el cupo arranca más alto."}{" "}
      El cupo crece solo con cada semana con pocas bajas (no depende del plan): así tus mails no terminan en spam. Lo que no entra hoy sale mañana solo.
    </Aviso>
  );
}

/** Panel · Newsletter: los envíos y sus números. */
export async function EnviosPanel({ tenantId, slug }: PropsRutaPanel) {
  const [envios, editar] = await Promise.all([listarEnvios(tenantId), puedeEditar(slug)]);
  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo="Newsletter">
        Le llega a quienes se suscribieron y confirmaron su mail. Cada mail lleva la baja en un clic. Los suscriptos se suman desde la página Novedades de tu sitio y desde la casilla
        (sin marcar) de la compra.
      </Encabezado>
      <Cupo tenantId={tenantId} />
      <Tabla
        titulo="Envíos"
        columnas={[
          { id: "asunto", etiqueta: "Asunto" },
          { id: "estado", etiqueta: "" },
          { id: "enviados", etiqueta: "Enviados" },
          { id: "abiertos", etiqueta: "Abiertos" },
          { id: "bajas", etiqueta: "Bajas" },
        ]}
        filas={envios.map((e) => ({
          id: e.id,
          celdas: [
            <div key="a" data-envio={e.asunto}>
              <Link href={`/b/${slug}/fans/envios/${e.id}`} className="font-semibold text-primary underline">
                {e.asunto}
              </Link>
              <div className="text-sm text-tertiary">{fecha(e.enviadoEn ?? e.creadoEn)}</div>
            </div>,
            <Insignia key="e" color={ESTADOS_ENVIO[e.estado]?.color}>
              {ESTADOS_ENVIO[e.estado]?.texto ?? e.estado}
            </Insignia>,
            <span key="n" className="tabular-nums">
              {e.enviadas} / {e.destinatarios}
            </span>,
            <span key="o" className="tabular-nums">
              {pct(e.abiertas, e.enviadas)}
            </span>,
            <span key="b" className="tabular-nums">
              {e.bajas}
            </span>,
          ],
        }))}
      />
      <Tarjeta titulo="Nuevo envío" descripcion="Texto plano: dejá una línea en blanco entre párrafos. El pie con la baja y tus datos lo agrega Deoco.">
        <Formulario accion={crearEnvioAccion.bind(null, slug)} puedeEditar={editar} etiqueta="Guardar borrador">
          <Campo name="asunto" etiqueta="Asunto" maxLength={150} required />
          <AreaTexto name="cuerpo" etiqueta="Texto" rows={10} maxLength={20000} />
        </Formulario>
      </Tarjeta>
    </div>
  );
}

/** Panel · un envío: editarlo (borrador), mandarlo y ver cómo le fue. */
export async function EnvioPanel({ tenantId, slug, params }: PropsRutaPanel) {
  const [e, editar] = await Promise.all([envioDeBanda(tenantId, params.id), puedeEditar(slug)]);
  if (!e) notFound();
  const estado = ESTADOS_ENVIO[e.estado];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Boton href={`/b/${slug}/fans/envios`} variante="enlace">
          ← Newsletter
        </Boton>
      </div>
      <Encabezado titulo={e.asunto} />
      <div>
        <Insignia color={estado?.color}>{estado?.texto ?? e.estado}</Insignia>
      </div>
      {e.estado !== "BORRADOR" && (
        <dl className="grid gap-4 sm:grid-cols-4" data-estadisticas>
          {[
            ["Destinatarios", e.destinatarios, "destinatarios"],
            ["Enviados", e.enviadas, "enviadas"],
            ["Abiertos", `${e.abiertas} (${pct(e.abiertas, e.enviadas)})`, "abiertas"],
            ["Se dieron de baja", e.bajas, "bajas"],
          ].map(([t, v, k]) => (
            <Tarjeta key={String(k)} titulo={String(t)} data-estadistica={String(k)}>
              <dd className="text-display-xs font-semibold text-primary tabular-nums">{v}</dd>
            </Tarjeta>
          ))}
        </dl>
      )}
      {e.estado === "ENVIANDO" && (
        <>
          <Cupo tenantId={tenantId} />
          <Aviso tono="info" titulo={`Faltan ${e.pendientes}.`}>
            Salen solos, con el cupo de cada día. Abiertos: solo cuenta la primera vez que se abre cada mail, si el programa de correo muestra imágenes (es un número aproximado).
          </Aviso>
          <Formulario accion={cancelarEnvioAccion.bind(null, slug, e.id)} puedeEditar={editar} variante="peligro" etiqueta="Cancelar lo que falta" />
        </>
      )}
      {e.estado === "BORRADOR" ? (
        <>
          <Tarjeta titulo="Borrador">
            <Formulario accion={guardarEnvioAccion.bind(null, slug, e.id)} puedeEditar={editar}>
              <Campo name="asunto" etiqueta="Asunto" defaultValue={e.asunto} maxLength={150} required />
              <AreaTexto name="cuerpo" etiqueta="Texto" rows={12} defaultValue={e.cuerpo} maxLength={20000} />
            </Formulario>
          </Tarjeta>
          <Tarjeta titulo="Mandarlo" descripcion="Le llega a todos los suscriptos confirmados de ahora. Un envío no se puede deshacer.">
            <Formulario accion={mandarEnvioAccion.bind(null, slug, e.id)} puedeEditar={editar} etiqueta="Mandar">
              <Casilla name="confirmar" etiqueta="Sí, mandarlo" />
            </Formulario>
          </Tarjeta>
        </>
      ) : (
        <Tarjeta titulo="Texto">
          <p className="text-md whitespace-pre-wrap text-secondary">{e.cuerpo}</p>
        </Tarjeta>
      )}
    </div>
  );
}
