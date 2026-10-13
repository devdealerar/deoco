// Contrato de módulos. Es lo único que un módulo importa del núcleo (además de
// conTenant y los helpers de acceso). Un módulo nunca importa código de otro.
import type { ReactNode } from "react";
import type { Rol } from "@/generated/prisma/client";
import type { AccesoPanel } from "@/nucleo/acceso/panel";

export type { Rol };

/**
 * Permiso con forma `modulo.recurso.accion`.
 * `exclusivoTitular`: solo el titular; ni otro rol ni el staff de Deoco (pasarela
 * de cobro). Exige rolesPorDefecto = ["TITULAR"].
 */
export type DefinicionPermiso = {
  clave: string;
  rolesPorDefecto: Rol[];
  exclusivoTitular?: boolean;
};

export type PropsRutaPanel = {
  tenantId: string;
  acceso: AccesoPanel;
  /** Segmentos dinámicos de la ruta: "/x/[id]" → { id } */
  params: Record<string, string>;
};

export type PropsRutaPublica = {
  tenantId: string;
  params: Record<string, string>;
};

/**
 * `ruta` empieza con "/" y admite segmentos dinámicos `[nombre]`.
 * Panel: se monta bajo /b/<slug>. Sitio público: en la raíz del host de la banda.
 */
export type RutaModulo<P> = {
  ruta: string;
  /** Solo panel: permiso necesario para entrar (si falta, alcanza con ser miembro). */
  permiso?: string;
  componente: (props: P) => ReactNode | Promise<ReactNode>;
};

export type EntradaNavegacion = {
  etiqueta: string;
  /** Relativo a la superficie: /b/<slug> en el panel, la raíz en el sitio público. */
  href: string;
  /** Solo panel. Las pestañas públicas no llevan permiso. */
  permiso?: string;
  /** true: pestaña del sitio público. false/ausente: menú del panel. */
  publica?: boolean;
  /** El núcleo ordena de menor a mayor. */
  orden: number;
};

export type Evento = {
  id: string;
  nombre: string;
  tenantId: string;
  usuarioId: string | null;
  fecha: Date;
  payload: unknown;
};

export type Modulo = {
  id: string;
  nombre: string;
  permisos: DefinicionPermiso[];
  rutasPanel?: RutaModulo<PropsRutaPanel>[];
  rutasPublicas?: RutaModulo<PropsRutaPublica>[];
  navegacion?: EntradaNavegacion[];
  /** Nombres en pasado: `pedido.pagado`. Los usa el bus de eventos (parte 5). */
  eventosEmite?: string[];
  eventosEscucha?: { evento: string; manejador: (e: Evento) => Promise<void> }[];
  /** Ids de módulos que tienen que estar prendidos para prender este. */
  dependencias?: string[];
};
