// Descubre los módulos: cada carpeta modulos/<id>/ con un index.ts(x).
// Genera src/generated/modulos.ts con los imports estáticos (Next empaqueta el
// código y no puede leer carpetas en tiempo de ejecución). El núcleo importa ese
// archivo y nunca nombra un módulo. Corre solo antes de dev, build, test y typecheck.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const dirModulos = path.join(raiz, "modulos");
const salida = path.join(raiz, "src/generated/modulos.ts");

const ids = existsSync(dirModulos)
  ? readdirSync(dirModulos, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((id) => ["index.ts", "index.tsx"].some((f) => existsSync(path.join(dirModulos, id, f))))
      .sort()
  : [];

const lineas = [
  "// GENERADO por scripts/descubrir-modulos.mjs. No editar ni versionar.",
  'import type { Modulo } from "@/nucleo/modulos/contrato";',
  ...ids.map((id, i) => `import m${i} from "../../modulos/${id}";`),
  "",
  `export const modulosDescubiertos: Modulo[] = [${ids.map((_, i) => `m${i}`).join(", ")}];`,
  "",
];
mkdirSync(path.dirname(salida), { recursive: true });
writeFileSync(salida, lineas.join("\n"));
console.log(`módulos descubiertos: ${ids.join(", ") || "(ninguno)"}`);
