import { formatearPesos } from "@/nucleo/dinero";
import { mesArgentino } from "@/nucleo/fechas";
import type { PropsRutaExterna } from "@/nucleo/modulos/contrato";
import { Aviso, Boton, Insignia, Selector, Filtros, Tabla, Tarjeta } from "@/ui";
import { alertas, calendario, metricasDelMes, roster, type Metricas } from "../roster";

const DIA = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
const MES = (clave: string) => new Date(`${clave}-15T12:00:00-03:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

function Encabezado({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-display-xs font-semibold text-primary">{titulo}</h1>
      {children && <p className="mt-1 text-md text-tertiary">{children}</p>}
    </header>
  );
}

const SinRoster = () => (
  <Aviso tono="info" titulo="Todavía no tenés bandas.">
    Cada banda te suma desde su panel (Equipo → Invitar, con tu email). Aceptás la invitación al entrar a Deoco.
  </Aviso>
);

/** El roster: cada banda con lo que pide atención, cómo va el mes y acceso directo a su panel. */
export async function RosterManager({ usuarioId }: PropsRutaExterna) {
  const bandas = await roster(usuarioId);
  const ahora = new Date();
  const datos = await Promise.all(bandas.map(async (b) => ({ b, m: await metricasDelMes(b.tenantId, ahora), a: await alertas(b) })));
  return (
    <div>
      <Encabezado titulo="Tu roster">
        Cada banda, con lo que necesita atención y cómo va el mes. Solo números: los datos de los fans de cada banda son de esa banda y no se juntan acá.
      </Encabezado>
      {bandas.length === 0 && <SinRoster />}
      <div className="grid gap-6 lg:grid-cols-2">
        {datos.map(({ b, m, a }) => (
          <Tarjeta
            key={b.tenantId}
            titulo={b.nombre}
            junto={a.length ? <Insignia color="advertencia">{a.length} para mirar</Insignia> : <Insignia color="exito">Al día</Insignia>}
            acciones={
              <Boton href={`/b/${b.slug}`} variante="secundario">
                Entrar al panel
              </Boton>
            }
            data-banda={b.slug}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-tertiary">Tienda este mes</dt>
                <dd className="font-semibold text-primary tabular-nums">
                  {formatearPesos(m.ventasTienda)} ({m.pedidos})
                </dd>
              </div>
              <div>
                <dt className="text-tertiary">Entradas este mes</dt>
                <dd className="font-semibold text-primary tabular-nums" data-entradas-mes>
                  {m.entradas} · {formatearPesos(m.ventasEntradas)}
                </dd>
              </div>
              <div>
                <dt className="text-tertiary">Fans en la base</dt>
                <dd className="font-semibold text-primary tabular-nums">
                  {m.contactos} ({m.suscriptos} suscriptos)
                </dd>
              </div>
              <div>
                <dt className="text-tertiary">Shows este mes</dt>
                <dd className="font-semibold text-primary tabular-nums">{m.showsDelMes}</dd>
              </div>
            </dl>
            {a.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-secondary" data-alertas>
                {a.slice(0, 6).map((t) => (
                  <li key={t}>· {t}</li>
                ))}
                {a.length > 6 && <li>· y {a.length - 6} más (en su panel)</li>}
              </ul>
            )}
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}

/** Calendario unificado: los shows y los lanzamientos de todo el roster, por fecha. */
export async function CalendarioManager({ usuarioId }: PropsRutaExterna) {
  const bandas = await roster(usuarioId);
  const fechas = await calendario(bandas);
  return (
    <div>
      <Encabezado titulo="Calendario">Los próximos cuatro meses de todo el roster: shows publicados y lanzamientos en curso.</Encabezado>
      {bandas.length === 0 ? (
        <SinRoster />
      ) : (
        <Tabla
          titulo="Próximas fechas"
          columnas={[
            { id: "cuando", etiqueta: "Cuándo" },
            { id: "banda", etiqueta: "Banda" },
            { id: "que", etiqueta: "Qué" },
          ]}
          filas={fechas.map((f, i) => ({
            id: `${f.banda.tenantId}-${i}`,
            celdas: [
              <span key="c" className="whitespace-nowrap tabular-nums">
                {DIA.format(f.cuando)}
              </span>,
              <span key="b">{f.banda.nombre}</span>,
              <div key="q" data-fecha-roster={f.tipo}>
                <Insignia color={f.tipo === "show" ? "marca" : "gris"}>{f.tipo === "show" ? "Show" : "Lanzamiento"}</Insignia> <span className="font-medium text-primary">{f.titulo}</span>
                <div className="text-sm text-tertiary">{f.detalle}</div>
              </div>,
            ],
          }))}
        />
      )}
    </div>
  );
}

const meses = (ahora = new Date()) => {
  const out: string[] = [];
  let d = ahora;
  for (let i = 0; i < 12; i++) {
    const m = mesArgentino(d);
    out.push(m.clave);
    d = new Date(m.desde.getTime() - 86_400_000);
  }
  return out;
};

const COLUMNAS: { id: keyof Metricas | "total"; etiqueta: string; pesos?: boolean }[] = [
  { id: "ventasTienda", etiqueta: "Tienda", pesos: true },
  { id: "pedidos", etiqueta: "Pedidos" },
  { id: "entradas", etiqueta: "Entradas" },
  { id: "ventasEntradas", etiqueta: "En entradas", pesos: true },
  { id: "total", etiqueta: "Total vendido", pesos: true },
  { id: "showsDelMes", etiqueta: "Shows" },
  { id: "contactos", etiqueta: "Fans (base)" },
  { id: "suscriptos", etiqueta: "Suscriptos" },
];

async function tablaDelMes(usuarioId: string, clave: string) {
  const bandas = await roster(usuarioId);
  const mes = new Date(`${clave}-15T12:00:00-03:00`);
  return Promise.all(bandas.map(async (b) => ({ b, m: await metricasDelMes(b.tenantId, mes) })));
}

const valor = (m: Metricas, id: (typeof COLUMNAS)[number]["id"]) => (id === "total" ? m.ventasTienda + m.ventasEntradas : m[id]);

/** Comparar las bandas del roster en un mes (agregados). */
export async function CompararManager({ usuarioId, consulta }: PropsRutaExterna) {
  const opciones = meses();
  const clave = opciones.includes(consulta.get("mes") ?? "") ? consulta.get("mes")! : opciones[0];
  const filas = await tablaDelMes(usuarioId, clave);
  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo="Comparar">Las bandas del roster lado a lado, en {MES(clave)}. Las ventas fueron directo a la cuenta de cada banda.</Encabezado>
      <Filtros>
        <Selector name="mes" etiqueta="Mes" defaultValue={clave} opciones={opciones.map((m) => ({ valor: m, texto: MES(m) }))} />
      </Filtros>
      <Tabla
        titulo={MES(clave)}
        columnas={[{ id: "banda", etiqueta: "Banda" }, ...COLUMNAS.map((c) => ({ id: c.id, etiqueta: c.etiqueta }))]}
        filas={filas.map(({ b, m }) => ({
          id: b.tenantId,
          celdas: [
            <span key="b" className="font-medium text-primary" data-comparar={b.slug}>
              {b.nombre}
            </span>,
            ...COLUMNAS.map((c) => (
              <span key={c.id} className="tabular-nums" data-columna={c.id}>
                {c.pesos ? formatearPesos(valor(m, c.id)) : valor(m, c.id)}
              </span>
            )),
          ],
        }))}
      />
    </div>
  );
}

const celda = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** Exportar el roster: SOLO agregados (3.2 manager d2). Los datos de fans, cada banda desde su panel. */
export async function ExportarManager({ usuarioId, consulta }: PropsRutaExterna) {
  const opciones = meses();
  const clave = opciones.includes(consulta.get("mes") ?? "") ? consulta.get("mes")! : opciones[0];
  const filas = await tablaDelMes(usuarioId, clave);
  const csv =
    "﻿" +
    [["banda", "mes", ...COLUMNAS.map((c) => c.id)].join(","), ...filas.map(({ b, m }) => [b.nombre, clave, ...COLUMNAS.map((c) => (c.pesos ? (valor(m, c.id) / 100).toFixed(2) : valor(m, c.id)))].map(celda).join(","))].join("\n") +
    "\n";
  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo="Exportar">Los números del roster en un CSV. Montos en pesos.</Encabezado>
      <Filtros>
        <Selector name="mes" etiqueta="Mes" defaultValue={clave} opciones={opciones.map((m) => ({ valor: m, texto: MES(m) }))} />
      </Filtros>
      <Tarjeta titulo={`Roster · ${MES(clave)}`} descripcion={`${filas.length} bandas.`}>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`roster-${clave}.csv`} className="font-semibold text-brand-secondary underline" data-exportar-roster>
          Descargar el CSV
        </a>
      </Tarjeta>
      <Aviso tono="info" titulo="¿Y los datos de los fans?">
        Son de cada banda y no salen de acá. Si una banda quiere compartirlos con vos, los exporta desde su panel (Exportar mis datos) y te los manda.
      </Aviso>
    </div>
  );
}
