import { formatearBytes, usoAlmacenamiento } from "@/nucleo/archivos";
import { catalogoDeCuenta, excedentesDe, usoDeLimites } from "@/nucleo/cuenta";
import { formatearPesos } from "@/nucleo/dinero";
import { ZONA } from "@/nucleo/fechas";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { cuotaConfigurada, pasarelaDeLaCuota } from "@/nucleo/pagos/cuota";
import { Aviso, Casilla, Formulario, Insignia, Tarjeta } from "@/ui";
import { cuentaDe, type Cuenta, type Plan, planEfectivo, planes, plazos, sincronizar } from "../cuenta";
import { cancelarAccion, elegirPlanAccion } from "./acciones";

const dia = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA });

const MEDIOS: Record<string, string> = { account_money: "Dinero en cuenta de Mercado Pago", visa: "Visa", master: "Mastercard", amex: "American Express", debvisa: "Visa débito", debmaster: "Mastercard débito" };

function situacion(c: Cuenta, ahora: Date): { texto: string; color: "exito" | "advertencia" | "error" | "gris" } {
  if (c.moraDesde) return { texto: `Pago pendiente desde el ${dia(c.moraDesde)}`, color: "error" };
  if (c.pruebaHasta && !c.pagoHasta) {
    return c.pruebaHasta > ahora ? { texto: `Prueba gratis hasta el ${dia(c.pruebaHasta)}`, color: "advertencia" } : { texto: "Terminó la prueba", color: "error" };
  }
  if (c.pagoHasta) return { texto: `Pagado hasta el ${dia(c.pagoHasta)}`, color: c.pagoHasta > ahora ? "exito" : "advertencia" };
  return { texto: "Sin pagos", color: "gris" };
}

function Detalle({ plan }: { plan: Plan }) {
  const reg = catalogoDeCuenta();
  const nombres = plan.modulos.map((id) => reg.modulos.find((m) => m.id === id)?.nombre).filter(Boolean);
  const topes = reg.limites.map((l) => ({ etiqueta: l.etiqueta, tope: plan.topes[l.id], modulo: l.moduloId })).filter((t) => plan.modulos.includes(t.modulo));
  return (
    <ul className="flex flex-col gap-1 text-sm text-secondary">
      <li>Incluye: {nombres.length ? nombres.join(", ") : "—"}</li>
      <li>{plan.dominioPropio ? "Con dominio propio" : "Con subdominio (sin dominio propio)"}</li>
      {topes.map((t) => (
        <li key={t.etiqueta}>
          {t.etiqueta[0].toUpperCase() + t.etiqueta.slice(1)}: {t.tope === undefined ? "sin tope" : `hasta ${t.tope}`}
        </li>
      ))}
    </ul>
  );
}

/** /b/<slug>/pago: plan, vencimiento, forma de pago, cambiar de plan y cancelar. Solo el titular. */
export async function PantallaPago({ tenantId, slug, consulta }: PropsRutaPanel) {
  const ahora = new Date();
  let aviso: string | null = null;
  // Volvió de cargar la forma de pago: se trae el estado ya (el aviso de la pasarela puede tardar).
  if (consulta.get("suscripcion") === "volvio") {
    await sincronizar(tenantId).catch((e) => {
      console.error(`[comercial] sincronizar ${tenantId}:`, e);
      aviso = "Todavía no recibimos la confirmación de Mercado Pago. En unos minutos se actualiza sola.";
    });
  }
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) {
    return (
      <Aviso tono="info" titulo="Plan y pago">
        Tu banda todavía no tiene plan asignado. El equipo de Deoco te avisa cómo seguir.
      </Aviso>
    );
  }
  const todos = await planes();
  const actual = planEfectivo(cuenta, todos);
  const elegido = cuenta.planElegido ? todos.find((p) => p.id === cuenta.planElegido) : null;
  const [uso, limites, cfg, excedentes] = await Promise.all([usoAlmacenamiento(tenantId), usoDeLimites(tenantId), plazos(), excedentesDe(tenantId)]);
  const excedente = cuenta.excedentePlanId ? todos.find((p) => p.id === cuenta.excedentePlanId) : null;
  const s = situacion(cuenta, ahora);
  const activa = cuenta.suscripcionEstado === "activa";
  const habilitada = cuotaConfigurada();
  const pasarela = pasarelaDeLaCuota().nombre;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Plan y pago</h1>
        <p className="mt-1 text-md text-tertiary">La cuota mensual de Deoco. Se la pagás a Deoco por {pasarela}; las ventas de tu banda siguen yendo a tu cuenta.</p>
      </header>
      {aviso && <Aviso tono="info">{aviso}</Aviso>}
      {excedentes.length > 0 && (
        <Aviso tono="info" titulo="Lo que ya vendiste no se corta" data-testid="excedente">
          Tu plan no incluye {excedentes.map((x) => x.moduloId).join(", ")}, pero sigue prendido porque tiene operaciones abiertas (
          {excedentes.map((x) => x.excedenteMotivo).filter(Boolean).join("; ")}).
          {excedente ? ` Mientras tanto se cobra como el plan ${excedente.nombre}${excedente.precio !== null ? ` (${formatearPesos(excedente.precio)} por mes)` : ""}.` : ""}{" "}
          Cuando se cierre, se apaga solo.
        </Aviso>
      )}
      {!habilitada && (
        <Aviso tono="info" titulo="El cobro de la cuota todavía no está habilitado">
          Por ahora no se puede cargar una forma de pago. Tu cuenta sigue funcionando.
        </Aviso>
      )}

      <Tarjeta titulo={`Plan ${actual.nombre}`} junto={<Insignia color={s.color}>{s.texto}</Insignia>} data-testid="plan-actual" data-plan={actual.id}>
        <Detalle plan={actual} />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-tertiary">Cuota</dt>
            <dd className="text-primary" data-testid="cuota">
              {cuenta.montoSuscripcion ? `${formatearPesos(cuenta.montoSuscripcion)} por mes` : actual.precio !== null ? `${formatearPesos(actual.precio)} por mes` : actual.precioUsd || "a convenir"}
            </dd>
          </div>
          <div>
            <dt className="text-tertiary">Forma de pago</dt>
            <dd className="text-primary" data-testid="forma-de-pago" data-suscripcion={cuenta.suscripcionEstado ?? ""}>
              {activa
                ? `${pasarela}${cuenta.medioDePago ? ` · ${MEDIOS[cuenta.medioDePago] ?? cuenta.medioDePago}` : ""}`
                : cuenta.suscripcionEstado === "pendiente"
                  ? "Sin terminar de cargar"
                  : cuenta.suscripcionEstado === "cancelada"
                    ? "Cancelada"
                    : cuenta.suscripcionEstado === "pausada"
                      ? "Pausada"
                      : "Sin cargar"}
            </dd>
          </div>
          {cuenta.cargoPendiente > 0 && (
            <div>
              <dt className="text-tertiary">Con el próximo cobro</dt>
              <dd className="text-primary" data-testid="cargo-pendiente">{cuenta.cargoDetalle ?? formatearPesos(cuenta.cargoPendiente)}</dd>
            </div>
          )}
          {activa && cuenta.proximoCobro && (
            <div>
              <dt className="text-tertiary">Próximo cobro</dt>
              <dd className="text-primary">{dia(cuenta.proximoCobro)}</dd>
            </div>
          )}
          <div>
            <dt className="text-tertiary">Espacio usado</dt>
            <dd className="text-primary">
              {formatearBytes(uso.usado)} de {formatearBytes(uso.limite)}
            </dd>
          </div>
          {limites.map((l) => (
            <div key={l.id}>
              <dt className="text-tertiary">{l.etiqueta[0].toUpperCase() + l.etiqueta.slice(1)}</dt>
              <dd className="text-primary" data-limite={l.id}>
                {l.usados}
                {l.maximo !== null ? ` de ${l.maximo}` : " (sin tope)"}
              </dd>
            </div>
          ))}
        </dl>
        {elegido && (
          <Aviso tono="info" data-testid="plan-elegido">
            Elegiste el plan {elegido.nombre}: se aplica cuando {pasarela} confirme tu forma de pago.
          </Aviso>
        )}
        {cuenta.pruebaHasta && !cuenta.pagoHasta && !activa && (
          <p className="text-sm text-tertiary">
            Al terminar la prueba sin una forma de pago cargada empieza a correr la cuota impaga: a los {cfg.diasSoloLectura} días el panel queda en solo lectura y a los {cfg.diasMoraASuspender} el sitio deja de estar publicado. No se borra nada. Elegí un plan para seguir.
          </p>
        )}
        {cuenta.moraDesde && (
          <p className="text-sm text-tertiary">
            Si el pago no se regulariza, a los {cfg.diasSoloLectura} días el panel queda en solo lectura, a los {cfg.diasMoraASuspender} el sitio deja de estar publicado y a los {cfg.diasArchivo} la banda se archiva. Con el pago, todo vuelve al instante.
          </p>
        )}
      </Tarjeta>

      {cuenta.pro ? (
        <Aviso tono="info" titulo="Plan a medida">
          Tu plan lo arma el equipo de Deoco. Para cambiarlo, escribinos.
        </Aviso>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Planes">
          <h2 className="text-lg font-semibold text-primary">{activa ? "Cambiar de plan" : "Elegí tu plan"}</h2>
          {activa && <p className="text-sm text-tertiary">El cambio se aplica al instante; el monto nuevo se cobra desde el próximo mes (sin prorrateo).</p>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {todos.map((p) => {
              const esActual = p.id === actual.id && (activa || !!cuenta.pagoHasta) && !elegido;
              return (
                <Tarjeta
                  key={p.id}
                  titulo={p.nombre}
                  descripcion={p.descripcion || undefined}
                  junto={esActual ? <Insignia color="marca">Tu plan</Insignia> : undefined}
                  acciones={
                    <span className="text-right text-md font-semibold text-primary tabular-nums">
                      {p.aLaVenta && p.precio !== null ? `${formatearPesos(p.precio)}/mes` : p.aLaVenta ? "Próximamente" : "A convenir"}
                    </span>
                  }
                  data-plan-opcion={p.id}>
                  <Detalle plan={p} />
                  {p.aLaVenta ? (
                    !esActual &&
                    p.precio !== null && (
                      <Formulario accion={elegirPlanAccion.bind(null, slug, p.id)} puedeEditar={habilitada} etiqueta={activa ? `Cambiar a ${p.nombre}` : `Elegir ${p.nombre}`} />
                    )
                  ) : (
                    <p className="text-sm text-tertiary">Para bandas con necesidades propias: escribinos y lo armamos.</p>
                  )}
                </Tarjeta>
              );
            })}
          </div>
        </section>
      )}

      {cuenta.suscripcionId && cuenta.suscripcionEstado !== "cancelada" && (
        <Tarjeta titulo="Cancelar la suscripción" descripcion={`Deja de cobrarse. Todo sigue hasta el vencimiento; después corre la cuota impaga: a los ${cfg.diasSoloLectura} días el panel queda en solo lectura y a los ${cfg.diasMoraASuspender} el sitio deja de estar publicado. No se borra nada.`}>
          <Formulario accion={cancelarAccion.bind(null, slug)} puedeEditar etiqueta="Cancelar la suscripción" variante="peligro">
            <Casilla name="confirmar" etiqueta="Sí, quiero dejar de pagar la cuota" />
          </Formulario>
        </Tarjeta>
      )}
    </div>
  );
}
