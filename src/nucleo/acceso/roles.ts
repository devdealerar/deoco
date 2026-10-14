// Roles. El núcleo tiene los tres que no son de negocio; los demás los declara cada módulo
// (`roles` en el contrato: PUERTA la ticketera, COMERCIAL la tienda y la ticketera). Un rol no da
// nada por sí mismo: los permisos dicen qué roles los tienen (`rolesPorDefecto`).
export type Rol = string;

export type DefinicionRol = { clave: Rol; etiqueta: string; descripcion?: string };

export const ROLES_NUCLEO: readonly DefinicionRol[] = [
  { clave: "TITULAR", etiqueta: "Titular", descripcion: "Todo, incluido el cobro y el plan." },
  { clave: "EDITOR", etiqueta: "Editor", descripcion: "Edita el contenido de la banda." },
  { clave: "LECTURA", etiqueta: "Lectura", descripcion: "Mira, no cambia nada." },
];

export const FORMA_ROL = /^[A-Z][A-Z_]{1,29}$/;
