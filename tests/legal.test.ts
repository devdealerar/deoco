import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { esDiaHabil, sumarDiasHabiles } from "@/nucleo/fechas";
import { aceptarDocumentos, guardarDatosLegales, pendientesDeAceptar, textoVigente } from "@/nucleo/legal";
import { leerConsentimiento, registrarConsentimiento, valorDeCookie } from "@/nucleo/legal/cookies";
import { confirmarPedidoDeDatos, datosDeLaPersona, estaSuprimido, pedidosDeDatos, pedirSobreMisDatos, resolverPedidoDeDatos } from "@/nucleo/legal/derechos";
import { VERSION_COOKIES } from "@/nucleo/legal/textos";
import { decidirPorEstado, rutaPublicaDeModulo } from "@/nucleo/tenant/reglas";
import { dueno, escenarioAcceso } from "./apoyo";

// D2: legal y privacidad (docs/privacidad.md). La banda es responsable; Deoco, encargado.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const ORIGEN = "https://banda-a.deocoartist.com";
const FAN = "lucia@fan.com";

async function pedidoDeTienda(email: string, estado: "DESPACHADO" | "PAGADO") {
  return dueno.tiendaPedido.create({
    data: {
      tenantId: e.a.id, estado, nombre: "Lucía Pérez", email, telefono: "341 555-1234", calle: "Córdoba", numero: "1234", ciudad: "Rosario", provincia: "Santa Fe",
      codigoPostal: "2000", documento: "30111222", subtotal: 1000, envio: 0, envios: [], total: 1000, tokenHash: "h".repeat(64), fiscal: { comprador: { nombre: "Lucía Pérez" } },
    },
  });
}

/** Pide, toma el link del mail y confirma (como el fan). */
async function pedirYConfirmar(tipo: string, email = FAN, detalle = "") {
  vaciarBandeja();
  await pedirSobreMisDatos(e.a.id, { tipo, email, nombre: "Lucía", detalle }, ORIGEN);
  await esperarCorreos();
  const link = bandejaDeSalida().find((m) => m.para === email)!.texto.match(/#([0-9a-f]{48})/)![1];
  return confirmarPedidoDeDatos(e.a.id, link);
}

beforeAll(async () => {
  e = await escenarioAcceso();
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "tienda" }, { tenantId: e.a.id, moduloId: "ticketera" }], skipDuplicates: true });
});
beforeEach(async () => {
  await esperarCorreos();
  await dueno.pedidoDatos.deleteMany();
});
afterAll(async () => {
  await esperarCorreos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("política de privacidad y términos del sitio", () => {
  it("se arman con los datos del responsable y lo que la banda tiene prendido; cada cambio es una versión nueva", async () => {
    await guardarDatosLegales(e.a.id, e.multi.id, { responsable: "Los Satélites SRL", domicilio: "Córdoba 1234, Rosario", emailDatos: "datos@lossatelites.com", extraPrivacidad: "", extraTerminos: "" });
    const v1 = await textoVigente(e.a.id, "privacidad");
    expect(v1.contenido).toContain("Los Satélites SRL, con domicilio en Córdoba 1234, Rosario");
    expect(v1.contenido).toContain("datos@lossatelites.com");
    expect(v1.contenido).toContain("domicilio de envío"); // la tienda está prendida
    expect(v1.contenido).toContain("documento de cada asistente"); // la ticketera también
    expect(v1.contenido).toContain("Órgano de Control de la Ley N° 25.326"); // leyenda AAIP
    // Lo mismo, la misma versión; otro dato, una nueva (lo que vio cada fan queda guardado).
    expect((await textoVigente(e.a.id, "privacidad")).version).toBe(v1.version);
    await guardarDatosLegales(e.a.id, e.multi.id, { responsable: "Los Satélites SRL", domicilio: "Mitre 500, Rosario", emailDatos: "", extraPrivacidad: "", extraTerminos: "" });
    expect((await textoVigente(e.a.id, "privacidad")).version).toBe(v1.version + 1);
    const terminos = await textoVigente(e.a.id, "terminos");
    expect(terminos.contenido).toContain("## Entradas");
    expect(terminos.contenido).toContain("Arrepentimiento");
    // La de otra banda no se mezcla.
    expect((await textoVigente(e.b.id, "privacidad")).contenido).not.toContain("Satélites");
  });

  it("las páginas legales del sitio se abren en todos los estados (los plazos de la ley no se suspenden)", () => {
    for (const ruta of ["/privacidad", "/terminos", "/datos-personales", "/datos-personales/confirmar", "/arrepentimiento"]) {
      expect(rutaPublicaDeModulo(ruta)).toBe("legal");
      for (const estado of ["ACTIVO", "SUSPENDIDO", "ARCHIVADO"] as const) expect(decidirPorEstado(estado, "publico", "legal").tipo).toBe("seguir");
    }
  });
});

describe("lo que la banda le acepta a Deoco", () => {
  it("términos y contrato de encargo: pendientes hasta aceptar; queda quién, qué versión y cuándo; no se puede borrar", async () => {
    expect((await pendientesDeAceptar(e.a.id)).map((d) => d.id).sort()).toEqual(["encargo-tratamiento", "terminos-deoco"]);
    expect(await aceptarDocumentos(e.a.id, e.multi.id)).toBe(2);
    expect(await pendientesDeAceptar(e.a.id)).toEqual([]);
    expect(await aceptarDocumentos(e.a.id, e.multi.id)).toBe(0);
    const filas = await dueno.aceptacionLegal.findMany({ where: { tenantId: e.a.id } });
    expect(filas).toEqual(expect.arrayContaining([expect.objectContaining({ usuarioId: e.multi.id, documento: "encargo-tratamiento", aceptadoEn: expect.any(Date) })]));
    await expect(conTenant(e.a.id, (tx) => tx.aceptacionLegal.deleteMany())).rejects.toThrow();
    expect(await pendientesDeAceptar(e.b.id)).toHaveLength(2); // cada banda acepta por su cuenta
  });
});

describe("cookies", () => {
  it("cada decisión queda registrada (sin datos de la persona), se puede cambiar, y un aviso nuevo vuelve a preguntar", async () => {
    const c1 = await registrarConsentimiento(e.a.id, undefined, { analitica: false, marketing: false });
    expect(leerConsentimiento(valorDeCookie(c1))).toEqual(c1);
    const c2 = await registrarConsentimiento(e.a.id, valorDeCookie(c1), { analitica: true, marketing: false });
    expect(c2.visitante).toBe(c1.visitante); // el mismo visitante cambia de opinión
    expect(await dueno.consentimientoCookies.count({ where: { tenantId: e.a.id, visitante: c1.visitante } })).toBe(2);
    expect(leerConsentimiento(`${c1.visitante}.11.2020-01-01`)).toBeNull(); // otra versión del aviso: vuelve a preguntar
    expect(VERSION_COOKIES).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(conTenant(e.a.id, (tx) => tx.consentimientoCookies.deleteMany())).rejects.toThrow();
  });
});

describe("derechos del fan", () => {
  it("acceso: confirma el mail, vence a los 10 días corridos, la banda le manda todos sus datos", async () => {
    await pedidoDeTienda(FAN, "DESPACHADO");
    const antes = Date.now();
    const r = (await pedirYConfirmar("acceso"))!;
    expect(r.venceEn.getTime() - antes).toBeGreaterThan(9.5 * 86_400_000);
    expect(r.venceEn.getTime() - antes).toBeLessThan(11 * 86_400_000);
    // El link sirve una vez.
    const [p] = await pedidosDeDatos(e.a.id);
    expect(p).toMatchObject({ estado: "abierto", tipo: "acceso", tokenHash: null });
    // La banda ve sus datos de todos los módulos.
    const datos = await datosDeLaPersona(e.a.id, FAN);
    expect(datos.find((s) => s.titulo === "Pedidos de la tienda")!.filas[0]).toMatchObject({ nombre: "Lucía Pérez", domicilio: "Córdoba 1234" });
    vaciarBandeja();
    await resolverPedidoDeDatos(e.a.id, p.id, e.multi.id, { estado: "resuelto", respuesta: "" });
    await esperarCorreos();
    const mail = bandejaDeSalida().find((m) => m.para === FAN)!;
    const json = JSON.parse(mail.adjuntos!.find((a) => a.nombre === "mis-datos.json")!.contenido.toString());
    expect(json.secciones.map((s: { titulo: string }) => s.titulo)).toContain("Pedidos de la tienda");
    expect(await dueno.auditoria.count({ where: { tenantId: e.a.id, accion: "legal.pedido_resuelto" } })).toBe(1);
  });

  it("borrado: vence en 5 días hábiles; se anonimiza lo terminado, se conserva lo en curso y el comprobante, y el email queda en la lista (en hash)", async () => {
    const terminado = await pedidoDeTienda("borrar@fan.com", "DESPACHADO");
    const enCurso = await pedidoDeTienda("borrar@fan.com", "PAGADO");
    const r = (await pedirYConfirmar("supresion", "borrar@fan.com"))!;
    expect(r.tipo).toBe("supresion");
    const [p] = await pedidosDeDatos(e.a.id);
    vaciarBandeja();
    await resolverPedidoDeDatos(e.a.id, p.id, e.multi.id, { estado: "resuelto", respuesta: "" });
    expect(await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: terminado.id } })).toMatchObject({ nombre: "Anónimo", telefono: "", calle: "", documento: null, fiscal: { comprador: { nombre: "Lucía Pérez" } } });
    expect((await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: enCurso.id } })).nombre).toBe("Lucía Pérez");
    expect(await estaSuprimido(e.a.id, "Borrar@Fan.com")).toBe(true);
    expect(await estaSuprimido(e.b.id, "borrar@fan.com")).toBe(false);
    expect((await dueno.supresionDatos.findFirstOrThrow({ where: { tenantId: e.a.id } })).emailHash).not.toContain("borrar");
    await esperarCorreos();
    const aviso = bandejaDeSalida().find((m) => m.para === "borrar@fan.com")!;
    expect(aviso.texto).toContain("en curso");
    expect(aviso.texto).toContain("obligación legal");
  });

  it("rechazar exige motivo; sin confirmar el mail no corre; un pedido de otra banda no se toca", async () => {
    await pedirSobreMisDatos(e.a.id, { tipo: "oposicion", email: "otro@fan.com", nombre: "", detalle: "" }, ORIGEN);
    expect(await pedidosDeDatos(e.a.id)).toEqual([]); // sin verificar no aparece
    await pedirYConfirmar("rectificacion", FAN, "Mi apellido es Pérez, no Perez");
    const [p] = await pedidosDeDatos(e.a.id);
    await expect(resolverPedidoDeDatos(e.a.id, p.id, e.multi.id, { estado: "rechazado", respuesta: "" })).rejects.toThrow(/explicá por qué/);
    await expect(resolverPedidoDeDatos(e.b.id, p.id, e.multi.id, { estado: "resuelto", respuesta: "" })).rejects.toThrow(/no está abierto/);
    await expect(pedirSobreMisDatos(e.a.id, { tipo: "rectificacion", email: FAN, nombre: "", detalle: "" }, ORIGEN)).rejects.toThrow(/qué dato hay que corregir/);
  });

  it("los 5 días hábiles saltan fines de semana y feriados (y el 24 de marzo)", () => {
    expect(esDiaHabil(new Date("2026-03-24T15:00:00Z"))).toBe(false);
    expect(esDiaHabil(new Date("2026-03-21T15:00:00Z"))).toBe(false); // sábado
    expect(esDiaHabil(new Date("2026-03-25T15:00:00Z"))).toBe(true);
    // Viernes 20 de marzo de 2026 + 5 hábiles: 23, 25, 26, 27, 30 (el 24 es feriado).
    expect(sumarDiasHabiles(new Date("2026-03-20T15:00:00Z"), 5).toISOString().slice(0, 10)).toBe("2026-03-31"); // 23:59 -03 = 02:59 Z del 31
  });
});
