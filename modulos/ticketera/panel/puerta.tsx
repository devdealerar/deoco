import Link from "next/link";
import { notFound } from "next/navigation";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { Tarjeta } from "@/ui";
import { FECHA_CORTA } from "@/nucleo/fechas";
import { desdeAhora, evento as leerEvento, eventos } from "../eventos";
import { resumenPuerta } from "../puerta";
import { Puerta } from "./puerta-cliente";

/** Panel · Puerta: elegir el show (los de hoy y los próximos). */
export async function PuertaPanel({ tenantId, slug }: PropsRutaPanel) {
  const lista = (await eventos(tenantId, { desde: desdeAhora() })).filter((e) => e.publicado);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-xs font-semibold text-primary">Puerta</h1>
      {lista.length === 0 ? (
        <Tarjeta titulo="No hay shows por venir">
          <p className="text-tertiary">Cuando haya un show publicado, aparece acá.</p>
        </Tarjeta>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((e) => (
            <li key={e.id}>
              <Link href={`/b/${slug}/puerta/${e.id}`} className="block rounded-xl bg-primary p-5 ring-1 ring-secondary ring-inset hover:bg-primary_hover" data-puerta-evento={e.nombre}>
                <div className="text-lg font-bold text-primary">{e.nombre}</div>
                <div className="text-sm text-tertiary">
                  {FECHA_CORTA.format(e.fecha)} · {e.lugar}, {e.ciudad}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Panel · Puerta de un show: escanear o tipear, y cuántos entraron. */
export async function PuertaEvento({ tenantId, slug, params }: PropsRutaPanel) {
  const e = await leerEvento(tenantId, params.id);
  if (!e) notFound();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <header>
        <Link href={`/b/${slug}/puerta`} className="text-sm font-semibold text-tertiary underline">
          Puerta
        </Link>
        <h1 className="text-xl font-bold text-primary">{e.nombre}</h1>
        <p className="text-sm text-tertiary">
          {FECHA_CORTA.format(e.fecha)} · {e.lugar}
        </p>
      </header>
      <Puerta slug={slug} eventoId={e.id} resumenInicial={await resumenPuerta(tenantId, e.id)} />
    </div>
  );
}
