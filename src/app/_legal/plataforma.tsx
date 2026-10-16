import type { Documento } from "@/nucleo/legal/textos";

/** Un documento de Deoco (términos, encargo de tratamiento) en el host de la plataforma. */
export function DocumentoDeDeoco({ doc }: { doc: Documento }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6 text-primary" data-documento={doc.id}>
      <h1 className="text-display-xs font-semibold">{doc.titulo}</h1>
      <p className="text-sm text-tertiary">Versión {doc.version}</p>
      {doc.secciones.map((s) => (
        <section key={s.titulo} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{s.titulo}</h2>
          {s.parrafos.map((p) => (
            <p key={p} className="text-md text-secondary">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
