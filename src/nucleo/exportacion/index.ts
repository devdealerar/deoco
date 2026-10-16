// Exportación completa de los datos de la banda (td3, regla inviolable: "los datos son de la
// banda, con exportación completa siempre disponible: sin pedir permiso y sin trámite de baja").
//
// - Qué: TODAS las tablas con datos de la banda (núcleo y módulos, también de módulos apagados):
//   un CSV y un JSON por tabla, más los archivos originales y un LEEME. El núcleo no nombra
//   módulos: recorre el catálogo de la base (toda tabla con `tenantId`) y lee bajo RLS
//   (`conTenant`): solo salen las filas de esta banda.
// - Qué no: lo que es una llave, no un dato (hashes, tokens, credenciales cifradas, IPs en hash)
//   y los cuerpos y adjuntos de los mails (pesados; el registro del envío sí va).
// - Cómo: se pide desde el panel (solo el titular, en cualquier estado de la banda), se arma en
//   segundo plano, se avisa por mail al titular y se baja desde el panel hasta `venceEn` (7 días);
//   después el zip se borra. Una en curso por banda (la base lo impone).
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import { almacen } from "@/nucleo/archivos/almacen";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";

export class ErrorExportacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorExportacion";
  }
}

/** Cuánto se puede bajar una exportación lista. Después, el zip se borra. */
export const DIAS_DISPONIBLE = 7;
const LOTE = 2000;
/** Una "armando" sin terminar en este tiempo quedó colgada (el proceso se reinició). */
const COLGADA_MS = 30 * 60_000;

/** Columnas que no se exportan: llaves y secretos, no datos de la banda. */
const NO_SE_EXPORTA = new Set(["cifrado", "hashContrasena", "tokenHash", "tokenCifrado", "token", "ipHash", "adjuntos", "html", "cabeceras"]);

const claveDelZip = (tenantId: string, id: string) => `exportaciones/${tenantId}/${id}.zip`;

/** La banda pide su exportación. Si ya hay una en curso, devuelve esa. */
export async function pedirExportacion(tenantId: string, usuarioId: string): Promise<{ id: string; yaEstaba: boolean }> {
  const r = await conTenant(tenantId, async (tx) => {
    const enCurso = await tx.exportacion.findFirst({ where: { estado: { in: ["pendiente", "armando"] } }, select: { id: true } });
    if (enCurso) return { id: enCurso.id, yaEstaba: true };
    const { id } = await tx.exportacion.create({ data: { tenantId, pedidaPor: usuarioId }, select: { id: true } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "exportacion.pedida", detalle: { exportacionId: id } } });
    return { id, yaEstaba: false };
  });
  if (!r.yaEstaba) programar(tenantId, r.id);
  return r;
}

/** Las exportaciones de la banda, la última primero. */
export const exportacionesDe = (tenantId: string) => conTenant(tenantId, (tx) => tx.exportacion.findMany({ orderBy: { creadoEn: "desc" }, take: 10 }));

let enCurso: Promise<unknown> = Promise.resolve();
/** Arma en segundo plano, de a una por proceso (son pesadas). */
function programar(tenantId: string, id: string) {
  enCurso = enCurso.then(() => armarExportacion(tenantId, id)).catch((e) => console.error(`[exportacion] ${tenantId}/${id}:`, e));
}
/** Para pruebas: espera a que terminen las que se están armando. */
export const esperarExportaciones = async () => {
  await enCurso;
};

/**
 * Arma el zip. Se "toma" en la base (estado armando) antes de empezar: nunca dos a la vez. Al
 * terminar: lista, con vencimiento, y mail al titular. Si falla: fallida, con el error (el
 * titular la puede volver a pedir).
 */
export async function armarExportacion(tenantId: string, id: string, ahora = new Date()): Promise<void> {
  const tomada = await conTenant(tenantId, (tx) =>
    tx.exportacion.updateMany({
      where: { id, OR: [{ estado: "pendiente" }, { estado: "armando", tomadaEn: { lt: new Date(ahora.getTime() - COLGADA_MS) } }] },
      data: { estado: "armando", tomadaEn: new Date(), intentos: { increment: 1 } },
    }),
  );
  if (tomada.count === 0) return;
  const dir = await mkdtemp(path.join(tmpdir(), "deoco-exportacion-"));
  try {
    const { ruta, tablas, archivos } = await construirZip(tenantId, dir);
    const { size } = await stat(ruta);
    await almacen().guardarDesde(claveDelZip(tenantId, id), ruta);
    const venceEn = new Date(Date.now() + DIAS_DISPONIBLE * 86_400_000);
    await conTenant(tenantId, async (tx) => {
      await tx.exportacion.update({ where: { id }, data: { estado: "lista", terminadaEn: new Date(), venceEn, bytes: BigInt(size), tablas, archivos, error: null } });
      await avisarAlTitular(
        tenantId,
        {
          clave: `exportacion:${id}`,
          asunto: (b) => `${b}: tu exportación está lista`,
          parrafos: () => [
            `Ya está el archivo con todos los datos de tu banda: ${tablas} tablas (un CSV y un JSON por cada una) y ${archivos} archivos originales.`,
            `Lo podés bajar desde el panel hasta el ${venceEn.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" })}. Después se borra (podés pedir otra cuando quieras).`,
          ],
          boton: { texto: "Bajar la exportación", ruta: "/exportar" },
        },
        { tx },
      );
    });
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`[exportacion] no se pudo armar ${tenantId}/${id}:`, e);
    await conTenant(tenantId, (tx) => tx.exportacion.update({ where: { id }, data: { estado: "fallida", terminadaEn: new Date(), error } }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Las tablas con datos de la banda: todas las que tienen `tenantId`, más la de la banda. */
async function tablasDeBanda(): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ t: string }[]>`
    SELECT DISTINCT table_name AS t FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenantId'
    ORDER BY 1`;
  return ["tenant", ...filas.map((f) => f.t)];
}

const comillas = (t: string) => `"${t.replace(/"/g, '""')}"`;

function valor(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return null; // binarios: no son datos legibles
  return v;
}

function celda(v: unknown): string {
  const x = valor(v);
  if (x === null) return "";
  const s = typeof x === "object" ? JSON.stringify(x) : String(x);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Lee la tabla de a lotes, bajo RLS (solo esta banda), y escribe su CSV y su JSON. */
async function exportarTabla(tenantId: string, tabla: string, dir: string): Promise<{ csv: string; json: string; filas: number }> {
  const csv = path.join(dir, `${tabla}.csv`);
  const json = path.join(dir, `${tabla}.json`);
  const outCsv = createWriteStream(csv);
  const outJson = createWriteStream(json);
  const escribir = (o: NodeJS.WritableStream, s: string) => new Promise<void>((ok, mal) => o.write(s, (e) => (e ? mal(e) : ok())));
  let columnas: string[] | null = null;
  let filas = 0;
  await escribir(outCsv, "﻿"); // BOM: Excel lo abre como UTF-8
  await escribir(outJson, "[");
  for (let desde = 0; ; desde += LOTE) {
    const lote = await conTenant(tenantId, (tx) => tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${comillas(tabla)} ORDER BY ctid LIMIT ${LOTE} OFFSET ${desde}`));
    if (lote.length === 0) break;
    if (!columnas) {
      columnas = Object.keys(lote[0]).filter((c) => !NO_SE_EXPORTA.has(c) && !/(Hash|Cifrado)$/.test(c));
      await escribir(outCsv, columnas.map(celda).join(",") + "\r\n");
    }
    for (const fila of lote) {
      await escribir(outCsv, columnas.map((c) => celda(fila[c])).join(",") + "\r\n");
      await escribir(outJson, (filas === 0 ? "\n" : ",\n") + JSON.stringify(Object.fromEntries(columnas.map((c) => [c, valor(fila[c])]))));
      filas++;
    }
    if (lote.length < LOTE) break;
  }
  await escribir(outJson, filas ? "\n]\n" : "]\n");
  await Promise.all([new Promise((ok) => outCsv.end(ok)), new Promise((ok) => outJson.end(ok))]);
  return { csv, json, filas };
}

const seguro = (s: string) => s.replace(/[/\\\0:*?"<>|]/g, "_").slice(0, 150);

async function construirZip(tenantId: string, dir: string): Promise<{ ruta: string; tablas: number; archivos: number }> {
  const zip = new ZipFile();
  const ruta = path.join(dir, "exportacion.zip");
  const salida = pipeline(zip.outputStream, createWriteStream(ruta));
  const resumen: string[] = [];
  let tablas = 0;
  for (const tabla of await tablasDeBanda()) {
    const r = await exportarTabla(tenantId, tabla, dir);
    if (r.filas === 0) continue;
    zip.addFile(r.csv, `tablas/csv/${tabla}.csv`);
    zip.addFile(r.json, `tablas/json/${tabla}.json`);
    resumen.push(`  ${tabla}: ${r.filas} filas`);
    tablas++;
  }
  // El equipo con nombre y email (la tabla de personas no es de la banda: se exporta lo suyo).
  const equipo = await conTenant(tenantId, (tx) => tx.$queryRaw<{ nombre: string; email: string; rol: string }[]>`SELECT nombre, email, rol FROM miembros_de_banda()`);
  const equipoCsv = path.join(dir, "equipo.csv");
  await writeFile(equipoCsv, "﻿" + ["nombre,email,rol", ...equipo.map((m) => [m.nombre, m.email, m.rol].map(celda).join(","))].join("\r\n") + "\r\n");
  zip.addFile(equipoCsv, "equipo.csv");

  // Los archivos originales (y sus versiones livianas no: se regeneran).
  const lista = await conTenant(tenantId, (tx) => tx.archivo.findMany({ select: { id: true, nombre: true, moduloId: true, recurso: true } }));
  let archivos = 0;
  for (const a of lista) {
    const flujo = await almacen().leer(`${tenantId}/${a.id}`);
    if (!flujo) continue;
    zip.addReadStream(Readable.fromWeb(flujo as Parameters<typeof Readable.fromWeb>[0]), `archivos/${seguro(a.moduloId)}/${seguro(a.recurso ?? "otros")}/${a.id}-${seguro(a.nombre)}`);
    archivos++;
  }

  const banda = await conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true, slug: true } }));
  zip.addBuffer(
    Buffer.from(
      [
        `Exportación completa de ${banda.nombre} (${banda.slug}) en Deoco`,
        `Fecha: ${new Date().toISOString()}`,
        "Formato: versión 1",
        "",
        "Los datos son de la banda. Este archivo tiene todo lo que Deoco guarda de ella:",
        "- tablas/csv/<tabla>.csv: una planilla por tabla (UTF-8; se abre con Excel o LibreOffice).",
        "- tablas/json/<tabla>.json: lo mismo en JSON, para pasarlo a otro sistema.",
        "  Las relaciones van por id (por ejemplo, tienda_pedido_item.pedidoId → tienda_pedido.id).",
        "- equipo.csv: las personas de la banda con su rol.",
        "- archivos/<módulo>/<recurso>/<id>-<nombre>: los originales que subió la banda.",
        "",
        "No incluye lo que es una llave y no un dato: contraseñas, tokens de acceso, credenciales",
        "cifradas de las pasarelas, IPs (solo se guardan como hash) ni el cuerpo de los mails enviados.",
        "",
        "Tablas:",
        ...resumen,
        "",
      ].join("\n"),
      "utf8",
    ),
    "LEEME.txt",
  );
  zip.end();
  await salida;
  return { ruta, tablas, archivos };
}

/** Bajar el zip: el flujo y su nombre. null si no está lista o ya venció. */
export async function zipDeExportacion(tenantId: string, id: string, ahora = new Date()) {
  const e = await conTenant(tenantId, (tx) => tx.exportacion.findUnique({ where: { id } }));
  if (!e || e.estado !== "lista" || !e.venceEn || e.venceEn < ahora) return null;
  const flujo = await almacen().leer(claveDelZip(tenantId, id));
  if (!flujo) return null;
  return { flujo, bytes: e.bytes, nombre: `deoco-exportacion-${e.creadoEn.toISOString().slice(0, 10)}.zip` };
}

/**
 * Barrido: arma las pendientes (y las colgadas) y borra los zips vencidos, en todas las bandas.
 * Corre aparte del barrido principal (puede tardar).
 */
export async function revisarExportaciones(ahora = new Date()): Promise<void> {
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM exportaciones_por_revisar(${ahora}::timestamp) AS b`;
  for (const { id: tenantId } of bandas) {
    const filas = await conTenant(tenantId, (tx) => tx.exportacion.findMany({ where: { estado: { in: ["pendiente", "armando", "lista"] } } }));
    for (const e of filas) {
      if (e.estado === "lista" && e.venceEn && e.venceEn < ahora) {
        await almacen().borrar(claveDelZip(tenantId, e.id));
        await conTenant(tenantId, (tx) => tx.exportacion.update({ where: { id: e.id }, data: { estado: "vencida" } }));
      } else if (e.estado !== "lista") {
        await armarExportacion(tenantId, e.id, ahora);
      }
    }
  }
}
