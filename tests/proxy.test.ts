import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EstadoTenant } from "@/generated/prisma/client";
import { prisma } from "@/nucleo/db/cliente";
import { CABECERA } from "@/nucleo/tenant/cabeceras";
import { proxy } from "@/proxy";
import { dosBandas, dueno } from "./apoyo";

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";

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

const APP = "app.deocoartist.com";

describe("camino 1: sitio público, por host", () => {
  it("el host de la banda A resuelve el tenant A (con puerto y mayúsculas)", async () => {
    const res = await proxy(pedido("Banda-A.deocoartist.com:3000"));
    expect(res.status).toBe(200);
    expect(cabeceraReenviada(res, CABECERA.tenantId)).toBe(a.id);
    expect(cabeceraReenviada(res, CABECERA.superficie)).toBe("publico");
  });

  it("host inexistente → 404", async () => {
    expect((await proxy(pedido("nadie.deocoartist.com"))).status).toBe(404);
    expect((await proxy(pedido("otra-cosa.com"))).status).toBe(404);
  });

  it("en el host de la banda, /b/<slug> es sitio público, no panel", async () => {
    const res = await proxy(pedido("banda-a.deocoartist.com", "/b/banda-b"));
    expect(cabeceraReenviada(res, CABECERA.tenantId)).toBe(a.id);
    expect(cabeceraReenviada(res, CABECERA.superficie)).toBe("publico");
  });
});

describe("camino 2: panel, por slug en app.<raiz>", () => {
  it("/b/banda-a resuelve A y /b/banda-b resuelve B", async () => {
    const ra = await proxy(pedido(APP, "/b/banda-a"));
    expect(cabeceraReenviada(ra, CABECERA.tenantId)).toBe(a.id);
    expect(cabeceraReenviada(ra, CABECERA.superficie)).toBe("panel");
    const rb = await proxy(pedido(APP, "/b/Banda-B/sitio/home"));
    expect(cabeceraReenviada(rb, CABECERA.tenantId)).toBe(b.id);
  });

  it("slug inexistente → 404", async () => {
    expect((await proxy(pedido(APP, "/b/nadie"))).status).toBe(404);
  });

  it("app.<raiz> sin slug es la plataforma: sin tenant", async () => {
    for (const ruta of ["/", "/ingresar", "/b", "/bandas/banda-a"]) {
      const res = await proxy(pedido(APP, ruta));
      expect(res.status).toBe(200);
      expect(cabeceraReenviada(res, CABECERA.tenantId)).toBeNull();
    }
  });

  it("no se puede inyectar el tenant desde afuera", async () => {
    const res = await proxy(pedido(APP, "/", { [CABECERA.tenantId]: b.id }));
    expect(cabeceraReenviada(res, CABECERA.tenantId)).toBeNull();
    const res2 = await proxy(pedido(APP, "/b/banda-a", { [CABECERA.tenantId]: b.id }));
    expect(cabeceraReenviada(res2, CABECERA.tenantId)).toBe(a.id);
  });
});

describe("prueba 5: reglas de estado en los dos caminos", () => {
  it("MOROSO funciona igual que ACTIVO y avisa su estado", async () => {
    await ponerEstado(a.id, "MOROSO");
    const res = await proxy(pedido(APP, "/b/banda-a"));
    expect(res.status).toBe(200);
    expect(cabeceraReenviada(res, CABECERA.estado)).toBe("MOROSO");
    expect((await proxy(pedido("banda-a.deocoartist.com"))).status).toBe(200);
  });

  it("SUSPENDIDO: panel 403, sitio público 200", async () => {
    await ponerEstado(a.id, "SUSPENDIDO");
    expect((await proxy(pedido(APP, "/b/banda-a"))).status).toBe(403);
    expect((await proxy(pedido(APP, "/b/banda-a/sitio"))).status).toBe(403);
    expect((await proxy(pedido(APP, "/b/banda-a/pagos-viejos"))).status).toBe(403);
    expect((await proxy(pedido("banda-a.deocoartist.com", "/"))).status).toBe(200);
    expect((await proxy(pedido("banda-a.deocoartist.com", "/pago"))).status).toBe(200);
  });

  it("SUSPENDIDO: /b/<slug>/pago pasa, marcada solo para el titular", async () => {
    await ponerEstado(a.id, "SUSPENDIDO");
    for (const ruta of ["/b/banda-a/pago", "/b/banda-a/pago/tarjeta"]) {
      const res = await proxy(pedido(APP, ruta));
      expect(res.status).toBe(200);
      expect(cabeceraReenviada(res, CABECERA.soloTitular)).toBe("1");
    }
  });

  it("ACTIVO: /b/<slug>/pago no queda marcada solo para el titular por el proxy", async () => {
    const res = await proxy(pedido(APP, "/b/banda-a/pago"));
    expect(cabeceraReenviada(res, CABECERA.soloTitular)).toBeNull();
  });

  it("ARCHIVADO: panel y sitio público 404, los datos se conservan", async () => {
    await ponerEstado(a.id, "ARCHIVADO");
    expect((await proxy(pedido(APP, "/b/banda-a"))).status).toBe(404);
    expect((await proxy(pedido(APP, "/b/banda-a/pago"))).status).toBe(404);
    expect((await proxy(pedido("banda-a.deocoartist.com", "/"))).status).toBe(404);
    expect(await dueno.dominio.count({ where: { tenantId: a.id } })).toBe(1);
  });

  it("el estado de una banda no afecta a la otra", async () => {
    await ponerEstado(a.id, "ARCHIVADO");
    expect((await proxy(pedido(APP, "/b/banda-b"))).status).toBe(200);
    expect((await proxy(pedido("banda-b.deocoartist.com"))).status).toBe(200);
  });
});

describe("resolver_tenant_por_slug", () => {
  it("devuelve solo el id, sin tenant fijado", async () => {
    const [r] = await prisma.$queryRaw<{ id: string | null }[]>`
      SELECT resolver_tenant_por_slug('banda-b') AS id`;
    expect(r.id).toBe(b.id);
  });
});
