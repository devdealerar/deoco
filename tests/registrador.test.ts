import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Cola } from "@/nucleo/dominios/cola";
import { type Contacto, ErrorRegistrador, problemasDeRegistrador, registrador, type Registrador } from "@/nucleo/dominios/registrador";
import { RegistradorFalso } from "./registrador-falso";

// El Registrador con GoDaddy (D7), contra un GoDaddy falso: subcuenta por banda, dominio a nombre
// del titular, escrituras 202 + acciones, errores traducidos, nunca dos registros.

const gd = new RegistradorFalso();
let r: Registrador;

const titular: Contacto = {
  nombre: "Ana",
  apellido: "Pérez",
  email: "ana@lossatelites.com",
  telefono: "+54.1145678900",
  direccion: "Av. Corrientes 1234",
  ciudad: "CABA",
  provincia: "Buenos Aires",
  codigoPostal: "C1043",
  pais: "AR",
};
const aceptacion = { fecha: new Date("2026-10-15T12:00:00Z"), ip: "203.0.113.7", claves: ["DNRA"] };

beforeAll(async () => {
  await gd.iniciar();
});
beforeEach(() => {
  gd.limpiar();
  gd.usar();
  r = registrador()!;
});
afterAll(() => gd.cerrar());

async function clienteConDominio(dominio = "lossatelites.com") {
  const { clienteId } = await r.crearCliente({ email: titular.email, nombre: "Ana", apellido: "Pérez", referencia: "banda-1" });
  await r.registrar(clienteId, { dominio, contacto: titular, anios: 1, nameservers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"], aceptacion });
  gd.terminar("REGISTER");
  return clienteId;
}

describe("configuración", () => {
  it("sin DEOCO_REGISTRADOR no se venden dominios; con godaddy hacen falta la clave y el secreto", () => {
    expect(registrador({})).toBeNull();
    expect(problemasDeRegistrador({})).toEqual([]);
    expect(problemasDeRegistrador({ DEOCO_REGISTRADOR: "otro" })).toEqual(['DEOCO_REGISTRADOR="otro" no existe (godaddy).']);
    expect(problemasDeRegistrador({ DEOCO_REGISTRADOR: "godaddy", DEOCO_GODADDY_KEY: "k" })[0]).toMatch(/necesita DEOCO_GODADDY_KEY y DEOCO_GODADDY_SECRET/);
    expect(registrador({ DEOCO_REGISTRADOR: "godaddy", DEOCO_GODADDY_KEY: "k" })).toBeNull();
  });
});

describe("buscar", () => {
  it("disponible con su precio de costo (en centavos); tomado, sin precio", async () => {
    expect(await r.disponibilidad("lossatelites.com")).toEqual({ dominio: "lossatelites.com", disponible: true, costo: { centavos: 1199, moneda: "USD", anios: 1 } });
    gd.tomados.add("tomado.com");
    expect(await r.disponibilidad("tomado.com")).toEqual({ dominio: "tomado.com", disponible: false, costo: null });
    expect(await r.condiciones("com")).toEqual([{ clave: "DNRA", titulo: "Domain Name Registration Agreement", url: "https://www.godaddy.com/agreements/dnra" }]);
  });
});

describe("registrar", () => {
  it("en la subcuenta de la banda, a nombre del titular, con los nameservers de Deoco y sin renovación automática; 202 → en curso → lista", async () => {
    const { clienteId } = await r.crearCliente({ email: titular.email, nombre: "Ana", apellido: "Pérez", referencia: "banda-1" });
    const o = await r.registrar(clienteId, {
      dominio: "lossatelites.com",
      contacto: titular,
      anios: 1,
      nameservers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"],
      aceptacion,
    });
    expect(o).toEqual({ id: "lossatelites.com|REGISTER", estado: "en-curso" });
    const pedido = gd.pedidos.find((p) => p.ruta.endsWith("/domains/register"))!;
    expect(pedido.ruta).toBe(`/v2/customers/${clienteId.split("|")[0]}/domains/register`);
    expect(pedido.cuerpo).toMatchObject({
      domain: "lossatelites.com",
      period: 1,
      renewAuto: false,
      privacy: false,
      nameServers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"],
      consent: { agreedAt: "2026-10-15T12:00:00.000Z", agreedBy: "203.0.113.7", agreementKeys: ["DNRA"] },
      contacts: { registrant: { nameFirst: "Ana", nameLast: "Pérez", email: "ana@lossatelites.com", addressMailing: { country: "AR" } } },
    });
    expect(await r.operacion(clienteId, o)).toMatchObject({ estado: "en-curso" });
    gd.terminar("REGISTER");
    expect(await r.operacion(clienteId, o)).toEqual({ id: o.id, estado: "lista" });
    expect(await r.dominio(clienteId, "lossatelites.com")).toMatchObject({ dominio: "lossatelites.com", bloqueado: true, nameservers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"] });
  });

  it("nunca dos veces: si ya está en la subcuenta (una respuesta perdida), está registrado", async () => {
    const clienteId = await clienteConDominio();
    const antes = gd.pedidos.filter((p) => p.ruta.endsWith("/register")).length;
    expect(await r.registrar(clienteId, { dominio: "lossatelites.com", contacto: titular, anios: 1, nameservers: [], aceptacion })).toEqual({
      id: "lossatelites.com|REGISTER",
      estado: "lista",
    });
    expect(gd.pedidos.filter((p) => p.ruta.endsWith("/register")).length).toBe(antes);
  });

  it("una operación que falla dice por qué", async () => {
    const { clienteId } = await r.crearCliente({ email: titular.email, nombre: "Ana", apellido: "Pérez", referencia: "banda-1" });
    const o = await r.registrar(clienteId, { dominio: "lossatelites.com", contacto: titular, anios: 1, nameservers: [], aceptacion });
    gd.terminar("REGISTER", "Registry rejected the request");
    expect(await r.operacion(clienteId, o)).toEqual({ id: o.id, estado: "fallida", motivo: "Registry rejected the request" });
  });

  it.each([
    ["tomado en el medio", () => gd.tomados.add("lossatelites.com"), "no-disponible", undefined],
    ["sin saldo en la cuenta de revendedor", () => void (gd.sinSaldo = true), "sin-saldo", undefined],
    ["teléfono inválido (dice qué dato)", () => void (titular.telefono = "1145678900"), "datos-invalidos", "telefono"],
    ["GoDaddy caído", () => gd.fallas.push(503, 503), "temporal", undefined],
  ])("errores traducidos: %s", async (_, preparar, tipo, campo) => {
    const tel = titular.telefono;
    const { clienteId } = await r.crearCliente({ email: titular.email, nombre: "Ana", apellido: "Pérez", referencia: "banda-1" });
    preparar();
    try {
      const e = await r.registrar(clienteId, { dominio: "lossatelites.com", contacto: titular, anios: 1, nameservers: [], aceptacion }).catch((x) => x);
      expect(e).toBeInstanceOf(ErrorRegistrador);
      expect(e).toMatchObject({ tipo, campo });
    } finally {
      titular.telefono = tel;
    }
  });
});

describe("después del registro", () => {
  it("nameservers y renovación (con el vencimiento actual: no renueva dos veces)", async () => {
    const clienteId = await clienteConDominio();
    const o = await r.ponerNameservers(clienteId, "lossatelites.com", ["uno.ejemplo.com", "dos.ejemplo.com"]);
    gd.terminar();
    expect(await r.operacion(clienteId, o)).toMatchObject({ estado: "lista" });
    expect((await r.dominio(clienteId, "lossatelites.com"))?.nameservers).toEqual(["uno.ejemplo.com", "dos.ejemplo.com"]);

    const vence = (await r.dominio(clienteId, "lossatelites.com"))!.venceEn;
    const ren = await r.renovar(clienteId, "lossatelites.com", vence, 1);
    gd.terminar("RENEW");
    expect(await r.operacion(clienteId, ren)).toMatchObject({ estado: "lista" });
    const nuevo = (await r.dominio(clienteId, "lossatelites.com"))!.venceEn;
    expect(nuevo.getUTCFullYear()).toBe(vence.getUTCFullYear() + 1);
    // Con el vencimiento viejo, el registrador no lo vuelve a renovar.
    await expect(r.renovar(clienteId, "lossatelites.com", vence, 1)).rejects.toBeInstanceOf(ErrorRegistrador);
  });

  it("llevárselo: desbloquea y da el código; transferido afuera, ya no está en la subcuenta", async () => {
    const clienteId = await clienteConDominio();
    expect(await r.desbloquearYCodigo(clienteId, "lossatelites.com")).toEqual({ codigo: "AUTH-lossatelites.com" });
    expect((await r.dominio(clienteId, "lossatelites.com"))?.bloqueado).toBe(false);
    // Con la subcuenta de la banda (no la cuenta de Deoco).
    expect(gd.pedidos.filter((p) => p.ruta === "/v1/domains/lossatelites.com").every((p) => p.shopper === clienteId.split("|")[1])).toBe(true);
    gd.transferidoAfuera("lossatelites.com");
    expect(await r.dominio(clienteId, "lossatelites.com")).toBeNull();
  });

  it("cambio de titular y transferencia entrante", async () => {
    const clienteId = await clienteConDominio();
    const o = await r.cambiarTitular(clienteId, "lossatelites.com", { ...titular, nombre: "Bruno", email: "bruno@lossatelites.com" });
    gd.terminar();
    expect(await r.operacion(clienteId, o)).toMatchObject({ estado: "lista" });

    gd.tomados.add("traido.com");
    const t = await r.transferirAca(clienteId, { dominio: "traido.com", codigo: "XYZ", contacto: titular, aceptacion });
    expect(gd.pedidos.at(-1)?.cuerpo).toMatchObject({ authCode: "XYZ", renewAuto: false });
    gd.terminar("TRANSFER");
    expect(await r.operacion(clienteId, t)).toMatchObject({ estado: "lista" });
    expect(await r.dominio(clienteId, "traido.com")).not.toBeNull();
  });
});

describe("cola de pedidos (60 por minuto)", () => {
  it("si se llena, el siguiente espera su turno (en orden), sin pedir de más", async () => {
    let ahora = 0;
    const dormidas: number[] = [];
    const cola = new Cola(3, 60_000, { ahora: () => ahora, dormir: async (ms) => (dormidas.push(ms), void (ahora += ms)) });
    const orden: number[] = [];
    await Promise.all([1, 2, 3, 4, 5].map((n) => cola.correr(async () => void orden.push(n))));
    expect(orden).toEqual([1, 2, 3, 4, 5]);
    expect(dormidas).toEqual([60_000]); // el 4.º esperó la ventana; el 5.º entró con él
    expect(ahora).toBe(60_000);
  });
});
