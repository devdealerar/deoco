import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { problemasDeSecretos } from "@/nucleo/arranque";
import { prisma } from "@/nucleo/db/cliente";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { leerSecreto } from "@/nucleo/secretos";
import { borrarSecreto, guardarSecreto, secretosDeBanda } from "@/nucleo/secretos/carga";
import { dueno, escenarioAcceso } from "./apoyo";

// Dos módulos de mentira con su credencial cada uno: la "pasarela" y otro cualquiera.
const pasarela: Modulo = {
  id: "pasarela-falsa",
  nombre: "Pasarela",
  permisos: [],
  secretos: [{ clave: "access_token", etiqueta: "Access token" }],
};
const otro: Modulo = { id: "otro-falso", nombre: "Otro", permisos: [], secretos: [{ clave: "api_key", etiqueta: "API key" }] };
const reg = crearRegistro([pasarela, otro]);

const TOKEN = "APP_USR-1234567890-secreto-de-verdad-a1b2";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
});
beforeEach(async () => {
  await dueno.secreto.deleteMany();
  await dueno.auditoria.deleteMany();
  await dueno.moduloTenant.deleteMany();
  await dueno.moduloTenant.createMany({
    data: [
      { tenantId: e.a.id, moduloId: "pasarela-falsa" },
      { tenantId: e.a.id, moduloId: "otro-falso" },
      { tenantId: e.b.id, moduloId: "pasarela-falsa" },
    ],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await dueno.moduloTenant.deleteMany();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

// En A: multi es TITULAR, editor-a EDITOR. staff no tiene membresía.
const guardar = (usuarioId: string, tenantId = e.a.id, valor = TOKEN) =>
  guardarSecreto(usuarioId, tenantId, "pasarela-falsa", "access_token", valor, reg);

describe("cifrado en la base", () => {
  it("el titular lo carga; en la base no está en claro; el módulo dueño lo lee", async () => {
    await guardar(e.multi.id);
    const [fila] = await dueno.$queryRaw<{ cifrado: Buffer; texto: string }[]>`
      SELECT cifrado, row_to_json(s)::text AS texto FROM secreto s`;
    expect(fila.texto).not.toContain(TOKEN);
    expect(Buffer.from(fila.cifrado).includes(Buffer.from(TOKEN))).toBe(false);
    expect(fila.texto).not.toContain("1234567890");
    expect(await leerSecreto(pasarela, e.a.id, "access_token", reg)).toBe(TOKEN);
  });

  it("el cifrado está atado a su fila: copiado a otra banda no se descifra", async () => {
    await guardar(e.multi.id);
    const deA = await dueno.secreto.findFirstOrThrow({ where: { tenantId: e.a.id } });
    await dueno.secreto.create({
      data: { tenantId: e.b.id, moduloId: "pasarela-falsa", clave: "access_token", cifrado: deA.cifrado, actualizadoPor: e.multi.id },
    });
    await expect(leerSecreto(pasarela, e.b.id, "access_token", reg)).rejects.toThrow(/No se pudo descifrar/);
  });

  it("con otra clave de entorno no se lee, y el error no muestra nada del valor", async () => {
    await guardar(e.multi.id);
    const original = process.env.DEOCO_CLAVE_SECRETOS;
    process.env.DEOCO_CLAVE_SECRETOS = Buffer.alloc(32, 7).toString("base64");
    try {
      const error = await leerSecreto(pasarela, e.a.id, "access_token", reg).catch((x: Error) => x);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/cambió DEOCO_CLAVE_SECRETOS/);
      expect((error as Error).message).not.toContain("a1b2");
    } finally {
      process.env.DEOCO_CLAVE_SECRETOS = original;
    }
  });

  it("sin clave de entorno no guarda nada", async () => {
    const original = process.env.DEOCO_CLAVE_SECRETOS;
    delete process.env.DEOCO_CLAVE_SECRETOS;
    try {
      await expect(guardar(e.multi.id)).rejects.toThrow(/Falta DEOCO_CLAVE_SECRETOS/);
    } finally {
      process.env.DEOCO_CLAVE_SECRETOS = original;
    }
    expect(await dueno.secreto.count()).toBe(0);
  });
});

describe("legible solo por el módulo dueño", () => {
  it("otro módulo no puede leerlo: no lo declara", async () => {
    await guardar(e.multi.id);
    await expect(leerSecreto(otro, e.a.id, "access_token", reg)).rejects.toThrow(/no declara el secreto "access_token"/);
  });

  it("hacerse pasar por el dueño con un objeto copiado no sirve: tiene que ser el contrato registrado", async () => {
    await guardar(e.multi.id);
    const impostor: Modulo = { ...pasarela };
    await expect(leerSecreto(impostor, e.a.id, "access_token", reg)).rejects.toThrow(/no es un módulo registrado/);
  });

  it("otra banda no lo ve; con el módulo apagado tampoco se lee", async () => {
    await guardar(e.multi.id);
    expect(await leerSecreto(pasarela, e.b.id, "access_token", reg)).toBeNull();
    await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "pasarela-falsa" } });
    expect(await leerSecreto(pasarela, e.a.id, "access_token", reg)).toBeNull();
  });
});

describe("solo el titular lo carga", () => {
  it("ni otro rol ni el staff", async () => {
    await expect(guardar(e.editorA.id)).rejects.toThrow(/Solo el titular/);
    await expect(guardar(e.staff.id)).rejects.toThrow(/Solo el titular/);
    await expect(guardar(e.ajeno.id)).rejects.toThrow(/Solo el titular/); // de otra banda
    await guardar(e.multi.id);
    await expect(borrarSecreto(e.editorA.id, e.a.id, "pasarela-falsa", "access_token", reg)).rejects.toThrow(/Solo el titular/);
    expect(await dueno.secreto.count()).toBe(1);
  });

  it("solo claves declaradas y de módulos prendidos", async () => {
    await expect(guardarSecreto(e.multi.id, e.a.id, "pasarela-falsa", "otra_cosa", "x", reg)).rejects.toThrow(/no declara/);
    await expect(guardarSecreto(e.multi.id, e.a.id, "nadie", "x", "x", reg)).rejects.toThrow(/No existe el módulo/);
    await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "otro-falso" } });
    await expect(guardarSecreto(e.multi.id, e.a.id, "otro-falso", "api_key", "x", reg)).rejects.toThrow(/no está prendido/);
    await expect(guardar(e.multi.id, e.a.id, "   ")).rejects.toThrow(/Falta el valor/);
  });
});

describe("nunca visible completo", () => {
  it("la pantalla recibe solo si está cargado y una pista corta; la auditoría no lo guarda", async () => {
    const consola = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    await guardar(e.multi.id);
    const lista = await secretosDeBanda(e.a.id, reg);
    expect(lista).toEqual([
      expect.objectContaining({ moduloId: "pasarela-falsa", clave: "access_token", cargado: true, pista: "…a1b2" }),
      expect.objectContaining({ moduloId: "otro-falso", clave: "api_key", cargado: false, pista: "" }),
    ]);
    expect(JSON.stringify(lista)).not.toContain(TOKEN.slice(0, -4));

    const audit = await dueno.auditoria.findMany({ where: { tenantId: e.a.id } });
    expect(audit.map((a) => [a.accion, a.usuarioId, a.detalle])).toEqual([
      ["secreto.guardado", e.multi.id, { modulo: "pasarela-falsa", clave: "access_token" }],
    ]);

    await leerSecreto(pasarela, e.a.id, "access_token", reg);
    await borrarSecreto(e.multi.id, e.a.id, "pasarela-falsa", "access_token", reg);
    expect(await leerSecreto(pasarela, e.a.id, "access_token", reg)).toBeNull();
    // Nada de esto escribió el valor en los logs.
    for (const espia of consola) {
      expect(JSON.stringify(espia.mock.calls)).not.toContain("1234567890");
    }
  });

  it("si es corto, ni siquiera la pista", async () => {
    await guardar(e.multi.id, e.a.id, "corto");
    expect((await secretosDeBanda(e.a.id, reg))[0]).toMatchObject({ cargado: true, pista: "" });
  });

  it("reemplazar deja una sola fila, con el valor nuevo", async () => {
    await guardar(e.multi.id);
    await guardar(e.multi.id, e.a.id, "nuevo-token-de-la-banda-9999");
    expect(await dueno.secreto.count()).toBe(1);
    expect(await leerSecreto(pasarela, e.a.id, "access_token", reg)).toBe("nuevo-token-de-la-banda-9999");
  });
});

describe("contrato y arranque", () => {
  const base = { nombre: "x", permisos: [] };
  it.each([
    [[{ clave: "Token", etiqueta: "T" }], /clave inválida/],
    [[{ clave: "token", etiqueta: "T" }, { clave: "token", etiqueta: "T" }], /repetido/],
    [[{ clave: "token", etiqueta: " " }], /falta la etiqueta/],
  ])("el registro rechaza secretos mal declarados (%#)", (secretos, error) => {
    expect(() => crearRegistro([{ ...base, id: "m", secretos }])).toThrow(error);
  });

  it("sin módulos con secretos, la clave no hace falta; con alguno, sí (32 bytes)", () => {
    expect(problemasDeSecretos([{ ...base, id: "m" }], {})).toEqual([]);
    expect(problemasDeSecretos([pasarela], {})).toEqual([expect.stringMatching(/pasarela-falsa .*DEOCO_CLAVE_SECRETOS/)]);
    expect(problemasDeSecretos([pasarela], { DEOCO_CLAVE_SECRETOS: "corta" })).toHaveLength(1);
    expect(problemasDeSecretos([pasarela], { DEOCO_CLAVE_SECRETOS: Buffer.alloc(32).toString("base64") })).toEqual([]);
  });
});

describe("rotación de DEOCO_CLAVE_SECRETOS", () => {
  const VIEJA = Buffer.alloc(32, 1).toString("base64");
  const NUEVA = Buffer.alloc(32, 2).toString("base64");
  const entorno = { actual: process.env.DEOCO_CLAVE_SECRETOS, anterior: process.env.DEOCO_CLAVE_SECRETOS_ANTERIOR };
  afterEach(() => {
    process.env.DEOCO_CLAVE_SECRETOS = entorno.actual;
    if (entorno.anterior === undefined) delete process.env.DEOCO_CLAVE_SECRETOS_ANTERIOR;
    else process.env.DEOCO_CLAVE_SECRETOS_ANTERIOR = entorno.anterior;
  });

  async function conDueno<T>(fn: (db: import("pg").Client) => Promise<T>): Promise<T> {
    const { default: pg } = await import("pg");
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRACIONES });
    await db.connect();
    try {
      return await fn(db);
    } finally {
      await db.end();
    }
  }

  it("con la anterior configurada se sigue leyendo; el script recifra todo con la nueva y es repetible", async () => {
    const { leerClave, rotarSecretos } = await import("../scripts/rotar-clave-secretos.mjs");
    process.env.DEOCO_CLAVE_SECRETOS = VIEJA;
    await guardar(e.multi.id);

    // Paso 1: la nueva pasa a ser la actual y la vieja queda como anterior. Se sigue leyendo.
    process.env.DEOCO_CLAVE_SECRETOS = NUEVA;
    process.env.DEOCO_CLAVE_SECRETOS_ANTERIOR = VIEJA;
    expect(await leerSecreto(pasarela, e.a.id, "access_token", reg)).toBe(TOKEN);
    // Lo que se carga mientras tanto ya va con la nueva.
    await guardarSecreto(e.multi.id, e.a.id, "otro-falso", "api_key", "clave-cargada-durante-la-rotacion", reg);

    // Paso 2: el script.
    const r = await conDueno((db) => rotarSecretos(db, { anterior: leerClave(VIEJA)!, nueva: leerClave(NUEVA)! }));
    expect(r).toEqual({ recifradas: 1, yaEstaban: 1 });
    expect(await conDueno((db) => rotarSecretos(db, { anterior: leerClave(VIEJA)!, nueva: leerClave(NUEVA)! }))).toEqual({
      recifradas: 0,
      yaEstaban: 2,
    });

    // Paso 3: sin la anterior, todo se lee con la nueva.
    delete process.env.DEOCO_CLAVE_SECRETOS_ANTERIOR;
    expect(await leerSecreto(pasarela, e.a.id, "access_token", reg)).toBe(TOKEN);
    expect(await leerSecreto(otro, e.a.id, "api_key", reg)).toBe("clave-cargada-durante-la-rotacion");
  });

  it("si una no abre con ninguna de las dos, no cambia nada y dice cuál, sin el valor", async () => {
    const { leerClave, rotarSecretos } = await import("../scripts/rotar-clave-secretos.mjs");
    process.env.DEOCO_CLAVE_SECRETOS = VIEJA;
    await guardar(e.multi.id);
    process.env.DEOCO_CLAVE_SECRETOS = Buffer.alloc(32, 9).toString("base64"); // una tercera
    await guardarSecreto(e.multi.id, e.a.id, "otro-falso", "api_key", "cifrada-con-una-tercera-clave", reg);
    const antes = await dueno.secreto.findMany({ orderBy: { id: "asc" } });
    const error = await conDueno((db) => rotarSecretos(db, { anterior: leerClave(VIEJA)!, nueva: leerClave(NUEVA)! })).catch((x) => x);
    expect(error.message).toMatch(new RegExp(`1 credenciales .*\\n.*banda ${e.a.id} · otro-falso · api_key`));
    expect(error.message).not.toContain("tercera");
    expect(await dueno.secreto.findMany({ orderBy: { id: "asc" } })).toEqual(antes);
  });

  it("el arranque avisa si la anterior está mal escrita", () => {
    const ok = Buffer.alloc(32).toString("base64");
    expect(problemasDeSecretos([pasarela], { DEOCO_CLAVE_SECRETOS: ok, DEOCO_CLAVE_SECRETOS_ANTERIOR: "corta" })).toEqual([
      expect.stringMatching(/DEOCO_CLAVE_SECRETOS_ANTERIOR/),
    ]);
    expect(problemasDeSecretos([pasarela], { DEOCO_CLAVE_SECRETOS: ok, DEOCO_CLAVE_SECRETOS_ANTERIOR: VIEJA })).toEqual([]);
  });
});

describe("credenciales de cobro: de la tienda a Cobros (núcleo)", () => {
  it("el script las recifra en su nuevo lugar, el núcleo las lee, y es repetible", async () => {
    const { leerClave } = await import("../scripts/rotar-clave-secretos.mjs");
    const { cerrar } = await import("../scripts/rotar-clave-secretos.mjs");
    const { moverCredenciales } = await import("../scripts/mover-credenciales-de-cobro.mjs");
    const { pasarelaLista } = await import("@/nucleo/pagos");
    const tienda = (await import("../modulos/tienda")).default;
    const clave = leerClave(process.env.DEOCO_CLAVE_SECRETOS)!;
    // Como estaba guardada antes: módulo "tienda".
    await dueno.secreto.create({
      data: {
        tenantId: e.a.id, moduloId: "tienda", clave: "mercadopago_access_token", pista: "…a1b2", actualizadoPor: e.multi.id,
        cifrado: new Uint8Array(cerrar("APP_USR-vieja-a1b2", `deoco/secreto/${e.a.id}/tienda/mercadopago_access_token`, clave)),
      },
    });
    await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "tienda" } });
    const { default: pg } = await import("pg");
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRACIONES });
    await db.connect();
    try {
      expect(await moverCredenciales(db, clave)).toEqual({ movidas: 1, yaEstaban: 0 });
      expect(await moverCredenciales(db, clave)).toEqual({ movidas: 0, yaEstaban: 0 });
    } finally {
      await db.end();
    }
    expect((await dueno.secreto.findMany()).map((s) => [s.moduloId, s.clave, s.pista])).toEqual([["pagos", "mercadopago_access_token", "…a1b2"]]);
    expect(await pasarelaLista(tienda, e.a.id)).toMatchObject({ lista: true });
  });
});
