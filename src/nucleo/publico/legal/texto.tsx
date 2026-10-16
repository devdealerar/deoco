import { c } from "@/nucleo/publico/estilo";

/** Un texto legal guardado ("# título", "## sección", párrafos), con el estilo de la banda. */
export function TextoLegal({ contenido, pie }: { contenido: string; pie?: string }) {
  return (
    <article className={`flex max-w-3xl flex-col gap-3 ${c.texto}`} data-texto-legal>
      {contenido.split("\n").map((linea, i) =>
        linea.startsWith("# ") ? (
          <h1 key={i} className="text-2xl font-bold">
            {linea.slice(2)}
          </h1>
        ) : linea.startsWith("## ") ? (
          <h2 key={i} className="mt-4 text-lg font-bold">
            {linea.slice(3)}
          </h2>
        ) : (
          <p key={i} className="text-sm leading-relaxed">
            {linea}
          </p>
        ),
      )}
      {pie && <p className={`mt-6 text-xs ${c.suave}`}>{pie}</p>}
    </article>
  );
}
