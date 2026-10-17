// Módulo manager: el panel del representante con varios artistas (3.2, etapa 2; plan Sello).
// Producto aparte: lo da el staff (cuenta externa); cada banda lo suma a su equipo con una
// invitación y lo saca cuando quiere (el acceso cesa al instante, nada se borra). La vista
// consolidada es de números agregados: nunca unifica bases de fans (3.2 manager d1).
import type { Modulo } from "@/nucleo/modulos/contrato";
import { AdminSellos } from "./admin/pantallas";
import { CalendarioManager, CompararManager, ExportarManager, RosterManager } from "./portal/paginas";

const manager: Modulo = {
  id: "manager",
  nombre: "Manager",
  permisos: [],
  tablasGlobales: ["manager_sello"],
  cuentasExternas: { etiqueta: "Panel del manager" },
  rutasExternas: [
    { ruta: "/", componente: RosterManager },
    { ruta: "/calendario", componente: CalendarioManager },
    { ruta: "/comparar", componente: CompararManager },
    { ruta: "/exportar", componente: ExportarManager },
  ],
  rutasAdmin: [{ ruta: "/", componente: AdminSellos }],
  navegacion: [
    { etiqueta: "Roster", href: "/", externa: true, orden: 1 },
    { etiqueta: "Calendario", href: "/calendario", externa: true, orden: 2 },
    { etiqueta: "Comparar", href: "/comparar", externa: true, orden: 3 },
    { etiqueta: "Exportar", href: "/exportar", externa: true, orden: 4 },
    { etiqueta: "Sellos", href: "/", admin: true, orden: 60 },
  ],
};

export default manager;
