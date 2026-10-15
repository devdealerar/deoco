import MailComposer from "nodemailer/lib/mail-composer";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { TOPE_DIARIO } from "../infra/cloudflare/reenvio/worker.js";

// El Email Worker de reenvío (infra/cloudflare/reenvio): lo que llega a merch@labanda.com sale
// por Resend al destino de la banda, con el nombre y el Reply-To del que escribió.

type Enviado = { from: string; to: string[]; reply_to: string; subject: string; text?: string; html?: string; attachments?: { filename: string; content: string }[]; headers: Record<string, string> };

function kv(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return { datos, get: async (k: string) => datos.get(k) ?? null, put: async (k: string, v: string) => void datos.set(k, v) };
}

async function mensaje(o: { from?: string; to?: string; replyTo?: string; asunto?: string; adjunto?: boolean; cabeceras?: Record<string, string> } = {}) {
  const raw = await new MailComposer({
    from: o.from ?? '"Juan Fan" <juan@gmail.com>',
    to: o.to ?? "merch@labanda.com",
    replyTo: o.replyTo,
    subject: o.asunto ?? "¿Hay remeras talle M?",
    text: "Hola! Quería saber si hay talle M.",
    html: "<p>Hola! Quería saber si hay talle M.</p>",
    headers: o.cabeceras,
    attachments: o.adjunto ? [{ filename: "foto.txt", content: "hola" }] : [],
  })
    .compile()
    .build();
  const rechazos: string[] = [];
  return {
    rechazos,
    m: {
      from: (o.from ?? "juan@gmail.com").replace(/.*<(.+)>/, "$1"),
      to: o.to ?? "merch@labanda.com",
      headers: new Headers(o.cabeceras ?? {}),
      raw: new Response(new Uint8Array(raw)).body,
      rawSize: raw.length,
      setReject: (r: string) => rechazos.push(r),
    },
  };
}

const enviados: Enviado[] = [];
function resend(estado = 200) {
  enviados.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    enviados.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: estado });
  });
}
afterEach(() => vi.restoreAllMocks());

describe("Email Worker de reenvío", () => {
  it("reenvía por Resend: nombre del fan (vía el dominio), Reply-To al fan, asunto, cuerpo y adjuntos", async () => {
    resend();
    const env = { DESTINOS: kv({ "merch@labanda.com": "banda@gmail.com" }), RESEND_API_KEY: "re_x" };
    const { m, rechazos } = await mensaje({ adjunto: true });
    await worker.email(m, env);
    expect(rechazos).toEqual([]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({
      from: '"Juan Fan (vía labanda.com)" <reenvio@labanda.com>',
      to: ["banda@gmail.com"],
      reply_to: "juan@gmail.com",
      subject: "¿Hay remeras talle M?",
      headers: { "X-Deoco-Original-From": "juan@gmail.com", "X-Deoco-Original-To": "merch@labanda.com" },
    });
    expect(enviados[0].text).toContain("talle M");
    expect(enviados[0].html).toContain("<p>Hola!");
    expect(enviados[0].attachments).toEqual([{ filename: "foto.txt", content: btoa("hola"), content_type: "text/plain" }]);
  });

  it("si el que escribió pidió otro Reply-To, se respeta", async () => {
    resend();
    const { m } = await mensaje({ replyTo: "prensa@medio.com" });
    await worker.email(m, { DESTINOS: kv({ "merch@labanda.com": "banda@gmail.com" }), RESEND_API_KEY: "re_x" });
    expect(enviados[0].reply_to).toBe("prensa@medio.com");
  });

  it("una dirección sin destino se rechaza; los automáticos y lo que manda el propio reenvío no se reenvían", async () => {
    resend();
    const env = { DESTINOS: kv({ "merch@labanda.com": "banda@gmail.com" }), RESEND_API_KEY: "re_x" };
    const otra = await mensaje({ to: "nadie@labanda.com" });
    await worker.email(otra.m, env);
    expect(otra.rechazos).toEqual(["Esta dirección no recibe correo."]);
    await worker.email((await mensaje({ from: "reenvio@labanda.com" })).m, env);
    await worker.email((await mensaje({ cabeceras: { "Auto-Submitted": "auto-replied" } })).m, env);
    expect(enviados).toHaveLength(0);
  });

  it("tope diario por dirección; si Resend falla, el Worker falla y no se cuenta", async () => {
    resend(500);
    const env = { DESTINOS: kv({ "merch@labanda.com": "banda@gmail.com" }), RESEND_API_KEY: "re_x" };
    await expect(worker.email((await mensaje()).m, env)).rejects.toThrow(/Resend respondió 500/);
    const clave = `cuenta:merch@labanda.com:${new Date().toISOString().slice(0, 10)}`;
    expect(env.DESTINOS.datos.get(clave)).toBe("0");

    resend();
    env.DESTINOS.datos.set(clave, String(TOPE_DIARIO));
    const { m, rechazos } = await mensaje();
    await worker.email(m, env);
    expect(rechazos).toEqual(["Esta dirección recibió demasiados mensajes hoy. Probá mañana."]);
    expect(enviados).toHaveLength(0);
  });
});
