import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { atenderAviso, atenderAvisoPlataforma } from "@/nucleo/avisos";
import { ErrorLimite } from "@/nucleo/cuenta";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { crearSuscripcion } from "@/nucleo/pagos/cuota";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import comercial from "../modulos/comercial";
import {
  type ComoStaff,
  alCrearBanda,
  asignarPlan,
  cancelar,
  cuentaDe,
  decidir,
  elegirPlan,
  guardarPlan,
  guardarPlazos,
  plazos,
  planes,
  revisarVencimientos,
  sumarMes,
} from "../modulos/comercial/cuenta";
import tienda from "../modulos/tienda";
import { type ComoStaff as ComoStaffTienda, crearProductoBase, crearProveedor, leerOpciones } from "../modulos/tienda/catalogo";
import { crearProducto, publicarProducto, subirDiseno } from "../modulos/tienda/productos";
import { crearEvento, crearTipo, publicarEvento } from "../modulos/ticketera/eventos";
import { dueno, escenarioAcceso } from "./apoyo";
import { MercadoPagoFalso } from "./mercadopago-falso";

// Planes y cuota mensual (módulo comercial) contra la base de pruebas y un Mercado Pago falso.
// La cuota se cobra con la cuenta de DEOCO (entorno); las ventas, con la de la banda (secreto).

const mp = new MercadoPagoFalso();
const TOKEN_DEOCO = "APP_USR-DEOCO-cuenta-de-la-plataforma";
const TOKEN_BANDA = "APP_USR-BANDA-A-cuenta-de-la-banda";
const DIA = 86_400_000;
let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let comoStaff: ComoStaff;
let remeraBase: { id: string };

/** Precios (en centavos) que pone el staff: sin precio, un plan no se puede elegir. */
async function ponerPrecios() {
  const precios = { esencial: 800000, medium: 2000000, premium: 4500000 };
  for (const [id, precio] of Object.entries(precios)) await dueno.comercialPlan.update({ where: { id }, data: { precio } });
}

const avisoCuota = (tipo: "subscription_preapproval" | "subscription_authorized_payment", id: string) =>
  atenderAvisoPlataforma(
    new Request("http://app.deocoartist.com/avisos/plataforma/comercial/cuota/mercadopago", {
      method: "POST",
      body: JSON.stringify({ type: tipo, data: { id } }),
      headers: { "content-type": "application/json" },
    }),
    { moduloId: "comercial", path: "/cuota/mercadopago" },
  );

/** El titular elige un plan, carga la tarjeta en la pasarela de Deoco y la suscripción queda autorizada. */
async function suscribir(tenantId: string, slug: string, planId: string) {
  const r = await elegirPlan(tenantId, slug, planId);
  expect(r).toHaveProperty("redireccion");
  const id = (await cuentaDe(tenantId))!.suscripcionId!;
  mp.autorizar(id);
  expect((await avisoCuota("subscription_preapproval", id)).status).toBe(200);
  return id;
}

const estado = async (tenantId: string) => (await dueno.tenant.findUniqueOrThrow({ where: { id: tenantId } })).estado;
const png = () => sharp({ create: { width: 3000, height: 3000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();

async function productos(tenantId: string, n: number) {
  const d = await subirDiseno(tenantId, "Logo", { nombre: "logo.png", datos: await png() });
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await crearProducto(tenantId, remeraBase.id, { disenoId: d.id, nombre: `Remera ${i + 1}`, descripcion: "", precio: 2500000, variantes: [{ nombre: "Talle", valores: ["M"] }] });
    ids.push(p.id);
  }
  return ids;
}

beforeAll(async () => {
  await mp.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  process.env.DEOCO_CUOTA_MP_TOKEN = TOKEN_DEOCO;
  e = await escenarioAcceso();
  comoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  const sur = await crearProveedor(comoStaff as ComoStaffTienda, { nombre: "Estampados Sur", email: "ordenes@sur.com", contacto: "", formatos: ["png"] });
  remeraBase = await crearProductoBase(comoStaff as ComoStaffTienda, {
    nombre: "Remera", descripcion: "", opciones: leerOpciones("Talle: M"), costoProduccion: 900000, costoEnvio: 350000, proveedorId: sur.id,
    impresionDpi: 300, impresionFormatos: ["png"], impresionAnchoPx: 3000, impresionAltoPx: 3000,
  });
});
beforeEach(async () => {
  mp.limpiar();
  vaciarBandeja();
  for (const t of ["tiendaProducto", "tiendaDiseno", "ticketeraEvento", "comercialCobro", "comercialCuenta", "moduloTenant", "limiteBanda", "correo", "secreto"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.tenant.updateMany({ data: { estado: "ACTIVO", limiteAlmacenamiento: null } });
  await dueno.comercialPlan.updateMany({ data: { precio: null } });
  await ponerPrecios();
});
afterAll(async () => {
  await mp.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("planes", () => {
  it("una banda nueva arranca en prueba con el plan de prueba (Medium): sus módulos y sus topes", async () => {
    await alCrearBanda(e.a.id);
    const c = (await cuentaDe(e.a.id))!;
    expect(c.planId).toBe("medium");
    expect(c.pruebaHasta!.getTime() - Date.now()).toBeGreaterThan(13.9 * DIA);
    expect([...(await modulosPrendidos(e.a.id))].sort()).toEqual(["comercial", "sitio", "tienda"]);
    expect(await dueno.limiteBanda.findMany({ where: { tenantId: e.a.id }, select: { limite: true, maximo: true } })).toEqual([
      { limite: "tienda.productos-publicados", maximo: 20 },
    ]);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).limiteAlmacenamiento).toBe(BigInt(5 * 1024 ** 3));
  });

  it("el plan prende y apaga módulos (lo apagado conserva sus datos)", async () => {
    await alCrearBanda(e.a.id);
    const [p] = await productos(e.a.id, 1);
    await asignarPlan(comoStaff, e.a.id, "premium", null);
    expect([...(await modulosPrendidos(e.a.id))].sort()).toEqual(["comercial", "sitio", "ticketera", "tienda"]);
    await asignarPlan(comoStaff, e.a.id, "esencial", null);
    expect([...(await modulosPrendidos(e.a.id))].sort()).toEqual(["comercial", "sitio"]);
    expect(await dueno.tiendaProducto.findUnique({ where: { id: p } })).not.toBeNull();
    // Queda en la auditoría quién lo hizo.
    expect(await dueno.auditoria.count({ where: { accion: "comercial.plan_asignado", usuarioId: e.staff.id } })).toBe(2);
  });

  it("al llegar al tope no se publica más, y el mensaje dice qué plan lo resuelve", async () => {
    await alCrearBanda(e.a.id);
    const medium = (await planes()).find((p) => p.id === "medium")!;
    await guardarPlan(comoStaff, "medium", { ...medium, topes: { "tienda.productos-publicados": 2 } });
    const ids = await productos(e.a.id, 3);
    await publicarProducto(e.a.id, ids[0], true);
    await publicarProducto(e.a.id, ids[1], true);
    const error = await publicarProducto(e.a.id, ids[2], true).catch((x) => x);
    expect(error).toBeInstanceOf(ErrorLimite);
    expect(error.message).toContain("Tu plan permite hasta 2 productos publicados y ya llegaste.");
    expect(error.message).toContain("pasate al plan Premium (hasta 100)");
    // No se rompió nada: los dos publicados siguen publicados.
    expect(await dueno.tiendaProducto.count({ where: { tenantId: e.a.id, publicado: true } })).toBe(2);
  });

  it("al bajar de plan se despublica lo sobrante, lo último publicado primero, sin borrar", async () => {
    await alCrearBanda(e.a.id);
    await asignarPlan(comoStaff, e.a.id, "premium", null);
    const ids = await productos(e.a.id, 4);
    for (const id of ids) {
      await publicarProducto(e.a.id, id, true);
      await new Promise((r) => setTimeout(r, 5));
    }
    const show = (n: number) => ({ nombre: `Show ${n}`, fecha: new Date(Date.now() + (n + 1) * DIA), lugar: "Club", ciudad: "Rosario", direccion: "", descripcion: "" });
    const shows: string[] = [];
    for (let i = 0; i < 2; i++) {
      shows.push(await crearEvento(e.a.id, show(i)));
      await crearTipo(e.a.id, shows[i], { nombre: "General", precio: 1000000, cupo: 100, ventaDesde: null, ventaHasta: null });
      await publicarEvento(e.a.id, shows[i], true);
    }
    // Un plan a medida con topes más bajos (y la ticketera prendida).
    await asignarPlan(comoStaff, e.a.id, "premium", {
      precio: null, modulos: ["sitio", "tienda", "ticketera"], almacenamiento: null,
      topes: { "tienda.productos-publicados": 2, "ticketera.shows-publicados": 1 },
    });
    const publicados = await dueno.tiendaProducto.findMany({ where: { tenantId: e.a.id }, select: { id: true, publicado: true } });
    expect(publicados).toHaveLength(4);
    expect(publicados.filter((p) => p.publicado).map((p) => p.id).sort()).toEqual([ids[0], ids[1]].sort());
    const ev = await dueno.ticketeraEvento.findMany({ where: { tenantId: e.a.id }, select: { id: true, publicado: true } });
    expect(ev).toHaveLength(2);
    expect(ev.filter((x) => x.publicado).map((x) => x.id)).toEqual([shows[0]]);
  });
});

describe("cuota", () => {
  it("elegir un plan lleva a la pasarela de DEOCO; al autorizarse, el plan se aplica", async () => {
    await alCrearBanda(e.a.id);
    const r = await elegirPlan(e.a.id, "banda-a", "premium");
    expect("redireccion" in r && r.redireccion).toMatch(/\/suscribir\?id=/);
    const c = (await cuentaDe(e.a.id))!;
    expect(c).toMatchObject({ planId: "medium", planElegido: "premium", suscripcionEstado: "pendiente" });
    const s = mp.suscripciones.get(c.suscripcionId!)!;
    expect(s).toMatchObject({ token: TOKEN_DEOCO, external_reference: e.a.id, monto: 45000 });
    // El mail del titular (la banda A tiene dos).
    expect(["a@x.com", "multi@x.com"]).toContain(s.payer_email);
    // Primer cobro al terminar la prueba (no ahora).
    expect(new Date(s.start_date!).getTime()).toBe(c.pruebaHasta!.getTime());
    mp.autorizar(c.suscripcionId!);
    await avisoCuota("subscription_preapproval", c.suscripcionId!);
    expect(await cuentaDe(e.a.id)).toMatchObject({ planId: "premium", planElegido: null, suscripcionEstado: "activa", medioDePago: "visa" });
    expect(await modulosPrendidos(e.a.id)).toContain("ticketera");
  });

  it("con la suscripción activa, cambiar de plan es inmediato y el monto nuevo va desde el próximo cobro", async () => {
    await alCrearBanda(e.a.id);
    const id = await suscribir(e.a.id, "banda-a", "premium");
    const r = await elegirPlan(e.a.id, "banda-a", "esencial");
    expect(r).toMatchObject({ mensaje: expect.stringContaining("Listo: ya tenés el plan Esencial") });
    expect(await modulosPrendidos(e.a.id)).not.toContain("tienda");
    expect(mp.suscripciones.get(id)!.monto).toBe(8000);
  });

  it("el pago regulariza al instante: SUSPENDIDO → ACTIVO con el aviso del cobro aprobado", async () => {
    await alCrearBanda(e.a.id);
    const id = await suscribir(e.a.id, "banda-a", "medium");
    await avisoCuota("subscription_authorized_payment", mp.cobrar(id, false));
    await revisarVencimientos(new Date(Date.now() + 61 * DIA));
    expect(await estado(e.a.id)).toBe("SUSPENDIDO");
    await avisoCuota("subscription_authorized_payment", mp.cobrar(id, true));
    expect(await estado(e.a.id)).toBe("ACTIVO");
    const c = (await cuentaDe(e.a.id))!;
    expect(c.moraDesde).toBeNull();
    expect(c.pruebaHasta).toBeNull();
    expect(c.pagoHasta!.getTime()).toBeGreaterThan(Date.now() + 27 * DIA);
  });

  it("con la suscripción autorizada, el fin de la prueba no suspende: espera el cobro", async () => {
    await alCrearBanda(e.a.id);
    await suscribir(e.a.id, "banda-a", "medium");
    await revisarVencimientos(new Date(Date.now() + 15 * DIA));
    expect(await estado(e.a.id)).toBe("ACTIVO");
    // Sin cobro después de la gracia (3 días): mora.
    await revisarVencimientos(new Date(Date.now() + 18 * DIA));
    expect(await estado(e.a.id)).toBe("MOROSO");
  });

  it("cancelar deja de cobrar; la cuenta sigue hasta el vencimiento", async () => {
    await alCrearBanda(e.a.id);
    const id = await suscribir(e.a.id, "banda-a", "medium");
    expect(await cancelar(e.a.id)).toContain("El panel sigue funcionando hasta el");
    expect(mp.suscripciones.get(id)!.status).toBe("cancelled");
    expect(await estado(e.a.id)).toBe("ACTIVO");
  });

  it("un aviso con firma inválida no entra (401); uno de otra pasarela, 404", async () => {
    process.env.DEOCO_CUOTA_MP_SECRETO_AVISOS = "secreto-de-deoco";
    try {
      expect((await avisoCuota("subscription_preapproval", "sus-x")).status).toBe(401);
    } finally {
      delete process.env.DEOCO_CUOTA_MP_SECRETO_AVISOS;
    }
    const otra = await atenderAvisoPlataforma(new Request("http://app.deocoartist.com/x", { method: "POST", body: "{}" }), { moduloId: "comercial", path: "/cuota/otra" });
    expect(otra.status).toBe(404);
  });
});

describe("la cuota y las ventas de la banda nunca se mezclan", () => {
  it("cuenta, credenciales y tablas distintas", async () => {
    await alCrearBanda(e.a.id);
    // La banda tiene su propia cuenta de cobro cargada (secreto del núcleo, módulo pagos).
    await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", TOKEN_BANDA);
    const id = await suscribir(e.a.id, "banda-a", "medium");

    // 1. Cuenta y credenciales: la suscripción se crea con el token de DEOCO (entorno), nunca con el de la banda.
    expect(mp.suscripciones.get(id)!.token).toBe(TOKEN_DEOCO);
    expect([...mp.suscripciones.values()].every((s) => s.token !== TOKEN_BANDA)).toBe(true);
    // Sin la cuenta de Deoco en el entorno no se cobra la cuota (y no se cae a la de la banda).
    delete process.env.DEOCO_CUOTA_MP_TOKEN;
    try {
      await expect(elegirPlan(e.a.id, "banda-a", "premium")).rejects.toThrow(/DEOCO_CUOTA_MP_TOKEN/);
    } finally {
      process.env.DEOCO_CUOTA_MP_TOKEN = TOKEN_DEOCO;
    }
    // Solo el gestor de cuenta puede usar la cuenta de Deoco.
    await expect(
      crearSuscripcion(tienda, { referencia: e.a.id, motivo: "x", monto: 100, email: "a@x.com", vuelta: "http://x" }),
    ).rejects.toThrow(/no es el gestor de cuenta/);
    expect(comercial.secretos ?? []).toEqual([]);

    // 2. Un cobro de la cuota no entra por el aviso de pagos de la banda (otra URL, otra cuenta).
    const cobro = mp.cobrar(id, true);
    const porLaBanda = await atenderAviso(
      new Request(`http://app.deocoartist.com/avisos/${e.a.id}/tienda/pago/mercadopago`, { method: "POST", body: JSON.stringify({ type: "subscription_authorized_payment", data: { id: cobro } }) }),
      { tenantId: e.a.id, moduloId: "tienda", path: "/pago/mercadopago" },
    );
    expect(porLaBanda.status).toBe(200); // se ignora: no es un pago
    expect(await dueno.comercialCobro.count()).toBe(0);

    // 3. Tablas: el cobro de la cuota queda en comercial_cobro; nada en las de ventas.
    await avisoCuota("subscription_authorized_payment", cobro);
    expect(await dueno.comercialCobro.count({ where: { tenantId: e.a.id, estado: "aprobado" } })).toBe(1);
    expect(await dueno.tiendaPedido.count()).toBe(0);
    expect(await dueno.cobroDuplicado.count()).toBe(0);
    expect(await dueno.ticketeraCompra.count()).toBe(0);
    // Y el aviso de la cuota nunca consultó la API con el token de la banda.
    expect(mp.consultas.every((c) => c.token !== TOKEN_BANDA)).toBe(true);
  });

  it("una banda no ve la cuenta ni los cobros de otra (RLS)", async () => {
    await alCrearBanda(e.a.id);
    await alCrearBanda(e.b.id);
    const { conTenant } = await import("@/nucleo/db/con-tenant");
    const vistas = await conTenant(e.b.id, async (tx) => ({ cuentas: await tx.comercialCuenta.findMany(), cobros: await tx.comercialCobro.findMany() }));
    expect(vistas.cuentas.map((c) => c.tenantId)).toEqual([e.b.id]);
    expect(vistas.cobros).toEqual([]);
  });
});

describe("suspensión escalonada (documento maestro §14, 3.2 backline)", () => {
  // Plazos de la base (comercial_config), contados desde el vencimiento de la cuota.
  async function pagadaQueVence() {
    await alCrearBanda(e.a.id);
    const id = await suscribir(e.a.id, "banda-a", "medium");
    await avisoCuota("subscription_authorized_payment", mp.cobrar(id, true));
    const vence = (await cuentaDe(e.a.id))!.pagoHasta!;
    return { id, en: (dias: number) => new Date(vence.getTime() + dias * DIA + 60_000) };
  }
  const asuntos = async () => (await esperarCorreos(), bandejaDeSalida().map((m) => m.asunto));

  it("los seis escalones: 0 nada, 3 aviso (mail), 15 aviso fuerte, 30 solo lectura, 60 suspendida, 90 archivada", async () => {
    const { en } = await pagadaQueVence();
    vaciarBandeja();
    await revisarVencimientos(en(0));
    expect(await estado(e.a.id)).toBe("ACTIVO");
    await revisarVencimientos(en(2));
    expect(await estado(e.a.id)).toBe("ACTIVO");
    await revisarVencimientos(en(3));
    expect(await estado(e.a.id)).toBe("MOROSO");
    expect(await asuntos()).toEqual([expect.stringContaining("no pudimos cobrar")]);
    await revisarVencimientos(en(15));
    expect(await estado(e.a.id)).toBe("MOROSO_GRAVE");
    await revisarVencimientos(en(30));
    expect(await estado(e.a.id)).toBe("SOLO_LECTURA");
    expect((await asuntos()).some((a) => a.includes("solo lectura"))).toBe(true);
    await revisarVencimientos(en(60));
    expect(await estado(e.a.id)).toBe("SUSPENDIDO");
    expect((await asuntos()).some((a) => a.includes("sitio dejó de estar publicado"))).toBe(true);
    await revisarVencimientos(en(90));
    expect(await estado(e.a.id)).toBe("ARCHIVADO");
    expect((await asuntos()).some((a) => a.includes("archivamos"))).toBe(true);
    // Nada se borró.
    expect([...(await modulosPrendidos(e.a.id))].sort()).toEqual(["comercial", "sitio", "tienda"]);
    expect(await dueno.comercialCuenta.count({ where: { tenantId: e.a.id } })).toBe(1);
  });

  it("con el barrido parado, salta directo al escalón que corresponde", async () => {
    const { en } = await pagadaQueVence();
    await revisarVencimientos(en(61));
    expect(await estado(e.a.id)).toBe("SUSPENDIDO");
  });

  it("pagar en cualquier escalón antes del archivo devuelve todo al día", async () => {
    for (const [dias, esperado] of [[3, "MOROSO"], [15, "MOROSO_GRAVE"], [30, "SOLO_LECTURA"], [60, "SUSPENDIDO"]] as const) {
      await dueno.comercialCuenta.deleteMany();
      await dueno.tenant.updateMany({ data: { estado: "ACTIVO" } });
      const { id, en } = await pagadaQueVence();
      await revisarVencimientos(en(dias));
      expect(await estado(e.a.id)).toBe(esperado);
      await avisoCuota("subscription_authorized_payment", mp.cobrar(id, true));
      expect(await estado(e.a.id)).toBe("ACTIVO");
      expect((await cuentaDe(e.a.id))!.moraDesde).toBeNull();
    }
  });

  it("un cobro rechazado pasa a aviso (MOROSO, con mail) y sigue la misma escalera desde el rechazo", async () => {
    await alCrearBanda(e.a.id);
    const id = await suscribir(e.a.id, "banda-a", "medium");
    await avisoCuota("subscription_authorized_payment", mp.cobrar(id, false));
    expect(await estado(e.a.id)).toBe("MOROSO");
    await revisarVencimientos(new Date(Date.now() + 29 * DIA));
    expect(await estado(e.a.id)).toBe("MOROSO_GRAVE");
    await revisarVencimientos(new Date(Date.now() + 30 * DIA + 60_000));
    expect(await estado(e.a.id)).toBe("SOLO_LECTURA");
  });

  it("termina la prueba sin forma de pago: la misma escalera desde el fin de la prueba", async () => {
    await alCrearBanda(e.a.id);
    const fin = (await cuentaDe(e.a.id))!.pruebaHasta!;
    await revisarVencimientos(new Date(fin.getTime() + 2 * DIA));
    expect(await estado(e.a.id)).toBe("ACTIVO");
    await revisarVencimientos(new Date(fin.getTime() + 3 * DIA + 60_000));
    expect(await estado(e.a.id)).toBe("MOROSO");
    await revisarVencimientos(new Date(fin.getTime() + 60 * DIA + 60_000));
    expect(await estado(e.a.id)).toBe("SUSPENDIDO");
  });

  it("los plazos están en la base: el staff los cambia sin deploy, y tienen que ir en orden", async () => {
    const actuales = await plazos();
    expect(actuales).toMatchObject({ diasGracia: 3, diasAvisoFuerte: 15, diasSoloLectura: 30, diasMoraASuspender: 60, diasArchivo: 90 });
    await guardarPlazos(comoStaff, { ...actuales, diasSoloLectura: 20 });
    const { en } = await pagadaQueVence();
    await revisarVencimientos(en(20));
    expect(await estado(e.a.id)).toBe("SOLO_LECTURA");
    await expect(guardarPlazos(comoStaff, { ...actuales, diasSoloLectura: 70 })).rejects.toThrow(/en orden/);
    await guardarPlazos(comoStaff, actuales);
  });

  it("decidir: el escalón según los días desde el vencimiento", () => {
    const cfg = { diasGracia: 3, diasAvisoFuerte: 15, diasSoloLectura: 30, diasMoraASuspender: 60, diasArchivo: 90 };
    const t = new Date("2026-12-01T00:00:00Z");
    const base: { pruebaHasta: Date | null; pagoHasta: Date | null; moraDesde: Date | null } = { pruebaHasta: null, pagoHasta: t, moraDesde: null };
    const a = (dias: number, c = base) => decidir(c, cfg, new Date(t.getTime() + dias * DIA));
    expect(a(2)).toEqual({ estado: "ACTIVO", desde: null });
    expect(a(4)).toEqual({ estado: "MOROSO", desde: t });
    expect(a(16)).toEqual({ estado: "MOROSO_GRAVE", desde: t });
    expect(a(31)).toEqual({ estado: "SOLO_LECTURA", desde: t });
    expect(a(61)).toEqual({ estado: "SUSPENDIDO", desde: t });
    expect(a(91)).toEqual({ estado: "ARCHIVADO", desde: t });
    // Con la mora ya marcada (un rechazo), cuenta desde ahí.
    expect(a(16, { ...base, pagoHasta: new Date(t.getTime() + 40 * DIA), moraDesde: t })).toEqual({ estado: "MOROSO_GRAVE", desde: t });
    expect(sumarMes(new Date("2026-01-31T12:00:00Z")).toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });
});
