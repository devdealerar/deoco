import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EstadoTenant } from "@/generated/prisma/client";
import { prisma } from "@/nucleo/db/cliente";
import { CABECERA } from "@/nucleo/tenant/cabeceras";
import { proxy } from "@/proxy";
import { dosBandas, dueno } from "./apoyo";

process.env.DEOCO_DOMINIO_RAIZ = "deoco.com";

let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  ({ a, b } = await dosBandas());
});
beforeEach(async () => {
  await dueno.tenant.updateMany({ data: { estado: "ACTIVO" } });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

function pedido(host: string, path = "/", extra: Record<string, string> = {}) {
  return new NextRequest(`http://${host}${path}`, { headers: { host, ...extra } });
}

/** Lo que la app recibiría como cabecera, si el proxy dejó pasar. */
function cabeceraReenviada(res: Response, nombre: string) {
  return res.headers.get(`x-middleware-request-${nombre}`);
}

async function ponerEstado(id: string, estado: EstadoTenant) {
  await dueno.tenant.update({ where: { id }, data: { estado } });
}

describe("prueba 1: resolución por host", () => {
  it("el host de la banda A resuelve el tenant A (con puerto y mayúsculas)", async () => {
    const res = await proxy(pedido("Banda-A.deoco.com:3000"));
    expect(res.status).toBe(200);
    expect(cabeceraReenviada(res, CABECERA.tenantId)).toBe(a.id);
    expect(cabeceraReenviada(res, CABECERA.estado)).toBe("ACTIVO");
  });

  it("el host de la banda B resuelve el tenant B", async () => {
    const res = await proxy(pedido("banda-b.deoco.com", "/panel"));
    expect(cabeceraReenviada(res, CABECERA.tenantId)).toBe(b.id);
  });

  it("host inexistente → 404", async () => {
    expect((await proxy(pedido("nadie.deoco.com"))).status).toBe(404);
    expect((await proxy(pedido("otra-cosa.com"))).status).toBe(404);
  });

  it("app.deoco.com es la plataforma: no resuelve tenant", async () => {
    const res = await proxy(pedido("app.deoco.com", "/panel"));
    expect(res.status).toBe(200);
    expect(cabeceraReenviada(res, CABECERA.tenantId)).toBeNull();
  });

  it("no se puede inyectar el tenant desde afuera", async () => {
    const res = await proxy(pedido("app.deoco.com", "/", { [CABECERA.tenantId]: b.id }));
    expect(cabeceraReenviada(res, CABECERA.tenantId)).toBeNull();
    const res2 = await proxy(pedido("banda-a.deoco.com", "/", { [CABECERA.tenantId]: b.id }));
    expect(cabeceraReenviada(res2, CABECERA.tenantId)).toBe(a.id);
  });
});

describe("prueba 5: reglas de estado", () => {
  it("MOROSO funciona igual que ACTIVO y avisa su estado", async () => {
    await ponerEstado(a.id, "MOROSO");
    const res = await proxy(pedido("banda-a.deoco.com", "/panel"));
    expect(res.status).toBe(200);
    expect(cabeceraReenviada(res, CABECERA.estado)).toBe("MOROSO");
  });

  it("SUSPENDIDO: panel 403, sitio público 200", async () => {
    await ponerEstado(a.id, "SUSPENDIDO");
    expect((await proxy(pedido("banda-a.deoco.com", "/panel"))).status).toBe(403);
    expect((await proxy(pedido("banda-a.deoco.com", "/panel/sitio"))).status).toBe(403);
    expect((await proxy(pedido("banda-a.deoco.com", "/"))).status).toBe(200);
    expect((await proxy(pedido("banda-a.deoco.com", "/prensa"))).status).toBe(200);
    // /panelito no es el panel
    expect((await proxy(pedido("banda-a.deoco.com", "/panelito"))).status).toBe(200);
  });

  it("SUSPENDIDO: las rutas de pago pasan, marcadas solo para el titular", async () => {
    await ponerEstado(a.id, "SUSPENDIDO");
    const res = await proxy(pedido("banda-a.deoco.com", "/panel/pago/tarjeta"));
    expect(res.status).toBe(200);
    expect(cabeceraReenviada(res, CABECERA.soloTitular)).toBe("1");
  });

  it("ARCHIVADO: panel y sitio público 404, los datos se conservan", async () => {
    await ponerEstado(a.id, "ARCHIVADO");
    expect((await proxy(pedido("banda-a.deoco.com", "/panel"))).status).toBe(404);
    expect((await proxy(pedido("banda-a.deoco.com", "/"))).status).toBe(404);
    expect(await dueno.dominio.count({ where: { tenantId: a.id } })).toBe(1);
  });

  it("el estado de una banda no afecta a la otra", async () => {
    await ponerEstado(a.id, "ARCHIVADO");
    expect((await proxy(pedido("banda-b.deoco.com", "/panel"))).status).toBe(200);
  });
});
