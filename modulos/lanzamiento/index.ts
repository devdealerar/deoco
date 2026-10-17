// Módulo lanzamiento: el organizador de lanzamientos (3.2, etapa 2). Interno del panel, sin nada en
// el sitio público. Una campaña por lanzamiento: cronograma con dependencias y piezas por formato,
// derivados de una plantilla que el staff edita desde el back office.
import type { Modulo } from "@/nucleo/modulos/contrato";
import { AdminLanzamiento } from "./admin/pantallas";
import { inicioLanzamiento } from "./inicio";
import { CampaniaPanel, CampaniasPanel } from "./panel/paginas";
import { conTenant } from "@/nucleo/db/con-tenant";

const VER = "lanzamiento.campanias.ver";
const EDITAR = "lanzamiento.campanias.editar";

const lanzamiento: Modulo = {
  id: "lanzamiento",
  nombre: "Lanzamientos",
  permisos: [
    { clave: VER, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "LECTURA"] },
    { clave: EDITAR, rolesPorDefecto: ["TITULAR", "EDITOR"] },
  ],
  tablasGlobales: ["lanzamiento_tarea_base", "lanzamiento_formato"],
  edicion: { permiso: EDITAR, ruta: "/lanzamientos", sinPermiso: "Tu rol no puede editar los lanzamientos." },
  archivos: [{ recurso: "pieza", permiso: VER }],
  rutasPanel: [
    { ruta: "/lanzamientos", permiso: VER, componente: CampaniasPanel },
    { ruta: "/lanzamientos/[id]", permiso: VER, componente: CampaniaPanel },
  ],
  rutasAdmin: [{ ruta: "/", componente: AdminLanzamiento }],
  navegacion: [
    { etiqueta: "Lanzamientos", href: "/lanzamientos", permiso: VER, orden: 50 },
    { etiqueta: "Lanzamientos", href: "/", admin: true, orden: 50 },
  ],
  consultas: [{ nombre: "inicio", responder: inicioLanzamiento }],
  mediciones: [{ clave: "lanzamiento.campanias", etiqueta: "Campañas de lanzamiento", medir: (t) => conTenant(t, (tx) => tx.lanzamientoCampania.count()) }],
};

export default lanzamiento;
