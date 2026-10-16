// Carga con dominios: muchas bandas comprando a la vez. Mide cuántos pedidos al registrador
// necesita cada compra (GoDaddy deja 60 por minuto por cuenta) y verifica que nada se pierda ni se
// registre dos veces, y que el barrido no se quede esperando a GoDaddy (las compras corren aparte).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { barrer } from "@/nucleo/barrido";
import { esperarCorreos } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { dominioPagado, esperarCompras, revisarCompras } from "@/nucleo/dominios/compra";
import { dueno, limpiar } from "../apoyo";
import { CloudflareFalso } from "../cloudflare-falso";
import { RegistradorFalso } from "../registrador-falso";
import comercial from "../../modulos/comercial";

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";
const cf = new CloudflareFalso();
const gd = new RegistradorFalso();
const BANDAS = 200;
const MIN = 60_000;
let bandas: { id: string; slug: string }[] = [];

const contacto = { nombre: "Ana", apellido: "Pérez", email: "ana@x.com", telefono: "+54.1145678900", direccion: "Calle 1", ciudad: "CABA", provincia: "Buenos Aires", codigoPostal: "C1043", pais: "AR" };

beforeAll(async () => {
  await limpiar();
  await Promise.all([cf.iniciar(), gd.iniciar()]);
  cf.usar();
  gd.usar();
  await dueno.tenant.createMany({ data: Array.from({ length: BANDAS }, (_, i) => ({ nombre: `Banda ${i}`, slug: `banda-${i}` })) });
  bandas = await dueno.tenant.findMany({ select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  await dueno.dominio.createMany({ data: bandas.map((b) => ({ tenantId: b.id, dominio: `${b.slug}.deocoartist.com`, esPrincipal: true, verificado: true })) });
  await dueno.usuario.createMany({ data: bandas.map((b) => ({ email: `${b.slug}@x.com`, nombre: b.slug, hashContrasena: "x" })) });
  const usuarios = new Map((await dueno.usuario.findMany({ select: { id: true, nombre: true } })).map((u) => [u.nombre, u.id]));
  await dueno.membresia.createMany({ data: bandas.map((b) => ({ tenantId: b.id, usuarioId: usuarios.get(b.slug)!, rol: "TITULAR" })) });
}, 120_000);
afterAll(async () => {
  gd.demoraMs = 0;
  await esperarCompras();
  await esperarCorreos();
  await Promise.all([cf.cerrar(), gd.cerrar()]);
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("muchas compras a la vez", () => {
  it(`${BANDAS} bandas pagan su dominio al mismo tiempo: todas llegan a la zona, ninguna se registra dos veces`, async () => {
    const t0 = Date.now();
    // Llegan los avisos de pago todos juntos (y cada uno, repetido). Si la base está saturada el
    // aviso responde error y Mercado Pago lo reintenta (acá, con espera creciente).
    let reintentos = 0;
    const comoMercadoPago = async (fn: () => Promise<unknown>) => {
      for (let i = 0; ; i++) {
        try {
          return await fn();
        } catch (e) {
          if (i >= 8) throw e;
          reintentos++;
          await new Promise((r) => setTimeout(r, 200 * 2 ** i));
        }
      }
    };
    await Promise.all(
      bandas.flatMap((b) =>
        [0, 1].map(() =>
          comoMercadoPago(() => dominioPagado(comercial, b.id, {
            dominio: `${b.slug}-carga.com`,
            anios: 1,
            contacto,
            aceptacion: { fecha: new Date(), ip: "203.0.113.7", claves: ["DNRA"] },
            hacerPrincipal: false,
            cobro: { id: `cobro-${b.slug}`, monto: 2_500_000 },
            usuarioId: null,
          })),
        ),
      ),
    );
    await esperarCompras();
    const altas = Date.now() - t0;
    // El barrido las lleva hasta la zona (GoDaddy contesta las acciones al toque).
    let vueltas = 0;
    for (let ahora = Date.now(); vueltas < 12; vueltas++) {
      gd.terminar();
      ahora += 2 * MIN;
      await revisarCompras(new Date(ahora));
      if ((await dueno.dominioCompra.count({ where: { paso: "activacion" } })) === BANDAS) break;
    }
    const total = Date.now() - t0;
    // Cada compra, un solo "Recibimos tu pago" (encolado con la compra: ni perdido ni repetido).
    expect(await dueno.correo.count({ where: { asunto: { startsWith: "Recibimos tu pago" } } })).toBe(BANDAS);
    expect(await dueno.dominioCompra.count()).toBe(BANDAS);
    expect(await dueno.dominioCompra.count({ where: { paso: "activacion", estado: "en-curso" } })).toBe(BANDAS);
    expect(await dueno.registradorCliente.count()).toBe(BANDAS);
    const registros = gd.pedidos.filter((p) => p.ruta.endsWith("/register"));
    expect(registros).toHaveLength(BANDAS); // nunca dos veces
    const porCompra = gd.pedidos.length / BANDAS;
    // Con el tope real (59 por minuto), lo que tardaría solo por la cola de GoDaddy.
    const minutosConTope = gd.pedidos.length / 59;
    console.log(
      `[carga dominios] ${BANDAS} compras · avisos ${altas} ms (${reintentos} reintentos por saturación) · hasta la zona ${total} ms en ${vueltas + 1} vueltas · ` +
        `${gd.pedidos.length} pedidos a GoDaddy (${porCompra.toFixed(1)} por compra) → con 59/min: ~${minutosConTope.toFixed(0)} min`,
    );
    expect(porCompra).toBeLessThan(12);
  }, 300_000);

  it("el barrido no se queda esperando a GoDaddy: las compras van aparte", async () => {
    await dueno.dominioCompra.updateMany({ data: { paso: "registrar", operacion: undefined, proximoIntento: new Date(0) } });
    // GoDaddy lento (como cuando la cola de 59 por minuto está llena): 2 s por pedido.
    gd.demoraMs = 2000;
    const t0 = Date.now();
    await barrer({ ahora: new Date(Date.now() + 30 * MIN) });
    const vuelta = Date.now() - t0;
    console.log(`[carga dominios] una vuelta del barrido con ${BANDAS} compras pendientes y GoDaddy lento: ${vuelta} ms`);
    expect(vuelta).toBeLessThan(5_000);
    gd.demoraMs = 0;
  }, 120_000);
});
