import Link from "next/link";
import { notFound } from "next/navigation";
import { formatearBytes } from "@/nucleo/archivos";
import { formatearPesos, pesosParaCampo } from "@/nucleo/dinero";
import { ZONA } from "@/nucleo/fechas";
import { catalogoDeCuenta } from "@/nucleo/cuenta";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { cuotaConfigurada, urlAvisoCuota } from "@/nucleo/pagos/cuota";
import { Aviso, Campo, Casilla, Copiable, Filtros, Formulario, Insignia, Selector, Tabla, Tarjeta } from "@/ui";
import { type Plan, type ProAMedida, planEfectivo, planes, plazos } from "../cuenta";
import comercial from "../index";
import { asignarPlanAccion, guardarPlanAccion, guardarPlazosAccion } from "./acciones";
import { cobrosFallidos, cuentaParaStaff, type FilaCuenta, listarCuentas, ORDENES_CUENTA, pagina, SITUACIONES, type Situacion, texto } from "./datos";

const BASE = "/admin/m/comercial";
const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: ZONA });
const fecha = (d: Date | null) => (d ? FECHA.format(d) : "—");
const COLOR_ESTADO = { ACTIVO: "exito", MOROSO: "advertencia", MOROSO_GRAVE: "advertencia", SOLO_LECTURA: "error", SUSPENDIDO: "error", ARCHIVADO: "gris" } as const;
const SITUACION: Record<Situacion, string> = { prueba: "En prueba", "al-dia": "Al día", vencida: "Vencida", mora: "En mora", "sin-cuenta": "Sin cuenta" };
const gb = (b: bigint | null) => (b === null ? "" : String(Number(b) / 1024 ** 3).replace(".", ","));

function situacionDe(c: FilaCuenta, ahora: Date): Situacion {
  if (!c.planId) return "sin-cuenta";
  if (c.moraDesde) return "mora";
  const vence = c.pagoHasta ?? c.pruebaHasta;
  if (vence && vence <= ahora) return "vencida";
  return c.pagoHasta ? "al-dia" : "prueba";
}
const COLOR_SITUACION = { prueba: "marca", "al-dia": "exito", vencida: "advertencia", mora: "error", "sin-cuenta": "gris" } as const;

/** Módulos que un plan puede prender (el gestor de cuenta va siempre, no se elige). */
const modulosElegibles = () => catalogoDeCuenta().modulos.filter((m) => !m.esGestor);

/** Back office · Cuentas: plan, situación del pago y vencimiento de cada banda. 50 por página. */
export async function AdminCuentas({ consulta }: PropsRutaAdmin) {
  const ahora = new Date();
  const situacion = texto(consulta, "situacion") as Situacion;
  const columna = texto(consulta, "orden") as (typeof ORDENES_CUENTA)[number];
  const todos = await planes();
  const plan = texto(consulta, "plan");
  const filtro = {
    buscar: texto(consulta, "q") || undefined,
    situacion: SITUACIONES.includes(situacion) ? situacion : undefined,
    plan: todos.some((p) => p.id === plan) ? plan : undefined,
    orden: ORDENES_CUENTA.includes(columna)
      ? { columna, direccion: texto(consulta, "dir") === "asc" ? ("asc" as const) : ("desc" as const) }
      : { columna: "vence" as const, direccion: "asc" as const },
    pagina: pagina(consulta),
  };
  const { filas, ...paginacion } = await listarCuentas(filtro);
  const nombrePlan = new Map(todos.map((p) => [p.id, p.nombre]));
  return (
    <div className="flex flex-col gap-6">
      {!cuotaConfigurada() && (
        <Aviso tono="advertencia" titulo="La cuota no se puede cobrar">
          Falta la cuenta de Mercado Pago de Deoco (DEOCO_CUOTA_MP_TOKEN). Ver docs/despliegue.md.
        </Aviso>
      )}
      <Filtros>
        <Campo type="search" name="q" etiqueta="Buscar" placeholder="Nombre o slug" defaultValue={filtro.buscar} />
        <Selector
          name="situacion"
          etiqueta="Pago"
          defaultValue={filtro.situacion ?? ""}
          opciones={[{ valor: "", texto: "Todas" }, ...SITUACIONES.map((s) => ({ valor: s, texto: SITUACION[s] }))]}
        />
        <Selector name="plan" etiqueta="Plan" defaultValue={filtro.plan ?? ""} opciones={[{ valor: "", texto: "Todos" }, ...todos.map((p) => ({ valor: p.id, texto: p.nombre }))]} />
      </Filtros>
      <Tabla
        titulo="Cuentas"
        descripcion="Plan, pago y vencimiento de la cuota de cada banda."
        orden={filtro.orden}
        paginacion={paginacion}
        columnas={[
          { id: "nombre", etiqueta: "Banda", ordenable: true },
          { id: "plan", etiqueta: "Plan" },
          { id: "estado", etiqueta: "Estado" },
          { id: "pago", etiqueta: "Pago" },
          { id: "vence", etiqueta: "Vence", ordenable: true },
          { id: "forma", etiqueta: "Forma de pago" },
        ]}
        filas={filas.map((c) => {
          const s = situacionDe(c, ahora);
          return {
            id: c.id,
            celdas: [
              <Link key="banda" href={`${BASE}/bandas/${c.id}`} className="font-medium text-primary hover:text-brand-secondary" data-cuenta={c.slug}>
                {c.nombre}
              </Link>,
              <span key="plan" className="text-sm text-secondary" data-plan={c.planId ?? ""}>
                {c.planId ? `${nombrePlan.get(c.planId) ?? c.planId}${c.pro ? " a medida" : ""}` : "—"}
              </span>,
              <Insignia key="estado" color={COLOR_ESTADO[c.estado]}>
                {c.estado}
              </Insignia>,
              <Insignia key="pago" color={COLOR_SITUACION[s]}>
                {SITUACION[s]}
              </Insignia>,
              <span key="vence" className="text-sm whitespace-nowrap text-tertiary">
                {fecha(c.pagoHasta ?? c.pruebaHasta)}
              </span>,
              <span key="forma" className="text-sm text-tertiary">
                {c.suscripcionEstado ? `${c.suscripcionEstado}${c.medioDePago ? ` · ${c.medioDePago}` : ""}` : "—"}
              </span>,
            ],
          };
        })}
      />
    </div>
  );
}

function CamposModulosYTopes({ prefijo, plan }: { prefijo: string; plan?: Pick<Plan, "modulos" | "topes"> }) {
  const reg = catalogoDeCuenta();
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-secondary">Módulos</legend>
        {modulosElegibles().map((m) => (
          <Casilla key={m.id} name={`${prefijo}modulo_${m.id}`} etiqueta={m.nombre} marcada={plan?.modulos.includes(m.id)} />
        ))}
      </fieldset>
      {reg.limites.map((l) => (
        <Campo
          key={l.id}
          name={`${prefijo}tope_${l.id}`}
          type="number"
          etiqueta={`Tope de ${l.etiqueta}`}
          ayuda="Vacío: sin tope."
          defaultValue={plan?.topes[l.id]?.toString() ?? ""}
        />
      ))}
    </>
  );
}

/** Back office · Una cuenta: plan (o Pro a medida), suscripción y cobros. */
export async function AdminCuenta({ params }: PropsRutaAdmin) {
  const datos = await cuentaParaStaff(params.id);
  if (!datos) notFound();
  const { banda, cuenta, cobros } = datos;
  const todos = await planes();
  const efectivo = cuenta ? planEfectivo(cuenta, todos) : null;
  const pro = cuenta?.pro as ProAMedida | null | undefined;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">{banda.nombre}</h1>
        <p className="mt-1 text-md text-tertiary">
          <Link href={`/admin/bandas/${banda.slug}`} className="hover:text-brand-secondary">
            Ficha de la banda
          </Link>{" "}
          · estado <strong>{banda.estado}</strong> (desarchivar, solo a mano desde la ficha)
        </p>
      </header>
      <Tarjeta titulo={efectivo ? `Plan ${efectivo.nombre}` : "Sin cuenta"} data-testid="cuenta">
        {cuenta && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-tertiary">Prueba hasta</dt>
              <dd>{fecha(cuenta.pruebaHasta)}</dd>
            </div>
            <div>
              <dt className="text-tertiary">Pagado hasta</dt>
              <dd>{fecha(cuenta.pagoHasta)}</dd>
            </div>
            <div>
              <dt className="text-tertiary">En mora desde</dt>
              <dd>{fecha(cuenta.moraDesde)}</dd>
            </div>
            <div>
              <dt className="text-tertiary">Suscripción</dt>
              <dd>
                {cuenta.suscripcionEstado ?? "—"} {cuenta.suscripcionId && <span className="text-tertiary">({cuenta.suscripcionId})</span>}
              </dd>
            </div>
            <div>
              <dt className="text-tertiary">Monto</dt>
              <dd>{cuenta.montoSuscripcion ? formatearPesos(cuenta.montoSuscripcion) : "—"}</dd>
            </div>
            <div>
              <dt className="text-tertiary">Eligió (sin aplicar)</dt>
              <dd>{cuenta.planElegido ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Tarjeta>
      <Tarjeta
        titulo="Cambiar el plan"
        descripcion="Se aplica al instante (módulos y límites; si un tope baja, se despublica lo último publicado, sin borrar). Con la suscripción activa, el monto nuevo se cobra desde el próximo ciclo. El Pro y los planes a medida no se revisan solos: el cobro lo acuerda el equipo.">
        <Formulario accion={asignarPlanAccion.bind(null, banda.id)} puedeEditar etiqueta="Aplicar">
          <Selector name="plan" etiqueta="Plan" defaultValue={cuenta?.planId ?? ""} opciones={todos.map((p) => ({ valor: p.id, texto: p.nombre }))} />
          <Casilla name="aMedida" etiqueta="A medida (pisa módulos, espacio, topes y precio del plan)" marcada={!!pro} />
          <Campo name="pro_precio" etiqueta="Precio a medida por mes (pesos)" defaultValue={pro?.precio ? pesosParaCampo(pro.precio) : ""} />
          <Campo name="pro_almacenamiento" etiqueta="Espacio a medida (GB)" defaultValue={pro?.almacenamiento ? gb(BigInt(pro.almacenamiento)) : ""} />
          <CamposModulosYTopes prefijo="pro_" plan={pro ?? efectivo ?? undefined} />
        </Formulario>
      </Tarjeta>
      <Tabla
        titulo="Cobros de la cuota"
        columnas={[
          { id: "fecha", etiqueta: "Fecha" },
          { id: "estado", etiqueta: "Estado" },
          { id: "monto", etiqueta: "Monto" },
          { id: "id", etiqueta: "Id en la pasarela" },
        ]}
        filas={cobros.map((c) => ({
          id: c.id,
          celdas: [
            <span key="f">{fecha(c.fecha)}</span>,
            <Insignia key="e" color={c.estado === "aprobado" ? "exito" : c.estado === "rechazado" ? "error" : "gris"}>
              {c.estado}
            </Insignia>,
            <span key="m">{formatearPesos(c.monto)}</span>,
            <span key="i" className="text-sm text-tertiary">
              {c.cobroId}
            </span>,
          ],
        }))}
      />
    </div>
  );
}

/** Back office · Planes y plazos. */
export async function AdminPlanes(_: PropsRutaAdmin) {
  const [todos, cfg] = await Promise.all([planes(), plazos()]);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Planes y plazos</h1>
        <p className="mt-1 text-md text-tertiary">
          Precios en pesos: los fija el staff (no hay conversión automática). Un plan sin precio no se puede elegir. Al guardar, el plan se aplica al instante a las bandas que lo tienen; el precio nuevo rige para las suscripciones que se elijan desde ahora.
        </p>
      </header>
      <Tarjeta titulo="Avisos de Mercado Pago (cuenta de Deoco)" descripcion="Configurala una vez en la aplicación de Mercado Pago de Deoco → Webhooks, con los eventos de suscripciones.">
        <Copiable etiqueta="URL de avisos" valor={urlAvisoCuota(comercial)} />
      </Tarjeta>
      <Tarjeta titulo="Plazos" data-testid="plazos">
        <Formulario accion={guardarPlazosAccion} puedeEditar>
          <Campo name="diasPrueba" type="number" etiqueta="Días de prueba" defaultValue={String(cfg.diasPrueba)} required />
          <Selector name="planPrueba" etiqueta="Plan de la prueba" defaultValue={cfg.planPrueba} opciones={todos.map((p) => ({ valor: p.id, texto: p.nombre }))} />
          <p className="text-sm text-tertiary">La escalera de la cuota impaga, en días desde el vencimiento. Pagar en cualquier escalón (antes de archivar) devuelve todo al día.</p>
          <Campo name="diasGracia" type="number" etiqueta="Aviso (MOROSO)" ayuda="Aviso en el panel y mail al titular. Todo sigue funcionando." defaultValue={String(cfg.diasGracia)} required />
          <Campo name="diasAvisoFuerte" type="number" etiqueta="Aviso fuerte (MOROSO_GRAVE)" ayuda="Aviso permanente en el panel. Todo sigue funcionando." defaultValue={String(cfg.diasAvisoFuerte)} required />
          <Campo name="diasSoloLectura" type="number" etiqueta="Solo lectura (SOLO_LECTURA)" ayuda="El panel no guarda nada. El sitio y las ventas siguen." defaultValue={String(cfg.diasSoloLectura)} required />
          <Campo name="diasMoraASuspender" type="number" etiqueta="Suspendida (SUSPENDIDO)" ayuda="Sitio despublicado, ventas cortadas. La puerta de los shows vendidos sigue." defaultValue={String(cfg.diasMoraASuspender)} required />
          <Campo name="diasArchivo" type="number" etiqueta="Archivada (ARCHIVADO)" ayuda="El sitio y el panel se van; los dominios siguen siendo de la banda." defaultValue={String(cfg.diasArchivo)} required />
        </Formulario>
      </Tarjeta>
      {todos.map((p) => (
        <Tarjeta
          key={p.id}
          titulo={p.nombre}
          junto={!p.aLaVenta ? <Insignia>No se elige solo</Insignia> : p.precio === null ? <Insignia color="advertencia">Sin precio</Insignia> : undefined}
          acciones={<span className="text-md font-semibold">{p.precio !== null ? formatearPesos(p.precio) : p.precioUsd || "—"}</span>}
          data-plan={p.id}>
          <Formulario accion={guardarPlanAccion.bind(null, p.id)} puedeEditar>
            <Campo name="nombre" etiqueta="Nombre" defaultValue={p.nombre} required />
            <Campo name="descripcion" etiqueta="Para quién es" defaultValue={p.descripcion} />
            <Campo name="precioUsd" etiqueta="Precio de referencia (USD, solo se muestra)" defaultValue={p.precioUsd} />
            <Campo name="precio" etiqueta="Precio por mes (pesos)" ayuda="Lo que se cobra. Vacío: sin precio." defaultValue={p.precio !== null ? pesosParaCampo(p.precio) : ""} />
            <Campo name="almacenamiento" etiqueta="Espacio (GB)" ayuda={`Vacío: el de la plataforma.${p.almacenamiento !== null ? ` Hoy: ${formatearBytes(p.almacenamiento)}.` : ""}`} defaultValue={gb(p.almacenamiento)} />
            <Casilla name="aLaVenta" etiqueta="A la venta (la banda lo elige y paga sola)" marcada={p.aLaVenta} />
            <Casilla name="dominioPropio" etiqueta="Con dominio propio (sin él, el dominio de la banda deja de servirse y vuelve el subdominio)" marcada={p.dominioPropio} />
            <CamposModulosYTopes prefijo="" plan={p} />
          </Formulario>
        </Tarjeta>
      ))}
    </div>
  );
}

/** Back office · Cobros de cuota rechazados, de todas las bandas. */
export async function AdminCobros({ consulta }: PropsRutaAdmin) {
  const { filas, ...paginacion } = await cobrosFallidos(pagina(consulta));
  return (
    <Tabla
      titulo="Cobros fallidos"
      descripcion="Cuotas rechazadas por la pasarela. La banda pasa a MOROSO y recibe un mail; si no regulariza, sigue la escalera (solo lectura, sitio despublicado, archivo)."
      paginacion={paginacion}
      columnas={[
        { id: "banda", etiqueta: "Banda" },
        { id: "fecha", etiqueta: "Fecha" },
        { id: "monto", etiqueta: "Monto" },
        { id: "estado", etiqueta: "Estado de la banda" },
        { id: "detalle", etiqueta: "Detalle" },
      ]}
      filas={filas.map((c) => ({
        id: c.id,
        celdas: [
          c.banda ? (
            <Link key="b" href={`${BASE}/bandas/${c.tenantId}`} className="font-medium text-primary hover:text-brand-secondary">
              {c.banda.nombre}
            </Link>
          ) : (
            <span key="b">—</span>
          ),
          <span key="f">{fecha(c.fecha)}</span>,
          <span key="m">{formatearPesos(c.monto)}</span>,
          c.banda ? (
            <Insignia key="e" color={COLOR_ESTADO[c.banda.estado]}>
              {c.banda.estado}
            </Insignia>
          ) : (
            <span key="e" />
          ),
          <span key="d" className="text-sm text-tertiary">
            {c.estadoPasarela || "—"} · {c.cobroId}
          </span>,
        ],
      }))}
    />
  );
}
