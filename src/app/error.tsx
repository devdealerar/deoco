"use client";

// Lo que se escapa de una página (la base saturada en un pico, un error inesperado): nunca el
// error técnico. En el sitio de una banda y en el panel, una frase y "Reintentar". No dice "hay
// mucha gente": puede no ser eso.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-start justify-center gap-4 p-6" data-error-publico>
      <h1 className="text-2xl font-bold">No pudimos cargar esta página</h1>
      <p className="opacity-80">Puede ser un momento de mucho movimiento. Probá de nuevo en unos segundos; si sigue igual, volvé en un rato.</p>
      <button type="button" onClick={reset} className="rounded-full border px-5 py-2.5 text-sm font-bold">
        Reintentar
      </button>
    </main>
  );
}
