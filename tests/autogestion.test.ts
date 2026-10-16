import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verificarContrasena } from "@/nucleo/auth/contrasena";
import { confirmarRegistro, crearBandaPropia, ErrorAutogestion, olvidarIntentos, solicitarRegistro, yaCreoBanda } from "@/nucleo/autogestion";
import { bandejaDeSalida, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { ipDelVisitante } from "@/nucleo/publico/visitante";
import { resolverTenantPorHost } from "@/nucleo/tenant/resolver";
import { cuentaDe } from "../modulos/comercial/cuenta";
import { dueno, limpiar } from "./apoyo";
import { MercadoPagoFalso } from "./mercadopago-falso";

// Autogestión del alta: registro con email verificado, banda con subdominio, prueba o plan.

const mp = new MercadoPagoFalso();
const CLAVE = "una-clave-larga";
const datos = (email = "nueva@banda.com") => ({ nombre: "Ana Nueva", email, contrasena: CLAVE, repetida: CLAVE });

/** El token del último mail de verificación que salió para `email`. */
function tokenDelMail(email: string) {
  const m = [...bandejaDeSalida()].reverse().find((x) => x.para === email);
  return /registro\/verificar#([0-9a-f]{64})/.exec(m?.texto ?? "")?.[1] ?? null;
}

async function cuentaVerificada(email = "nueva@banda.com") {
  await solicitarRegistro(datos(email), "10.0.0.1");
  return (await confirmarRegistro(tokenDelMail(email)!))!;
}

beforeAll(async () => {
  await mp.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  process.env.DEOCO_CUOTA_MP_TOKEN = "APP_USR-DEOCO-autogestion";
});
beforeEach(async () => {
  await limpiar();
  vaciarBandeja();
  olvidarIntentos();
  mp.limpiar();
});
afterAll(async () => {
  await mp.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("registro con email verificado", () => {
  it("sin abrir el link no hay cuenta; el link la crea una sola vez, con la contraseña elegida", async () => {
    await solicitarRegistro(datos(), "10.0.0.1");
    expect(await dueno.usuario.count()).toBe(0);
    const pendiente = await dueno.registroPendiente.findUniqueOrThrow({ where: { email: "nueva@banda.com" } });
    const token = tokenDelMail("nueva@banda.com")!;
    // El token no se guarda: solo su hash.
    expect(pendiente.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(pendiente)).not.toContain(token);

    expect(await confirmarRegistro("0".repeat(64))).toBeNull();
    const id = await confirmarRegistro(token);
    const u = await dueno.usuario.findUniqueOrThrow({ where: { id: id! } });
    expect(u).toMatchObject({ email: "nueva@banda.com", nombre: "Ana Nueva", claveTemporal: false, esStaff: false });
    expect(await verificarContrasena(u.hashContrasena, CLAVE)).toBe(true);
    expect(await confirmarRegistro(token)).toBeNull(); // una sola vez
    expect(await dueno.registroPendiente.count()).toBe(0);
  });

  it("un link vencido no sirve; deoco_app no puede leer los registros pendientes", async () => {
    await solicitarRegistro(datos(), "10.0.0.1");
    await dueno.registroPendiente.updateMany({ data: { venceEn: new Date(Date.now() - 1000) } });
    expect(await confirmarRegistro(tokenDelMail("nueva@banda.com")!)).toBeNull();
    expect(await dueno.usuario.count()).toBe(0);
    await expect(prisma.registroPendiente.findMany()).rejects.toThrow(/permission denied/);
  });

  it("un email que ya tiene cuenta: la pantalla dice lo mismo, el mail lo explica", async () => {
    await cuentaVerificada();
    vaciarBandeja();
    await solicitarRegistro(datos(), "10.0.0.2");
    expect(bandejaDeSalida()).toHaveLength(1);
    expect(bandejaDeSalida()[0].asunto).toBe("Ya tenés una cuenta en Deoco");
    expect(await dueno.usuario.count()).toBe(1);
  });

  it("datos inválidos, demasiados mails por email o intentos por IP, y la trampa para bots", async () => {
    await expect(solicitarRegistro({ ...datos(), repetida: "otra-cosa-larga" }, null)).rejects.toThrow("no coinciden");
    await expect(solicitarRegistro({ ...datos(), contrasena: "corta", repetida: "corta" }, null)).rejects.toThrow("al menos 10");
    await expect(solicitarRegistro({ ...datos(), email: "no-es-mail" }, null)).rejects.toThrow("no parece válido");
    // Trampa: no hace nada, sin decirlo.
    await solicitarRegistro({ ...datos("bot@x.com"), trampa: "http://spam" }, "10.9.9.9");
    expect(await dueno.registroPendiente.count()).toBe(0);
    // 3 mails por hora para el mismo email.
    for (let i = 0; i < 3; i++) await solicitarRegistro(datos("insiste@x.com"), `10.1.0.${i}`);
    await expect(solicitarRegistro(datos("insiste@x.com"), "10.1.0.9")).rejects.toThrow("varios mails");
    // 5 registros por hora desde una IP.
    for (let i = 0; i < 5; i++) await solicitarRegistro(datos(`ip${i}@x.com`), "10.2.0.1");
    await expect(solicitarRegistro(datos("ip9@x.com"), "10.2.0.1")).rejects.toBeInstanceOf(ErrorAutogestion);
  });
});

describe("crear la banda", () => {
  it("queda en su panel con el sitio listo: subdominio en línea, titular, prueba de Escenario; el staff la ve", async () => {
    const usuarioId = await cuentaVerificada();
    const r = await crearBandaPropia(usuarioId, { nombre: "Los Nuevos", subdominio: "los-nuevos", opcion: "prueba" }, "10.0.0.1");
    expect(r.redireccion).toBe("/b/los-nuevos");
    const t = await dueno.tenant.findUniqueOrThrow({ where: { slug: "los-nuevos" }, include: { membresias: true, dominios: true } });
    expect(t).toMatchObject({ nombre: "Los Nuevos", estado: "ACTIVO", origen: "autogestion", creadoPor: usuarioId });
    expect(t.membresias).toMatchObject([{ usuarioId, rol: "TITULAR" }]);
    expect(t.dominios).toMatchObject([{ dominio: "los-nuevos.lvh.me", esPrincipal: true, verificado: true }]);
    // El sitio público resuelve en su subdominio y el módulo sitio está prendido.
    expect((await resolverTenantPorHost("los-nuevos.lvh.me"))?.id).toBe(t.id);
    expect([...(await modulosPrendidos(t.id))].sort()).toEqual(["comercial", "sitio", "ticketera", "tienda"]);
    expect(await cuentaDe(t.id)).toMatchObject({ planId: "escenario" });
    // El staff la ve (auditoría con quién la creó).
    expect(await dueno.auditoria.findFirst({ where: { accion: "banda.autogestionada", tenantId: t.id } })).toMatchObject({ usuarioId });
    expect(await yaCreoBanda(usuarioId)).toBe(true);
  });

  it("eligiendo un plan: arranca la prueba y va a la pasarela de Deoco a cargar la forma de pago", async () => {
    await dueno.comercialPlan.update({ where: { id: "demo" }, data: { precio: 4500000 } });
    const usuarioId = await cuentaVerificada();
    const r = await crearBandaPropia(usuarioId, { nombre: "Con Plan", subdominio: "con-plan", opcion: "demo" }, "10.0.0.1");
    expect(r.redireccion).toMatch(new RegExp(`^${mp.base}/suscribir\\?id=`));
    expect(await cuentaDe(r.tenantId)).toMatchObject({ planId: "escenario", planElegido: "demo", suscripcionEstado: "pendiente" });
  });

  it("subdominio reservado, inválido o tomado; una banda por cuenta", async () => {
    const usuarioId = await cuentaVerificada();
    for (const sub of ["app", "admin", "soporte", "pagos", "www"]) {
      await expect(crearBandaPropia(usuarioId, { nombre: "X", subdominio: sub }, null)).rejects.toThrow("reservado");
    }
    await expect(crearBandaPropia(usuarioId, { nombre: "X", subdominio: "Con Espacios" }, null)).rejects.toThrow("no sirve");
    const otra = await dueno.tenant.create({ data: { nombre: "Tomada", slug: "tomada" } });
    await dueno.dominio.create({ data: { tenantId: otra.id, dominio: "tomada.lvh.me", esPrincipal: true, verificado: true } });
    await expect(crearBandaPropia(usuarioId, { nombre: "X", subdominio: "tomada" }, null)).rejects.toThrow("ya está tomado");

    await crearBandaPropia(usuarioId, { nombre: "Primera", subdominio: "primera" }, null);
    await expect(crearBandaPropia(usuarioId, { nombre: "Segunda", subdominio: "segunda" }, null)).rejects.toThrow("ya creó una banda");
    expect(await dueno.tenant.findUnique({ where: { slug: "segunda" } })).toBeNull();
  });

  it("dos pedidos a la vez de la misma cuenta: una sola banda", async () => {
    const usuarioId = await cuentaVerificada();
    const r = await Promise.allSettled([
      crearBandaPropia(usuarioId, { nombre: "A", subdominio: "a-uno" }, null),
      crearBandaPropia(usuarioId, { nombre: "B", subdominio: "b-dos" }, null),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await dueno.tenant.count({ where: { creadoPor: usuarioId } })).toBe(1);
  });
});

describe("IP del visitante (freno por IP)", () => {
  it("detrás de Cloudflare vale CF-Connecting-IP, no la de Cloudflare que Traefik pone en x-forwarded-for", () => {
    const h = (c: Record<string, string>) => new Headers(c);
    expect(ipDelVisitante(h({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "172.70.1.1" }))).toBe("203.0.113.7");
    // Sin Cloudflare (desarrollo o vuelta atrás a nube gris): el primer x-forwarded-for.
    expect(ipDelVisitante(h({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(ipDelVisitante(h({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
    expect(ipDelVisitante(h({}))).toBeNull();
  });
});
