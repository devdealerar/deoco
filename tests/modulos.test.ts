import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { prisma } from "@/nucleo/db/cliente";
import { registro } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { apagarModulo, modulosPrendidos, prenderModulo } from "@/nucleo/modulos/encendido";
import { menuPanel, pestanasSitio } from "@/nucleo/modulos/navegacion";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { puede } from "@/nucleo/permisos/puede";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
});
beforeEach(async () => {
  await dueno.moduloTenant.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const nada = () => null;
/** Módulo mínimo válido, para probar validaciones. */
function mod(id: string, extra: Partial<Modulo> = {}): Modulo {
  return { id, nombre: id, permisos: [], ...extra };
}

describe("prueba 1: el módulo de prueba se registra", () => {
  it("se descubre en modulos/prueba sin nombrarlo en el núcleo", () => {
    const reg = registro();
    expect(reg.modulo("prueba")?.nombre).toBe("Módulo de prueba");
    expect(reg.permiso("prueba.contenido.ver")?.moduloId).toBe("prueba");
    expect(reg.permiso("prueba.pasarela.conectar")?.exclusivoTitular).toBe(true);
    expect(reg.rutaPanel("/prueba")?.moduloId).toBe("prueba");
    expect(reg.rutaPublica("/prueba")?.moduloId).toBe("prueba");
  });

  it("prendido, aparece en el menú del panel y en las pestañas públicas", async () => {
    await prenderModulo(e.staff.id, e.a.id, "prueba");
    const prendidos = await modulosPrendidos(e.a.id);
    const acceso = (await resolverAcceso(e.multi.id, e.a.id))!;
    expect(menuPanel(registro(), prendidos, acceso, "banda-a")).toEqual([
      { etiqueta: "Prueba", href: "/b/banda-a/prueba", moduloId: "prueba" },
    ]);
    expect(pestanasSitio(registro(), prendidos)).toEqual([
      { etiqueta: "Prueba", href: "/prueba", moduloId: "prueba" },
    ]);
  });

  it("está apagado por defecto", async () => {
    expect(await modulosPrendidos(e.a.id)).toEqual(new Set());
  });
});

describe("prueba 2: apagado", () => {
  it("sin entradas de menú ni pestañas, y puede() false en sus permisos", async () => {
    const acceso = (await resolverAcceso(e.multi.id, e.a.id))!;
    const prendidos = await modulosPrendidos(e.a.id);
    expect(menuPanel(registro(), prendidos, acceso, "banda-a")).toEqual([]);
    expect(pestanasSitio(registro(), prendidos)).toEqual([]);
    expect(await puede(e.multi.id, e.a.id, "prueba.contenido.ver")).toBe(false);
    expect(await puede(e.multi.id, e.a.id, "prueba.pasarela.conectar")).toBe(false);
    expect(await puede(e.staff.id, e.a.id, "prueba.contenido.ver")).toBe(false);
  });

  it("apagarlo después de prenderlo vuelve a cerrar todo", async () => {
    await prenderModulo(e.staff.id, e.a.id, "prueba");
    expect(await puede(e.multi.id, e.a.id, "prueba.contenido.ver")).toBe(true);
    await apagarModulo(e.staff.id, e.a.id, "prueba");
    expect(await puede(e.multi.id, e.a.id, "prueba.contenido.ver")).toBe(false);
  });
});

describe("prueba 3: prendido en A, apagado en B", () => {
  it("cada banda ve lo suyo", async () => {
    await prenderModulo(e.staff.id, e.a.id, "prueba");
    expect(await modulosPrendidos(e.a.id)).toEqual(new Set(["prueba"]));
    expect(await modulosPrendidos(e.b.id)).toEqual(new Set());
    // mismo usuario, mismo rol que alcanza en las dos: solo en A
    expect(await puede(e.multi.id, e.a.id, "prueba.contenido.ver")).toBe(true);
    expect(await puede(e.multi.id, e.b.id, "prueba.contenido.ver")).toBe(false);
    expect(pestanasSitio(registro(), await modulosPrendidos(e.b.id))).toEqual([]);
  });
});

describe("prueba 4: dependencias, validadas al prender", () => {
  const reg = crearRegistro([mod("base"), mod("dependiente", { dependencias: ["base"] })]);

  it("prender sin la dependencia falla con un error claro y no prende nada", async () => {
    await expect(prenderModulo(e.staff.id, e.a.id, "dependiente", reg)).rejects.toThrow(
      'No se puede prender "dependiente": necesita "base", que no está prendido para esta banda.',
    );
    expect(await dueno.moduloTenant.count()).toBe(0);
  });

  it("con la dependencia prendida, prende", async () => {
    await prenderModulo(e.staff.id, e.a.id, "base", reg);
    await prenderModulo(e.staff.id, e.a.id, "dependiente", reg);
    expect(await modulosPrendidos(e.a.id, reg)).toEqual(new Set(["base", "dependiente"]));
  });

  it("la dependencia prendida en otra banda no cuenta", async () => {
    await prenderModulo(e.staff.id, e.b.id, "base", reg);
    await expect(prenderModulo(e.staff.id, e.a.id, "dependiente", reg)).rejects.toThrow(/necesita "base"/);
  });

  it("apagar un módulo que otro prendido usa falla, nombrando quién lo usa", async () => {
    await prenderModulo(e.staff.id, e.a.id, "base", reg);
    await prenderModulo(e.staff.id, e.a.id, "dependiente", reg);
    await expect(apagarModulo(e.staff.id, e.a.id, "base", reg)).rejects.toThrow(
      'No se puede apagar "base": lo usa "dependiente", que está prendido para esta banda.',
    );
    expect(await modulosPrendidos(e.a.id, reg)).toEqual(new Set(["base", "dependiente"]));
    // en orden, sí se puede
    await apagarModulo(e.staff.id, e.a.id, "dependiente", reg);
    await apagarModulo(e.staff.id, e.a.id, "base", reg);
    expect(await modulosPrendidos(e.a.id, reg)).toEqual(new Set());
  });

  it("prender y apagar es solo del staff", async () => {
    await expect(prenderModulo(e.multi.id, e.a.id, "prueba")).rejects.toThrow(/Solo el staff/);
    await prenderModulo(e.staff.id, e.a.id, "prueba");
    await expect(apagarModulo(e.multi.id, e.a.id, "prueba")).rejects.toThrow(/Solo el staff/);
    expect(await modulosPrendidos(e.a.id)).toEqual(new Set(["prueba"]));
  });

  it("un módulo inexistente no se puede prender", async () => {
    await expect(prenderModulo(e.staff.id, e.a.id, "fantasma")).rejects.toThrow('No existe el módulo "fantasma".');
  });

  it("una dependencia faltante en el código no rompe el arranque", () => {
    expect(() => crearRegistro([mod("solo", { dependencias: ["no-existe"] })])).not.toThrow();
  });
});

describe("prueba 5: sin el permiso no ve la entrada de menú", () => {
  it("LECTURA en B, con el módulo prendido en B", async () => {
    await prenderModulo(e.staff.id, e.b.id, "prueba");
    const prendidos = await modulosPrendidos(e.b.id);
    const lectura = (await resolverAcceso(e.ajeno.id, e.b.id))!;
    const editor = (await resolverAcceso(e.multi.id, e.b.id))!;
    expect(menuPanel(registro(), prendidos, lectura, "banda-b")).toEqual([]);
    expect(menuPanel(registro(), prendidos, editor, "banda-b")).toHaveLength(1);
    // la pestaña pública no depende de permisos
    expect(pestanasSitio(registro(), prendidos)).toHaveLength(1);
  });
});

describe("navegación ordenada por el número que declara cada módulo", () => {
  it("el núcleo ordena por `orden`, no por el orden de descubrimiento", () => {
    const pagina = { ruta: "/x", componente: nada };
    const reg = crearRegistro([
      mod("c", { rutasPublicas: [{ ...pagina, ruta: "/c" }], navegacion: [{ etiqueta: "C", href: "/c", publica: true, orden: 30 }] }),
      mod("a", { rutasPublicas: [{ ...pagina, ruta: "/a" }], navegacion: [{ etiqueta: "A", href: "/a", publica: true, orden: 10 }] }),
      mod("b", { rutasPublicas: [{ ...pagina, ruta: "/b2" }], navegacion: [{ etiqueta: "B", href: "/b2", publica: true, orden: 20 }] }),
    ]);
    expect(pestanasSitio(reg, new Set(["a", "b", "c"])).map((p) => p.etiqueta)).toEqual(["A", "B", "C"]);
    expect(pestanasSitio(reg, new Set(["c", "a"])).map((p) => p.etiqueta)).toEqual(["A", "C"]);
  });
});

describe("pestañas públicas de módulos nuevos (tienda, ticketera) junto a las del sitio", () => {
  // Módulos de mentira con la forma que tendrían tienda y ticketera: solo declaran su
  // ruta y su pestaña. El sitio es el real, sin tocar.
  const pagina = { componente: nada };
  const tienda = mod("tienda-falsa", {
    rutasPublicas: [{ ...pagina, ruta: "/merch" }, { ...pagina, ruta: "/merch/[producto]" }],
    navegacion: [{ etiqueta: "Merch", href: "/merch", publica: true, orden: 30 }],
  });
  const ticketera = mod("ticketera-falsa", {
    rutasPublicas: [{ ...pagina, ruta: "/shows" }],
    navegacion: [{ etiqueta: "Shows", href: "/shows", publica: true, orden: 15 }],
  });
  const reales = registro().modulos;

  it("entran solas, en el orden declarado, intercaladas con las del sitio", () => {
    const reg = crearRegistro([...reales, tienda, ticketera]);
    const sitio = reg.marcoPublico!.moduloId;
    const pestanas = (prendidos: string[]) => pestanasSitio(reg, new Set([sitio, ...prendidos])).map((p) => p.etiqueta);
    expect(pestanas([])).toEqual(["Home", "Press kit"]);
    expect(pestanas(["tienda-falsa"])).toEqual(["Home", "Press kit", "Merch"]);
    expect(pestanas(["tienda-falsa", "ticketera-falsa"])).toEqual(["Home", "Shows", "Press kit", "Merch"]);
  });

  it("sus rutas (también las dinámicas) quedan bajo el marco del sitio", () => {
    const reg = crearRegistro([...reales, tienda]);
    expect(reg.rutaPublica("/merch/remera-negra")).toMatchObject({ moduloId: "tienda-falsa", params: { producto: "remera-negra" } });
    expect(reg.marcoPublico?.moduloId).not.toBe("tienda-falsa");
  });
});

describe("parámetros de consulta para los módulos", () => {
  it("de los searchParams de Next a URLSearchParams, con repetidos en orden", async () => {
    const { consultaDe } = await import("@/nucleo/modulos/consulta");
    const c = consultaDe({ estado: "aprobado", talle: ["m", "l"], vacio: "", nada: undefined });
    expect(c.get("estado")).toBe("aprobado");
    expect(c.getAll("talle")).toEqual(["m", "l"]);
    expect(c.get("vacio")).toBe("");
    expect(c.has("nada")).toBe(false);
    expect([...consultaDe(undefined)]).toEqual([]);
  });
});

describe("cabecera del sitio público y pestaña activa", () => {
  it("un solo módulo aporta el elemento de cabecera, como el marco", () => {
    const cabecera = () => null;
    expect(crearRegistro([mod("a", { cabeceraPublica: cabecera })]).cabeceraPublica?.moduloId).toBe("a");
    expect(() => crearRegistro([mod("a", { cabeceraPublica: cabecera }), mod("b", { cabeceraPublica: cabecera })])).toThrow(
      /cabeceraPublica: ya la aporta "a"/,
    );
  });

  it("la pestaña activa se decide por segmento, no por prefijo", async () => {
    const { pestanaActiva } = await import("../modulos/sitio/vista/marco");
    expect(pestanaActiva("/tienda", "/tienda")).toBe(true);
    expect(pestanaActiva("/tienda", "/tienda/remera")).toBe(true);
    expect(pestanaActiva("/tienda", "/tiendas")).toBe(false);
    expect(pestanaActiva("/prensa", "/prensario")).toBe(false);
    expect(pestanaActiva("/", "/prensa")).toBe(false);
    expect(pestanaActiva("/", "/")).toBe(true);
  });
});

describe("rutas de módulos", () => {
  it("segmentos dinámicos, y las fijas ganan sobre las dinámicas", () => {
    const reg = crearRegistro([
      mod("x", {
        rutasPanel: [
          { ruta: "/x/[id]", componente: nada },
          { ruta: "/x/nuevo", componente: nada },
        ],
      }),
    ]);
    expect(reg.rutaPanel("/x/42")?.params).toEqual({ id: "42" });
    expect(reg.rutaPanel("/x/nuevo")?.ruta.ruta).toBe("/x/nuevo");
    expect(reg.rutaPanel("/x/42/mas")).toBeUndefined();
    expect(reg.rutaPanel("/otra")).toBeUndefined();
  });
});

describe("el registro valida el contrato al arrancar", () => {
  const casos: [string, Modulo[], RegExp][] = [
    ["id inválido", [mod("Mal_Id")], /id inválido/],
    ["id repetido", [mod("a"), mod("a")], /id repetido/],
    ["depende de sí mismo", [mod("a", { dependencias: ["a"] })], /sí mismo/],
    ["formato de permiso", [mod("a", { permisos: [{ clave: "a.editar", rolesPorDefecto: [] }] })], /modulo\.recurso\.accion/],
    ["permiso ajeno", [mod("a", { permisos: [{ clave: "b.x.y", rolesPorDefecto: [] }] })], /solo puede declarar permisos a\.\*/],
    [
      "permiso repetido",
      [mod("a", { permisos: [{ clave: "a.x.y", rolesPorDefecto: [] }, { clave: "a.x.y", rolesPorDefecto: [] }] })],
      /repetido/,
    ],
    [
      "exclusivoTitular con otros roles",
      [mod("a", { permisos: [{ clave: "a.pasarela.conectar", rolesPorDefecto: ["TITULAR", "COMERCIAL"], exclusivoTitular: true }] })],
      /exclusivoTitular/,
    ],
    ["ruta de panel del núcleo: /pago", [mod("a", { rutasPanel: [{ ruta: "/pago", componente: nada }] })], /es del núcleo/],
    ["ruta de panel del núcleo: /", [mod("a", { rutasPanel: [{ ruta: "/", componente: nada }] })], /es del núcleo/],
    ["ruta pública del núcleo", [mod("a", { rutasPublicas: [{ ruta: "/api/x", componente: nada }] })], /es del núcleo/],
    ["ruta inválida", [mod("a", { rutasPanel: [{ ruta: "sin-barra", componente: nada }] })], /ruta inválida/],
    [
      "dos módulos, misma ruta",
      [mod("a", { rutasPanel: [{ ruta: "/x/[id]", componente: nada }] }), mod("b", { rutasPanel: [{ ruta: "/x/[slug]", componente: nada }] })],
      /ya la declara "a"/,
    ],
    [
      "ruta con permiso de otro módulo",
      [mod("a", { permisos: [{ clave: "a.x.ver", rolesPorDefecto: [] }] }), mod("b", { rutasPanel: [{ ruta: "/b", permiso: "a.x.ver", componente: nada }] })],
      /no lo declara este módulo/,
    ],
    [
      "pestaña pública con permiso",
      [mod("a", { permisos: [{ clave: "a.x.ver", rolesPorDefecto: [] }], rutasPublicas: [{ ruta: "/a", componente: nada }], navegacion: [{ etiqueta: "A", href: "/a", publica: true, permiso: "a.x.ver", orden: 1 }] })],
      /no llevan permiso/,
    ],
    ["dos marcos públicos", [mod("a", { marcoPublico: nada }), mod("b", { marcoPublico: nada })], /ya lo aporta "a"/],
    ["ruta pública del núcleo: /archivos", [mod("a", { rutasPublicas: [{ ruta: "/archivos/x", componente: nada }] })], /es del núcleo/],
    [
      "navegación a una ruta que no existe",
      [mod("a", { navegacion: [{ etiqueta: "A", href: "/a", orden: 1 }] })],
      /no es una ruta de panel del módulo/,
    ],
  ];
  it.each(casos)("%s", (_, modulos, error) => {
    expect(() => crearRegistro(modulos)).toThrow(error);
  });
});

describe("regla de oro: el núcleo no nombra módulos", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? archivos(p) : [p];
    });
  }
  it("ningún id de módulo aparece en src/nucleo, src/app ni src/proxy.ts", () => {
    const fuentes = [...archivos("src/nucleo"), ...archivos("src/app"), "src/proxy.ts"].filter((f) =>
      /\.(ts|tsx)$/.test(f),
    );
    for (const m of registro().modulos) {
      const nombrado = new RegExp(`["'\`/]${m.id}["'\`/.]`);
      const culpables = fuentes.filter((f) => nombrado.test(readFileSync(f, "utf8")));
      expect(culpables, `"${m.id}" aparece en el núcleo`).toEqual([]);
    }
  });
});

describe("un módulo nunca importa código de otro (ni lo que es solo del núcleo)", () => {
  const PROHIBIDOS = [
    /^@\/generated\/modulos/, // la lista de todos los módulos
    /^@\/nucleo\/modulos(?!\/contrato$)/, // el registro: daría acceso al contrato de otros módulos
    /^@\/nucleo\/secretos\//, // carga y cifrado: un módulo solo lee lo suyo con leerSecreto
    /^@\/app\//,
    /^@\/\.\./,
  ];
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? archivos(p) : [p];
    });
  }
  const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;

  it("solo rutas relativas dentro de su carpeta y, del núcleo, lo permitido", () => {
    const problemas: string[] = [];
    for (const id of readdirSync("modulos").filter((d) => statSync(path.join("modulos", d)).isDirectory())) {
      const raiz = path.resolve("modulos", id);
      for (const f of archivos(raiz).filter((x) => /\.(ts|tsx|mjs|js)$/.test(x))) {
        for (const [, spec] of readFileSync(f, "utf8").matchAll(IMPORT)) {
          const fuera = spec.startsWith(".") && !path.resolve(path.dirname(f), spec).startsWith(raiz + path.sep);
          if (fuera || PROHIBIDOS.some((r) => r.test(spec))) problemas.push(`${path.relative(".", f)}: "${spec}"`);
        }
      }
    }
    expect(problemas).toEqual([]);
  });
});
