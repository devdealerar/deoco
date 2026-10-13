// Lo que comparten servidor y navegador en la tienda pública: sin dependencias (lo importan
// componentes de cliente; nada de base, archivos ni núcleo acá).

/** "Talle: M · Color: Negro" */
export const describirVariante = (v: Record<string, string>) =>
  Object.entries(v)
    .map(([k, x]) => `${k}: ${x}`)
    .join(" · ");

export const PROVINCIAS = [
  "Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis",
  "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

