import Link from "next/link";
import { conTenant } from "@/nucleo/db/con-tenant";
import { FECHA_LARGA } from "@/nucleo/fechas";
import { c } from "@/nucleo/publico/estilo";
import { qrSvg } from "../correos";
import { desdeAhora } from "../eventos";
import { formatearCodigo } from "../firma";
import { entradasDelFan } from "../transferencias";
import { cancelarTransferenciaAccion, reenviarAccion, transferirAccion } from "./acciones";
import { AccionFan } from "./fan-formularios";

// Área del fan (D5): sus entradas con el QR (las que compró y no transfirió, y las que le
// transfirieron), transferir con confirmación por mail, y reenviar el mail de una compra.

export async function tieneTicketera(tenantId: string, email: string): Promise<boolean> {
  const e = email.toLowerCase();
  const n = await conTenant(tenantId, (tx) =>
    tx.ticketeraEntrada.count({ where: { OR: [{ emailTitular: e }, { emailTitular: null, compra: { email: { equals: e, mode: "insensitive" } } }] } }),
  );
  return n > 0;
}

const campo = "flex flex-col gap-1 text-sm font-bold";

export async function EntradasDelFan({ tenantId, email }: { tenantId: string; email: string }) {
  const todas = await entradasDelFan(tenantId, email);
  const proximas = todas.filter((e) => e.evento.fecha >= desdeAhora());
  const conQr = await Promise.all(proximas.map(async (e) => ({ ...e, svg: await qrSvg(e.codigo) })));
  // Compras de este email con entradas por delante: para reenviar su mail.
  const compras = [...new Map(proximas.filter((e) => !e.emailTitular).map((e) => [e.compra.id, e.evento.nombre])).entries()];
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black">Entradas</h2>
      {conQr.length === 0 ? (
        <p className={c.suave}>No tenés entradas para shows por venir.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2" data-entradas-fan>
          {conQr.map((e) => {
            const abierta = e.transferencias[0];
            return (
              <li key={e.id} className={`flex flex-col gap-3 rounded-xl border p-5 ${c.linea}`} data-entrada-fan={e.codigo}>
                <div>
                  <div className="text-sm font-bold uppercase text-[var(--acento,#111)]">{FECHA_LARGA.format(e.evento.fecha)}</div>
                  <div className="text-lg font-black">{e.evento.nombre}</div>
                  <div className={`text-sm ${c.suave}`}>
                    {e.evento.lugar}, {e.evento.ciudad} · {e.tipo.nombre}
                  </div>
                </div>
                <div className="mx-auto w-48 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: e.svg }} />
                <div className="text-center">
                  <div className="font-bold">{e.nombre}</div>
                  <div className={`text-sm ${c.suave}`}>Documento {e.documento}</div>
                  <div className="font-mono tracking-widest">{formatearCodigo(e.codigo)}</div>
                  {e.validadaEn && <div className="text-sm font-bold">Ya usada</div>}
                </div>
                {!e.validadaEn &&
                  (abierta ? (
                    <div className="flex flex-col gap-2 text-sm" data-transferencia-abierta={abierta.estado}>
                      <p>
                        {abierta.estado === "por-confirmar" ? "Confirmá la transferencia desde tu mail" : `Esperando que ${abierta.aNombre} la acepte`} (vence el{" "}
                        {FECHA_LARGA.format(abierta.vence)}). Hasta entonces, es tuya y tu QR vale.
                      </p>
                      <AccionFan accion={cancelarTransferenciaAccion.bind(null, abierta.id)} etiqueta="Cancelar la transferencia" suave prueba="cancelar" />
                    </div>
                  ) : (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-bold underline">Transferir esta entrada</summary>
                      <div className="mt-3">
                        <AccionFan accion={transferirAccion.bind(null, e.id)} etiqueta="Transferir" prueba="transferir">
                          <label className={campo}>
                            Nombre y apellido de quien la recibe
                            <input name="nombre" required className={c.campo} />
                          </label>
                          <label className={campo}>
                            Su documento
                            <input name="documento" required inputMode="numeric" className={c.campo} />
                          </label>
                          <label className={campo}>
                            Su email
                            <input name="email" type="email" required className={c.campo} />
                          </label>
                          <p className={c.suave}>Te llega un mail para confirmar; después la otra persona la acepta desde el suyo. Ahí tu QR deja de valer y le llega uno nuevo.</p>
                        </AccionFan>
                      </div>
                    </details>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {compras.map(([id, show]) => (
        <div key={id} className="flex flex-wrap items-center gap-3 text-sm" data-reenviar={id}>
          <span className={c.suave}>¿No te llegó el mail de {show}?</span>
          <AccionFan accion={reenviarAccion.bind(null, id)} etiqueta="Reenviármelo" suave prueba="reenviar" />
          <Link href={`/fechas/compra/${id}`} className="underline">
            Ver la compra
          </Link>
        </div>
      ))}
    </div>
  );
}
