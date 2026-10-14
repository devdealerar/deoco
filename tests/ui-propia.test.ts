import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Las pantallas del panel, el back office y el portal usan el kit `@/ui` (src/ui): no
// vuelven a armar a mano algo que el kit ya tiene. Se buscan las marcas inconfundibles
// de cada componente (no "cualquier div con borde"), para no dar falsos positivos.
//
// Quedan afuera el sitio público (tiene el estilo de cada banda) y las excepciones de
// abajo, cada una con su motivo.

const RAIZ = path.resolve(import.meta.dirname, "..");

/** Sitio público: estilo propio de cada banda, no el del panel. */
const PUBLICO = [
  /^modulos\/[^/]+\/publico(\/|\.tsx$)/,
  /^modulos\/[^/]+\/publica\.tsx$/,
  /^modulos\/sitio\/vista\//,
  /^src\/app\/publico\.tsx$/,
  /^src\/app\/\[\.\.\.ruta\]\//,
];

const EXCEPCIONES: Record<string, string> = {
  "modulos/ticketera/panel/puerta-cliente.tsx":
    "Puerta: pantalla a medida para un celular en el venue (botones enormes, resultado a pantalla completa).",
  "src/app/error.tsx": "Error global: lo comparten el panel y el sitio público, con estilo neutro.",
  "src/app/ingresar/page.tsx": "Ingreso: pantalla de la plataforma todavía sin diseño (HTML sin estilos).",
};

const REGLAS: { usar: string; marca: RegExp }[] = [
  { usar: "Aviso", marca: /role="(alert|note|status)"/ },
  { usar: "Tarjeta", marca: /className="(?=[^"]*\brounded-xl\b)(?=[^"]*\bbg-primary\b)(?=[^"]*\bp-6\b)(?=[^"]*\bring-1\b)[^"]*"/ },
  { usar: "Boton (con href, para un enlace con forma de botón)", marca: /className="(?=[^"]*\bbg-brand-solid\b)(?=[^"]*\btext-white\b)[^"]*"/ },
  { usar: "Pestanas", marca: /\baria-current=/ },
  { usar: "Tabla", marca: /<table\b/ },
  { usar: "Boton", marca: /<button\b/ },
  { usar: "Campo, AreaTexto, Selector, Casilla, CampoArchivo o CampoColor", marca: /<(input(?![^>]*type="hidden")|select|textarea)\b/ },
];

function pantallas(dir: string): string[] {
  return readdirSync(path.join(RAIZ, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    if (statSync(path.join(RAIZ, rel)).isDirectory()) return pantallas(rel);
    return rel.endsWith(".tsx") ? [rel] : [];
  });
}

const revisadas = [...pantallas("src/app"), ...pantallas("modulos")].filter((f) => !PUBLICO.some((p) => p.test(f)) && !(f in EXCEPCIONES));

describe("las pantallas usan @/ui", () => {
  it("ninguna arma a mano un componente que el kit ya tiene", () => {
    const hallazgos = revisadas.flatMap((f) =>
      readFileSync(path.join(RAIZ, f), "utf8")
        .split("\n")
        .flatMap((linea, i) => REGLAS.filter((r) => r.marca.test(linea)).map((r) => `${f}:${i + 1} → usar ${r.usar}: ${linea.trim()}`)),
    );
    expect(hallazgos).toEqual([]);
  });

  it("revisa pantallas de verdad, y cada excepción existe", () => {
    expect(revisadas).toContain("modulos/tienda/panel/pedidos.tsx");
    expect(revisadas).toContain("src/app/admin/page.tsx");
    expect(revisadas).toContain("modulos/tienda/portal/paginas.tsx");
    for (const f of Object.keys(EXCEPCIONES)) expect(statSync(path.join(RAIZ, f)).isFile(), f).toBe(true);
  });

  it("las marcas detectan lo que tienen que detectar", () => {
    const detecta = (codigo: string) => REGLAS.filter((r) => r.marca.test(codigo)).map((r) => r.usar.split(" ")[0]);
    expect(detecta('<p role="alert" className="rounded-xl bg-error-primary p-4">')).toEqual(["Aviso"]);
    expect(detecta('<section className="flex rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary">')).toEqual(["Tarjeta"]);
    expect(detecta('<Link href="/x" className="rounded-lg bg-brand-solid px-3.5 text-white">')).toEqual(["Boton"]);
    expect(detecta('<Link aria-current={actual ? "page" : undefined}>')).toEqual(["Pestanas"]);
    expect(detecta('<input type="color" name="c" />')).toEqual(["Campo,"]);
    // No son componentes del kit: no se marcan.
    expect(detecta('<input type="hidden" name="volver" value={volver} />')).toEqual([]);
    expect(detecta('<div className="rounded-xl bg-primary p-4 ring-1 ring-secondary">')).toEqual([]);
    expect(detecta('<img className="size-16 rounded-xl bg-secondary" />')).toEqual([]);
    expect(detecta('<div className="h-full rounded-full bg-brand-solid" style={{ width }} />')).toEqual([]); // barra de progreso
  });
});
