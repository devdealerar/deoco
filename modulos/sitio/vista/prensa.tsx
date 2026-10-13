/* eslint-disable @next/next/no-img-element -- archivos propios ya optimizados (versión web) */
import type { ContenidoSitio, RefArchivo } from "../contenido";
import type { Rutas } from "./estilo";

const RASTER = ["jpeg", "png", "webp"];

function Descarga({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-2 rounded-full bg-[var(--acento)] px-4 py-2 text-sm font-bold text-[var(--sobre-acento)]"
    >
      ↓ {children}
    </a>
  );
}

/** Miniatura de un descargable: la versión web si es imagen; si no (SVG, PDF), una ficha. */
function Miniatura({ archivo, rutas, alt }: { archivo: RefArchivo; rutas: Rutas; alt: string }) {
  if (RASTER.includes(archivo.tipo) && archivo.web) {
    return (
      <img
        src={rutas.archivo(archivo, { web: true })}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="aspect-square w-full rounded-xl bg-[var(--superficie)] object-contain"
      />
    );
  }
  // Un SVG nunca se renderiza en la página: solo se ofrece para descargar.
  return (
    <div className="grid aspect-square w-full place-items-center rounded-xl bg-[var(--superficie)] text-2xl font-black uppercase text-[var(--texto-suave)]">
      {archivo.tipo}
    </div>
  );
}

export function Prensa({ contenido, rutas }: { contenido: ContenidoSitio; rutas: Rutas }) {
  const { prensa } = contenido;
  const parrafos = prensa.bioLarga.split(/\n\s*\n/).filter((p) => p.trim());
  const { contacto } = prensa;
  const hayContacto = contacto.nombre || contacto.email || contacto.telefono;

  return (
    <div className="mx-auto max-w-5xl px-5 pt-12">
      <h1 className="text-4xl font-black tracking-tight uppercase sm:text-5xl">Press kit</h1>

      {parrafos.length > 0 && (
        <section className="mt-8 max-w-3xl space-y-4 text-lg leading-relaxed">
          {parrafos.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </section>
      )}

      {prensa.fotos.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl font-black tracking-tight uppercase">Fotos</h2>
          <p className="mt-1 text-sm text-[var(--texto-suave)]">En alta resolución, para prensa.</p>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {prensa.fotos.map((f) => (
              <li key={f.archivo.id} className="space-y-2">
                <Miniatura archivo={f.archivo} rutas={rutas} alt={f.descripcion || contenido.nombre} />
                {f.descripcion && <p className="text-sm text-[var(--texto-suave)]">{f.descripcion}</p>}
                <Descarga href={rutas.archivo(f.archivo, { descargar: true })}>Original</Descarga>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prensa.logos.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl font-black tracking-tight uppercase">Logos</h2>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {prensa.logos.map((l) => (
              <li key={l.archivo.id} className="space-y-2">
                <Miniatura archivo={l.archivo} rutas={rutas} alt={l.descripcion || "Logo"} />
                {l.descripcion && <p className="text-sm text-[var(--texto-suave)]">{l.descripcion}</p>}
                <Descarga href={rutas.archivo(l.archivo, { descargar: true })}>{l.archivo.tipo.toUpperCase()}</Descarga>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prensa.rider && (
        <section className="mt-14">
          <h2 className="text-2xl font-black tracking-tight uppercase">Rider técnico</h2>
          <div className="mt-4">
            <Descarga href={rutas.archivo(prensa.rider, { descargar: true })}>Descargar rider (PDF)</Descarga>
          </div>
        </section>
      )}

      {hayContacto && (
        <section className="mt-14 rounded-2xl border border-[var(--linea)] p-6">
          <h2 className="text-2xl font-black tracking-tight uppercase">Contacto de prensa</h2>
          <dl className="mt-4 space-y-1">
            {contacto.nombre && <dd className="font-bold">{contacto.nombre}</dd>}
            {contacto.email && (
              <dd>
                <a href={`mailto:${contacto.email}`} className="text-[var(--acento)] underline underline-offset-4">
                  {contacto.email}
                </a>
              </dd>
            )}
            {contacto.telefono && <dd className="text-[var(--texto-suave)]">{contacto.telefono}</dd>}
          </dl>
        </section>
      )}
    </div>
  );
}
