// Descubre los módulos: cada carpeta modulos/<id>/ con un index.ts(x).
// Genera src/generated/modulos.ts con los imports estáticos (Next empaqueta el
// código y no puede leer carpetas en tiempo de ejecución). El núcleo importa ese
// archivo y nunca nombra un módulo. Corre solo antes de dev, build, test y typecheck.
//
// Producción (`--produccion`, o NODE_ENV=production): se excluyen los módulos que
// tengan un archivo SOLO_DESARROLLO.md en su carpeta (p. ej. el módulo de verificación).
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const dirModulos = path.join(raiz, "modulos");
const salida = path.join(raiz, "src/generated/modulos.ts");

const produccion = process.argv.includes("--produccion") || process.env.NODE_ENV === "production";

const todos = existsSync(dirModulos)
  ? readdirSync(dirModulos, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((id) => ["index.ts", "index.tsx"].some((f) => existsSync(path.join(dirModulos, id, f))))
      .sort()
  : [];
const excluidos = produccion ? todos.filter((id) => existsSync(path.join(dirModulos, id, "SOLO_DESARROLLO.md"))) : [];
const ids = todos.filter((id) => !excluidos.includes(id));

const lineas = [
  `// GENERADO por scripts/descubrir-modulos.mjs (${produccion ? "producción" : "desarrollo"}). No editar ni versionar.`,
  'import type { Modulo } from "@/nucleo/modulos/contrato";',
  ...ids.map((id, i) => `import m${i} from "../../modulos/${id}";`),
  "",
  `export const modulosDescubiertos: Modulo[] = [${ids.map((_, i) => `m${i}`).join(", ")}];`,
  "",
];
mkdirSync(path.dirname(salida), { recursive: true });
writeFileSync(salida, lineas.join("\n"));
console.log(
  `módulos descubiertos: ${ids.join(", ") || "(ninguno)"}` +
    (excluidos.length ? ` · excluidos en producción: ${excluidos.join(", ")}` : ""),
);
