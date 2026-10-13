/* eslint-disable @next/next/no-img-element -- archivos propios ya optimizados (versión web) */
import Link from "next/link";
import type { ContenidoSitio } from "../contenido";
import type { Rutas } from "./estilo";

const MES = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" });
const DIA_SEMANA = new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" });

/** Home: síntesis corta. No repite el press kit: lo resume y linkea. */
export function Home({ contenido, rutas, hoy = new Date() }: { contenido: ContenidoSitio; rutas: Rutas; hoy?: Date }) {
  const { identidad, home } = contenido;
  const desde = hoy.toISOString().slice(0, 10);
  const proximas = home.fechas.filter((f) => f.fecha >= desde).slice(0, 6);
  const escucha = home.links.filter((l) => l.tipo === "ESCUCHA");
  const redes = home.links.filter((l) => l.tipo === "RED");

  return (
    <>
      {/* Identidad */}
      <section
        className="relative flex min-h-[52vh] items-end overflow-hidden"
        style={identidad.fondo ? undefined : { background: "linear-gradient(160deg, var(--acento), var(--fondo) 75%)" }}
      >
        {identidad.fondo && (
          <img
            src={rutas.archivo(identidad.fondo, { web: true })}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--fondo)] via-[var(--fondo)]/40 to-transparent" />
        <div className="relative mx-auto w-full max-w-5xl px-5 pt-24 pb-10">
          {identidad.logo ? (
            <img src={rutas.archivo(identidad.logo, { web: true })} alt={contenido.nombre} className="max-h-40 w-auto max-w-[80%] object-contain" />
          ) : (
            <h1 className="text-5xl font-black tracking-tight uppercase sm:text-7xl">{contenido.nombre}</h1>
          )}
          {home.bioCorta && <p className="mt-5 max-w-2xl text-lg text-[var(--texto-suave)] sm:text-xl">{home.bioCorta}</p>}
          <Link
            href={rutas.prensa}
            className="mt-6 inline-flex rounded-full border border-[var(--linea)] px-4 py-2 text-sm font-bold hover:border-[var(--acento)]"
          >
            Press kit →
          </Link>
        </div>
      </section>

      {/* Slider */}
      {home.slides.length > 0 && (
        <section aria-label="Imágenes" className="mx-auto max-w-5xl px-5 pt-10">
          <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]">
            {home.slides.map((s) => (
              <li key={s.imagen.id} className="w-[85%] shrink-0 snap-start sm:w-[60%]">
                <img
                  src={rutas.archivo(s.imagen, { web: true })}
                  alt={s.alt}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/2] w-full rounded-xl object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Próximas fechas */}
      <section className="mx-auto max-w-5xl px-5 pt-12">
        <h2 className="text-2xl font-black tracking-tight uppercase">Próximas fechas</h2>
        {proximas.length === 0 ? (
          <p className="mt-4 text-[var(--texto-suave)]">No hay fechas anunciadas por ahora.</p>
        ) : (
          <ul className="mt-5 divide-y divide-[var(--linea)] border-y border-[var(--linea)]">
            {proximas.map((f) => {
              const d = new Date(`${f.fecha}T12:00:00Z`);
              return (
                <li key={`${f.fecha}-${f.lugar}`} className="flex items-center gap-4 py-4">
                  <div className="w-14 shrink-0 text-center leading-none">
                    <div className="text-3xl font-black text-[var(--acento)]">{d.getUTCDate()}</div>
                    <div className="mt-1 text-xs font-bold uppercase text-[var(--texto-suave)]">
                      {MES.format(d).replace(".", "")} · {DIA_SEMANA.format(d).replace(".", "")}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{f.lugar}</div>
                    <div className="text-sm text-[var(--texto-suave)]">{f.ciudad}</div>
                  </div>
                  {f.link && (
                    <a
                      href={f.link}
                      {...(f.link.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                      className="shrink-0 rounded-full bg-[var(--acento)] px-4 py-2 text-sm font-bold text-[var(--sobre-acento)]"
                    >
                      Entradas
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Links */}
      {(escucha.length > 0 || redes.length > 0) && (
        <section className="mx-auto grid max-w-5xl gap-8 px-5 pt-12 sm:grid-cols-2">
          {[
            { titulo: "Escuchá", links: escucha },
            { titulo: "Seguinos", links: redes },
          ]
            .filter((g) => g.links.length > 0)
            .map((g) => (
              <div key={g.titulo}>
                <h2 className="text-2xl font-black tracking-tight uppercase">{g.titulo}</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {g.links.map((l) => (
                    <li key={l.url}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-full border border-[var(--linea)] px-4 py-2 text-sm font-bold hover:border-[var(--acento)] hover:text-[var(--acento)]"
                      >
                        {l.plataforma}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      )}
    </>
  );
}
