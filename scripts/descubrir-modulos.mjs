// Descubre los módulos: cada carpeta modulos/<id>/ con un index.ts(x).
//
// 1. Genera src/generated/modulos.ts con los imports estáticos (Next empaqueta el
//    código y no puede leer carpetas en tiempo de ejecución). El núcleo importa ese
//    archivo y nunca nombra un módulo.
// 2. Copia modulos/<id>/esquema.prisma a prisma/schema/modulos/<id>.prisma, validando
//    las reglas de tablas de módulos (prefijo, tenantId). Prisma lee toda la carpeta.
//
// Lo corren next.config.ts (next dev / next build) y npm (postinstall, test, typecheck).
// Producción (`--produccion`, o NODE_ENV=production): se excluyen los módulos que
// tengan un archivo SOLO_DESARROLLO.md en su carpeta (p. ej. el módulo de verificación).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(import.meta.dirname, "..");
const dirModulos = path.join(raiz, "modulos");
const salida = path.join(raiz, "src/generated/modulos.ts");
const dirEsquemas = path.join(raiz, "prisma/schema/modulos");

/** "sitio" → "Sitio", "press-kit" → "PressKit" */
export function pascal(id) {
  return id.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
}

/**
 * Reglas de un esquema de módulo. Devuelve la lista de problemas (vacía = válido).
 * - Modelos y enums empiezan con el id del módulo en PascalCase (SitioPerfil).
 * - Cada modelo mapea a una tabla `<id>_...` (@@map) y tiene `tenantId String @db.Uuid`.
 * - Sin generator ni datasource: esos son del núcleo.
 */
export function problemasEsquema(id, esquema) {
  const problemas = [];
  const prefijo = pascal(id);
  // `/// @global` justo antes del modelo: tabla de módulo sin banda (deoco_tabla_global).
  const globales = new Set([...esquema.matchAll(/\/\/\/\s*@global\s*\n(?:\s*\/\/\/.*\n)*\s*model\s+(\w+)/g)].map((m) => m[1]));
  const sinComentarios = esquema.replace(/\/\/.*$/gm, "");
  if (/^\s*(generator|datasource)\s/m.test(sinComentarios)) {
    problemas.push("no puede declarar generator ni datasource (son del núcleo)");
  }
  for (const [, tipo, nombre, cuerpo] of sinComentarios.matchAll(/^\s*(model|enum|type|view)\s+(\w+)\s*\{([^}]*)\}/gm)) {
    if (tipo === "type" || tipo === "view") {
      problemas.push(`${tipo} ${nombre}: solo se admiten model y enum`);
      continue;
    }
    if (!nombre.startsWith(prefijo)) problemas.push(`${tipo} ${nombre}: tiene que empezar con "${prefijo}"`);
    if (tipo !== "model") continue;
    const map = /@@map\(\s*"([^"]+)"\s*\)/.exec(cuerpo)?.[1];
    if (!map) problemas.push(`model ${nombre}: falta @@map("${id.replace(/-/g, "_")}_...")`);
    else if (!map.startsWith(`${id.replace(/-/g, "_")}_`)) {
      problemas.push(`model ${nombre}: la tabla "${map}" tiene que empezar con "${id.replace(/-/g, "_")}_"`);
    }
    const conTenant = /^\s*tenantId\s/m.test(cuerpo);
    if (globales.has(nombre)) {
      if (conTenant) problemas.push(`model ${nombre}: es @global y no puede tener tenantId`);
    } else if (!/^\s*tenantId\s+String\s[^\n]*@db\.Uuid\b/m.test(cuerpo)) {
      problemas.push(`model ${nombre}: falta "tenantId String @db.Uuid" (o marcalo /// @global si no es de una banda)`);
    }
  }
  return problemas;
}

export function descubrir({ produccion = false } = {}) {
  const todos = existsSync(dirModulos)
    ? readdirSync(dirModulos, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((id) => ["index.ts", "index.tsx"].some((f) => existsSync(path.join(dirModulos, id, f))))
        .sort()
    : [];
  const soloDesarrollo = (id) => existsSync(path.join(dirModulos, id, "SOLO_DESARROLLO.md"));
  const excluidos = produccion ? todos.filter(soloDesarrollo) : [];
  const ids = todos.filter((id) => !excluidos.includes(id));

  // Esquemas: se validan todos y se copian los de los módulos incluidos.
  const errores = [];
  const esquemas = [];
  for (const id of todos) {
    const archivo = path.join(dirModulos, id, "esquema.prisma");
    if (!existsSync(archivo)) continue;
    if (soloDesarrollo(id)) {
      errores.push(`modulos/${id}: un módulo SOLO_DESARROLLO no puede declarar tablas`);
      continue;
    }
    const contenido = readFileSync(archivo, "utf8");
    for (const p of problemasEsquema(id, contenido)) errores.push(`modulos/${id}/esquema.prisma: ${p}`);
    if (ids.includes(id)) esquemas.push({ id, contenido });
  }
  if (errores.length > 0) {
    throw new Error(`Esquemas de módulos inválidos:\n  - ${errores.join("\n  - ")}`);
  }

  rmSync(dirEsquemas, { recursive: true, force: true });
  mkdirSync(dirEsquemas, { recursive: true });
  for (const { id, contenido } of esquemas) {
    writeFileSync(
      path.join(dirEsquemas, `${id}.prisma`),
      `// COPIADO de modulos/${id}/esquema.prisma por scripts/descubrir-modulos.mjs. No editar.\n\n${contenido}`,
    );
  }

  const lineas = [
    `// GENERADO por scripts/descubrir-modulos.mjs (${produccion ? "producción" : "desarrollo"}). No editar ni versionar.`,
    'import type { Modulo } from "@/nucleo/modulos/contrato";',
    ...ids.map((id, i) => `import m${i} from "../../modulos/${id}";`),
    "",
    `export const modulosDescubiertos: Modulo[] = [${ids.map((_, i) => `m${i}`).join(", ")}];`,
    "",
    "/** Para qué se generó esta lista. En producción, el arranque exige \"produccion\". */",
    `export const generadoPara: "produccion" | "desarrollo" = "${produccion ? "produccion" : "desarrollo"}";`,
    "",
  ];
  mkdirSync(path.dirname(salida), { recursive: true });
  writeFileSync(salida, lineas.join("\n"));
  return { ids, excluidos, esquemas: esquemas.map((e) => e.id) };
}

// Uso por línea de comandos.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const produccion = process.argv.includes("--produccion") || process.env.NODE_ENV === "production";
  try {
    const { ids, excluidos, esquemas } = descubrir({ produccion });
    console.log(
      `módulos descubiertos: ${ids.join(", ") || "(ninguno)"}` +
        (esquemas.length ? ` · con tablas: ${esquemas.join(", ")}` : "") +
        (excluidos.length ? ` · excluidos en producción: ${excluidos.join(", ")}` : ""),
    );
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
