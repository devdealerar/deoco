import { afterAll, beforeAll, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { almacen } from "@/nucleo/archivos/almacen";
import { bandejaDeSalida, esperarCorreos } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { esperarExportaciones, exportacionesDe, pedirExportacion, revisarExportaciones, zipDeExportacion } from "@/nucleo/exportacion";
import { decidirPorEstado, rutaPanelBanda } from "@/nucleo/tenant/reglas";
import { dueno, escenarioAcceso } from "./apoyo";

// td3 (regla inviolable): los datos son de la banda, con exportación completa siempre disponible.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

/** Lee un zip entero a memoria: { ruta → contenido }. */
async function leerZip(buf: Buffer): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((ok, mal) => yauzl.fromBuffer(buf, { lazyEntries: true }, (err, z) => (err ? mal(err) : ok(z!))));
  const out = new Map<string, Buffer>();
  await new Promise<void>((ok, mal) => {
    zip.on("entry", (en: yauzl.Entry) => {
      zip.openReadStream(en, (err, s) => {
        if (err) return mal(err);
        const partes: Buffer[] = [];
        s!.on("data", (d: Buffer) => partes.push(d));
        s!.on("end", () => {
          out.set(en.fileName, Buffer.concat(partes));
          zip.readEntry();
        });
      });
    });
    zip.on("end", ok);
    zip.on("error", mal);
    zip.readEntry();
  });
  return out;
}

beforeAll(async () => {
  e = await escenarioAcceso();
  for (const [t, nombre] of [[e.a.id, "Show de A"], [e.b.id, "Show de B"]] as const) {
    await dueno.ticketeraEvento.create({ data: { tenantId: t, nombre, fecha: new Date(), lugar: "Club", ciudad: "Rosario" } });
  }
  await dueno.secreto.create({ data: { tenantId: e.a.id, moduloId: "pagos", clave: "mercadopago_access_token", cifrado: Buffer.from("secreto-cifrado"), pista: "…1234", actualizadoPor: e.multi.id } });
  const archivo = await dueno.archivo.create({ data: { tenantId: e.a.id, moduloId: "sitio", recurso: "slide", nombre: "foto, de prueba.jpg", tipo: "jpeg", bytes: BigInt(5) } });
  await almacen().guardar(`${e.a.id}/${archivo.id}`, Buffer.from("FOTO!"));
  await dueno.correo.create({ data: { tenantId: e.a.id, moduloId: "tienda", para: "fan@x.com", nombreRemitente: "A", asunto: "Tu pedido", html: "<p>cuerpo pesado</p>", texto: "cuerpo", estado: "ENVIADO" } });
});
afterAll(async () => {
  await esperarExportaciones();
  await esperarCorreos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("exportar todo", () => {
  it("todas las tablas de la banda (y solo de ella), CSV y JSON, los archivos originales y un LEEME; sin llaves ni secretos", async () => {
    const { id } = await pedirExportacion(e.a.id, e.multi.id);
    // Una en curso por banda: pedirla de nuevo devuelve la misma.
    expect((await pedirExportacion(e.a.id, e.multi.id)).id).toBe(id);
    await esperarExportaciones();
    const [fila] = await exportacionesDe(e.a.id);
    expect(fila).toMatchObject({ id, estado: "lista", venceEn: expect.any(Date) });
    const zip = (await zipDeExportacion(e.a.id, id))!;
    const archivos = await leerZip(Buffer.from(await new Response(zip.flujo).arrayBuffer()));
    const nombres = [...archivos.keys()];
    expect(nombres).toContain("LEEME.txt");
    expect(nombres).toContain("equipo.csv");
    expect(nombres).toContain("tablas/csv/tenant.csv");
    expect(nombres).toContain("tablas/json/ticketera_evento.json");
    const texto = (n: string) => archivos.get(n)!.toString("utf8");
    // Solo esta banda (RLS).
    expect(texto("tablas/csv/tenant.csv")).toContain("Banda A");
    expect(texto("tablas/csv/tenant.csv")).not.toContain("Banda B");
    expect(texto("tablas/csv/ticketera_evento.csv")).toContain("Show de A");
    expect(texto("tablas/csv/ticketera_evento.csv")).not.toContain("Show de B");
    expect(JSON.parse(texto("tablas/json/ticketera_evento.json"))).toEqual([expect.objectContaining({ nombre: "Show de A" })]);
    // CSV con BOM (Excel) y comillas donde hace falta.
    expect(archivos.get("tablas/csv/archivo.csv")!.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(texto("tablas/csv/archivo.csv")).toContain('"foto, de prueba.jpg"');
    // El equipo con nombre, email y rol.
    expect(texto("equipo.csv")).toContain("multi@x.com,TITULAR");
    // Sin llaves: la credencial cifrada no sale (la fila sí: qué credencial cargó y su pista).
    expect(texto("tablas/csv/secreto.csv")).toContain("mercadopago_access_token");
    expect(texto("tablas/csv/secreto.csv")).not.toContain("cifrado");
    expect(texto("tablas/csv/correo.csv")).not.toContain("cuerpo pesado");
    expect(texto("tablas/csv/correo.csv")).toContain("Tu pedido");
    // El original, con su nombre.
    const foto = nombres.find((n) => n.startsWith("archivos/sitio/slide/") && n.endsWith("foto, de prueba.jpg"))!;
    expect(archivos.get(foto)!.toString()).toBe("FOTO!");
    // Aviso por mail al titular y registro en la actividad.
    await esperarCorreos();
    expect(bandejaDeSalida().some((m) => m.para === "multi@x.com" && m.asunto.includes("tu exportación está lista"))).toBe(true);
    expect(await dueno.auditoria.count({ where: { tenantId: e.a.id, accion: "exportacion.pedida" } })).toBe(1);
  });

  it("vence a los 7 días: después el zip se borra y no se puede bajar", async () => {
    const [fila] = await exportacionesDe(e.a.id);
    const dentroDeOcho = new Date(Date.now() + 8 * 86_400_000);
    expect(await zipDeExportacion(e.a.id, fila.id, dentroDeOcho)).toBeNull();
    await revisarExportaciones(dentroDeOcho);
    expect((await dueno.exportacion.findUniqueOrThrow({ where: { id: fila.id } })).estado).toBe("vencida");
    expect(await almacen().leer(`exportaciones/${e.a.id}/${fila.id}.zip`)).toBeNull();
  });

  it("disponible en todos los estados de la banda, también suspendida o archivada (solo el titular)", () => {
    const ruta = rutaPanelBanda("/b/banda-a/exportar")!;
    for (const estado of ["ACTIVO", "SOLO_LECTURA", "SUSPENDIDO", "ARCHIVADO"] as const) {
      expect(decidirPorEstado(estado, "panel", ruta.subruta).tipo).toBe("seguir");
    }
    expect(decidirPorEstado("ARCHIVADO", "panel", ruta.subruta)).toMatchObject({ soloTitular: true });
  });
});
