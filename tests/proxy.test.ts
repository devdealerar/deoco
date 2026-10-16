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

  it("la escalera, en el proxy: hasta MOROSO_GRAVE todo igual; SOLO_LECTURA y SUSPENDIDO, panel en solo lectura", async () => {
    for (const estado of ["ACTIVO", "MOROSO", "MOROSO_GRAVE"] as const) {
      await ponerEstado(a.id, estado);
      const res = await proxy(pedido(APP, "/b/banda-a/sitio"));
      expect([res.status, cabeceraReenviada(res, CABECERA.soloLectura)]).toEqual([200, null]);
      expect((await proxy(pedido("banda-a.deocoartist.com", "/tienda"))).status).toBe(200);
    }
    for (const estado of ["SOLO_LECTURA", "SUSPENDIDO"] as const) {
      await ponerEstado(a.id, estado);
      for (const ruta of ["/b/banda-a", "/b/banda-a/sitio", "/b/banda-a/credenciales", "/b/banda-a/archivos/x/y.png"]) {
        const res = await proxy(pedido(APP, ruta));
        expect([ruta, res.status, cabeceraReenviada(res, CABECERA.soloLectura)]).toEqual([ruta, 200, "1"]);
      }
      // Plan y pago, y Dominios, sí guardan.
      for (const ruta of ["/b/banda-a/pago", "/b/banda-a/dominios"]) {
        expect(cabeceraReenviada(await proxy(pedido(APP, ruta)), CABECERA.soloLectura)).toBeNull();
      }
    }
  });

  it("SOLO_LECTURA: el sitio y las ventas siguen; SUSPENDIDO: el sitio deja de estar publicado (salvo lo que abra una ruta)", async () => {
    await ponerEstado(a.id, "SOLO_LECTURA");
    const lectura = await proxy(pedido("banda-a.deocoartist.com", "/tienda"));
    expect([lectura.status, cabeceraReenviada(lectura, CABECERA.bandaCerrada)]).toEqual([200, null]);
    await ponerEstado(a.id, "SUSPENDIDO");
    for (const ruta of ["/", "/tienda", "/fechas/compra/123"]) {
      const res = await proxy(pedido("banda-a.deocoartist.com", ruta));
      expect([ruta, res.status, cabeceraReenviada(res, CABECERA.bandaCerrada)]).toEqual([ruta, 200, "1"]);
    }
    expect((await proxy(pedido("banda-a.deocoartist.com", "/archivos/x/y.png"))).status).toBe(404);
  });

  it("SUSPENDIDO: /b/<slug>/pago pasa, marcada solo para el titular", async () => {
    await ponerEstado(a.id, "SUSPENDIDO");
    for (const ruta of ["/b/banda-a/pago", "/b/banda-a/pago/tarjeta"]) {
      const res = await proxy(pedido(APP, ruta));
      expect(res.status).toBe(200);
      expect(cabeceraReenviada(res, CABECERA.soloTitular)).toBe("1");
    }
  });

  it("ARCHIVADO: una ruta de módulo del panel pasa marcada como banda cerrada (decide la ruta, en accesoPanel)", async () => {
    for (const estado of ["ARCHIVADO"] as const) {
      await ponerEstado(a.id, estado);
      for (const [ruta, resto] of [["/b/banda-a/sitio", "/sitio"], ["/b/banda-a/puerta/123", "/puerta/123"], ["/b/banda-a/pagos-viejos", "/pagos-viejos"]]) {
        const res = await proxy(pedido(APP, ruta));
        expect(res.status).toBe(200);
        expect(cabeceraReenviada(res, CABECERA.bandaCerrada)).toBe("1");
        expect(cabeceraReenviada(res, CABECERA.rutaPanel)).toBe(resto);
        expect(cabeceraReenviada(res, CABECERA.soloTitular)).toBeNull();
      }
    }
  });

  it("hasta SUSPENDIDO, en el panel ninguna ruta queda marcada como banda cerrada", async () => {
    for (const estado of ["ACTIVO", "MOROSO", "MOROSO_GRAVE", "SOLO_LECTURA", "SUSPENDIDO"] as const) {
      await ponerEstado(a.id, estado);
      const res = await proxy(pedido(APP, "/b/banda-a/puerta"));
      expect(cabeceraReenviada(res, CABECERA.bandaCerrada)).toBeNull();
    }
  });

  it("nadie de afuera puede mandar la marca de banda cerrada", async () => {
    const res = await proxy(pedido(APP, "/b/banda-a/sitio", { [CABECERA.bandaCerrada]: "1", [CABECERA.rutaPanel]: "/puerta" }));
    expect(cabeceraReenviada(res, CABECERA.bandaCerrada)).toBeNull();
    expect(cabeceraReenviada(res, CABECERA.rutaPanel)).toBeNull();
  });

  it("ACTIVO: /b/<slug>/pago no queda marcada solo para el titular por el proxy", async () => {
    const res = await proxy(pedido(APP, "/b/banda-a/pago"));
    expect(cabeceraReenviada(res, CABECERA.soloTitular)).toBeNull();
  });

  it("ARCHIVADO: panel 404 (salvo lo que abra una ruta), los datos se conservan", async () => {
    await ponerEstado(a.id, "ARCHIVADO");
    expect((await proxy(pedido(APP, "/b/banda-a"))).status).toBe(404);
    // Plan y pago (darse de baja o volver) y Pagos para devolver: abiertos, solo para el titular.
    expect(cabeceraReenviada(await proxy(pedido(APP, "/b/banda-a/pago")), CABECERA.soloTitular)).toBe("1");
    expect(cabeceraReenviada(await proxy(pedido(APP, "/b/banda-a/devoluciones")), CABECERA.soloTitular)).toBe("1");
    expect((await proxy(pedido(APP, "/b/banda-a/credenciales"))).status).toBe(404);
    // El sitio: lo decide la página (solo abren las entradas y el pedido del fan); lo del núcleo, 404.
    expect(cabeceraReenviada(await proxy(pedido("banda-a.deocoartist.com", "/")), CABECERA.bandaCerrada)).toBe("1");
    expect((await proxy(pedido("banda-a.deocoartist.com", "/archivos/x/y.png"))).status).toBe(404);
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
