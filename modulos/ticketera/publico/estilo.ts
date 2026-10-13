// El sitio público toma el estilo de la banda (variables del marco del sitio); con el marco
// neutro, cada una trae su valor por defecto.
export const c = {
  texto: "text-[var(--texto,#1c1917)]",
  suave: "text-[var(--texto-suave,#57534e)]",
  linea: "border-[var(--linea,#e7e5e4)]",
  superficie: "bg-[var(--superficie,#f5f5f4)]",
  boton:
    "inline-flex items-center justify-center rounded-full bg-[var(--acento,#111)] px-5 py-2.5 text-sm font-bold text-[var(--sobre-acento,#fff)] disabled:cursor-not-allowed disabled:opacity-40",
  campo:
    "w-full rounded-lg border border-[var(--linea,#d6d3d1)] bg-transparent px-3 py-2 text-[var(--texto,#1c1917)] outline-none focus:border-[var(--acento,#111)]",
  aviso: "rounded-xl border border-[var(--acento,#111)] p-4 text-sm font-semibold",
};
