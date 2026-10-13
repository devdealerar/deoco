// Banda de demostración con el sitio cargado y publicado. Uso: npm run db:demo
// Crea "Los Satélites" (los-satelites.<raiz>) y "Niebla Norte" (niebla-norte.<raiz>),
// usuarios de prueba y contenido con imágenes generadas (grandes, como las de un celular).
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import { guardarArchivo } from "@/nucleo/archivos";
import { conTenant } from "@/nucleo/db/con-tenant";
import { PrismaClient } from "../src/generated/prisma/client";
import { publicar } from "../modulos/sitio/contenido";

const dueno = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_MIGRACIONES! }) });
const raiz = process.env.DEOCO_DOMINIO_RAIZ ?? "lvh.me";
const CLAVE = "demo1234";

/** Imagen tipo foto de show: degradé, luces y ruido; grande como la de un celular. */
async function foto(ancho: number, alto: number, c1: string, c2: string, texto = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <radialGradient id="l" cx=".7" cy=".2" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" fill="url(#l)"/>
    ${[0.18, 0.38, 0.6, 0.8].map((x, i) => `<ellipse cx="${x * ancho}" cy="${alto * 0.95}" rx="${ancho * 0.09}" ry="${alto * (0.3 + i * 0.05)}" fill="#000" opacity=".55"/>`).join("")}
    <text x="50%" y="88%" font-family="sans-serif" font-weight="900" font-size="${alto * 0.06}" fill="#fff" fill-opacity=".85" text-anchor="middle">${texto}</text>
  </svg>`;
  // Grano de foto: ruido aleatorio encima (por eso pesa varios MB, como una foto real).
  const grano = await sharp(randomBytes(ancho * alto), { raw: { width: ancho, height: alto, channels: 1 } })
    .toColourspace("b-w")
    .png()
    .toBuffer();
  return sharp(Buffer.from(svg))
    .composite([{ input: grano, blend: "soft-light" }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function logo(texto: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400">
    <text x="50%" y="62%" font-family="sans-serif" font-weight="900" font-size="118" letter-spacing="4" fill="${color}" text-anchor="middle">${texto}</text>
  </svg>`;
  return { png: await sharp(Buffer.from(svg)).png().toBuffer(), svg: Buffer.from(svg) };
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

type Banda = {
  slug: string;
  nombre: string;
  acento: string;
  fondo: string;
  tipografia: "SANS" | "SERIF" | "MONO";
  colores: [string, string][];
  bioCorta: string;
  bioLarga: string;
  fechas: [number, string, string][];
  links: ["RED" | "ESCUCHA", string, string][];
  prensa: [string, string, string];
};

const BANDAS: Banda[] = [
  {
    slug: "los-satelites",
    nombre: "Los Satélites",
    acento: "#ff5a36",
    fondo: "#0e0d12",
    tipografia: "SANS",
    colores: [["#3b1d6e", "#ff5a36"], ["#0f3057", "#00a8cc"], ["#541212", "#ffb703"], ["#1b4332", "#95d5b2"]],
    bioCorta: "Rock de garage desde Rosario. Tres discos, cientos de fechas y un show que no se parece a ningún otro.",
    bioLarga:
      "Los Satélites se formaron en 2014 en un sótano del barrio Echesortu, en Rosario. Desde entonces editaron tres discos de estudio y recorrieron el país de punta a punta.\n\nSu último trabajo, «Órbita baja» (2025), fue grabado en vivo en una sola toma y mezclado en cinta. La crítica lo describió como «el disco más honesto del año».\n\nEn vivo son una aplanadora: guitarras al frente, una base que no afloja y un cantante que termina siempre abajo del escenario.",
    fechas: [[12, "Club Lucero", "Rosario"], [26, "Niceto Club", "Buenos Aires"], [45, "Teatro Melos", "Córdoba"], [60, "La Trastienda", "Montevideo"]],
    links: [
      ["ESCUCHA", "Spotify", "https://open.spotify.com/"],
      ["ESCUCHA", "Bandcamp", "https://bandcamp.com/"],
      ["ESCUCHA", "YouTube Music", "https://music.youtube.com/"],
      ["RED", "Instagram", "https://instagram.com/"],
      ["RED", "TikTok", "https://tiktok.com/"],
    ],
    prensa: ["Laura Méndez", "prensa@lossatelites.com.ar", "+54 9 341 555-0101"],
  },
  {
    slug: "niebla-norte",
    nombre: "Niebla Norte",
    acento: "#2d6a4f",
    fondo: "#f4f1ea",
    tipografia: "SERIF",
    colores: [["#d8e2dc", "#2d6a4f"], ["#ffe5d9", "#9d8189"]],
    bioCorta: "Canciones lentas para días nublados. Folk de cámara desde Bariloche.",
    bioLarga: "Niebla Norte es el proyecto de Ana Ruiz y Tomás Ibarra.\n\nGrabaron su primer EP en una cabaña frente al lago Gutiérrez.",
    fechas: [[20, "Café Alberto", "Bariloche"]],
    links: [["ESCUCHA", "Spotify", "https://open.spotify.com/"], ["RED", "Instagram", "https://instagram.com/"]],
    prensa: ["Ana Ruiz", "hola@nieblanorte.com", ""],
  },
];

async function usuario(email: string, nombre: string, esStaff = false) {
  const hashContrasena = await hashearContrasena(CLAVE);
  return dueno.usuario.upsert({ where: { email }, update: {}, create: { email, nombre, hashContrasena, esStaff } });
}

async function main() {
  await usuario("staff@deoco.com", "Staff Deoco", true);
  const titular = await usuario("titular@demo.com", "Titular Demo");
  const lectura = await usuario("lectura@demo.com", "Solo Lectura");

  for (const b of BANDAS) {
    const existente = await dueno.tenant.findUnique({ where: { slug: b.slug } });
    if (existente) {
      console.log(`· ${b.slug} ya existe (borrala para regenerarla)`);
      continue;
    }
    const tenant = await dueno.tenant.create({ data: { nombre: b.nombre, slug: b.slug } });
    const t = tenant.id;
    await dueno.dominio.create({ data: { tenantId: t, dominio: `${b.slug}.${raiz}`, esPrincipal: true, verificado: true } });
    await dueno.membresia.createMany({
      data: [
        { tenantId: t, usuarioId: titular.id, rol: b.slug === "los-satelites" ? "TITULAR" : "EDITOR" },
        { tenantId: t, usuarioId: lectura.id, rol: "LECTURA" },
      ],
    });
    // La semilla corre como dueño: prende el módulo directo (prenderModulo carga todo el
    // registro, con páginas y CSS, que un script de Node no necesita).
    await dueno.moduloTenant.create({ data: { tenantId: t, moduloId: "sitio" } });

    const subir = (nombre: string, datos: Buffer, tipos: ("jpeg" | "png" | "webp" | "svg" | "pdf")[], ancho?: number) =>
      guardarArchivo(t, { nombre, datos }, { moduloId: "sitio", tipos, variantes: ancho ? [{ nombre: "web", ancho, alto: ancho }] : [] });

    const l = await logo(b.nombre.toUpperCase(), b.fondo === "#f4f1ea" ? "#1b1b1b" : "#ffffff");
    const logoId = (await subir("logo.png", l.png, ["png"], 600)).id;
    const fondoId = (await subir("fondo.jpg", await foto(4000, 2600, b.colores[0][0], b.colores[0][1]), ["jpeg"], 2000)).id;
    const riderId = (await subir(`Rider ${b.nombre}.pdf`, PDF, ["pdf"])).id;
    const slides: string[] = [];
    for (const [i, [c1, c2]] of b.colores.entries()) {
      slides.push((await subir(`show-${i + 1}.jpg`, await foto(4000, 2667, c1, c2, `${b.nombre} en vivo`), ["jpeg"], 1600)).id);
    }
    const fotos: string[] = [];
    for (const [i, [c1, c2]] of b.colores.slice(0, 3).entries()) {
      fotos.push((await subir(`${b.slug}-prensa-${i + 1}.jpg`, await foto(4500, 3000, c2, c1, b.nombre), ["jpeg"], 800)).id);
    }
    const logoPng = (await subir(`${b.slug}-logo.png`, l.png, ["png"], 800)).id;
    const logoSvg = (await subir(`${b.slug}-logo.svg`, l.svg, ["svg"])).id;

    await conTenant(t, async (tx) => {
      await tx.sitioPerfil.create({
        data: {
          tenantId: t,
          logoArchivoId: logoId,
          fondoArchivoId: fondoId,
          colorFondo: b.fondo,
          colorAcento: b.acento,
          tipografia: b.tipografia,
          bioCorta: b.bioCorta,
          bioLarga: b.bioLarga,
          riderArchivoId: riderId,
          prensaNombre: b.prensa[0],
          prensaEmail: b.prensa[1],
          prensaTelefono: b.prensa[2],
        },
      });
      await tx.sitioSlide.createMany({ data: slides.map((archivoId, i) => ({ tenantId: t, archivoId, textoAlt: `${b.nombre} en vivo`, orden: i + 1 })) });
      const hoy = Date.now();
      await tx.sitioFecha.createMany({
        data: b.fechas.map(([dias, lugar, ciudad]) => ({
          tenantId: t,
          fecha: new Date(new Date(hoy + dias * 864e5).toISOString().slice(0, 10) + "T12:00:00Z"),
          lugar,
          ciudad,
          link: "https://example.com/entradas",
        })),
      });
      await tx.sitioLink.createMany({ data: b.links.map(([tipo, plataforma, url], i) => ({ tenantId: t, tipo, plataforma, url, orden: i + 1 })) });
      await tx.sitioDescargable.createMany({
        data: [
          ...fotos.map((archivoId, i) => ({ tenantId: t, tipo: "FOTO" as const, archivoId, descripcion: `Foto: Prensa ${b.nombre} ${i + 1}`, orden: i + 1 })),
          { tenantId: t, tipo: "LOGO" as const, archivoId: logoPng, descripcion: "Logo PNG", orden: 1 },
          { tenantId: t, tipo: "LOGO" as const, archivoId: logoSvg, descripcion: "Logo vectorial", orden: 2 },
        ],
      });
      await publicar(tx, t, titular.id);
    });
    console.log(`✓ ${b.nombre}: http://${b.slug}.${raiz}:3000 · panel http://app.${raiz}:3000/b/${b.slug}`);
  }
  console.log(`Usuarios (clave "${CLAVE}"): titular@demo.com (titular en Los Satélites, editor en Niebla Norte), lectura@demo.com, staff@deoco.com`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => dueno.$disconnect());
