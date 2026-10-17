-- Módulo lanzamiento (3.2, etapa 2): campañas con cronograma y piezas por formato. La plantilla y
-- las medidas son globales (las edita el staff, sin tocar código); lo de cada banda, con RLS.
-- CreateTable
CREATE TABLE "lanzamiento_tarea_base" (
    "clave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "dias" INTEGER NOT NULL,
    "dependeDe" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lanzamiento_tarea_base_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "lanzamiento_formato" (
    "id" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "pieza" TEXT NOT NULL,
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "notas" TEXT NOT NULL DEFAULT '',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lanzamiento_formato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lanzamiento_campania" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'single',
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "creadoPor" UUID,
    "canceladaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lanzamiento_campania_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lanzamiento_hito" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "campaniaId" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "dias" INTEGER NOT NULL,
    "dependeDe" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vence" TIMESTAMP(3) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "hechoEn" TIMESTAMP(3),
    "hechoPor" UUID,

    CONSTRAINT "lanzamiento_hito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lanzamiento_pieza" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "campaniaId" UUID NOT NULL,
    "formatoId" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "pieza" TEXT NOT NULL,
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "archivoId" UUID,
    "archivoNombre" TEXT,
    "anchoReal" INTEGER,
    "altoReal" INTEGER,
    "conforme" BOOLEAN,
    "subidaEn" TIMESTAMP(3),

    CONSTRAINT "lanzamiento_pieza_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lanzamiento_campania_tenantId_estado_idx" ON "lanzamiento_campania"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "lanzamiento_campania_tenantId_id_key" ON "lanzamiento_campania"("tenantId", "id");

-- CreateIndex
CREATE INDEX "lanzamiento_hito_tenantId_vence_idx" ON "lanzamiento_hito"("tenantId", "vence");

-- CreateIndex
CREATE UNIQUE INDEX "lanzamiento_hito_tenantId_campaniaId_clave_key" ON "lanzamiento_hito"("tenantId", "campaniaId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "lanzamiento_pieza_tenantId_campaniaId_formatoId_key" ON "lanzamiento_pieza"("tenantId", "campaniaId", "formatoId");

-- AddForeignKey
ALTER TABLE "lanzamiento_hito" ADD CONSTRAINT "lanzamiento_hito_tenantId_campaniaId_fkey" FOREIGN KEY ("tenantId", "campaniaId") REFERENCES "lanzamiento_campania"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lanzamiento_pieza" ADD CONSTRAINT "lanzamiento_pieza_tenantId_campaniaId_fkey" FOREIGN KEY ("tenantId", "campaniaId") REFERENCES "lanzamiento_campania"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT deoco_tabla_global('lanzamiento_tarea_base');
SELECT deoco_tabla_global('lanzamiento_formato');
SELECT deoco_aislar_tabla('lanzamiento_campania');
SELECT deoco_aislar_tabla('lanzamiento_hito');
SELECT deoco_aislar_tabla('lanzamiento_pieza');

-- Plantilla de arranque: unas veinte tareas de un lanzamiento (días desde la fecha; negativo = antes).
-- La distribuidora pide la música con tiempo (el pitch editorial de Spotify, al menos 7 días antes;
-- conviene 4 semanas). El staff la ajusta.
INSERT INTO "lanzamiento_tarea_base" ("clave", "titulo", "descripcion", "dias", "dependeDe", "orden") VALUES
  ('definir', 'Definir fecha, formato y plan', 'Qué sale (single, EP, álbum), cuándo y con qué presupuesto.', -60, '{}', 1),
  ('master', 'Master final del audio', 'Mezcla y master aprobados, en WAV.', -45, '{definir}', 2),
  ('arte', 'Arte de tapa final', 'La tapa en 3000×3000, sin texto chico ni bordes.', -45, '{definir}', 3),
  ('fotos', 'Sesión de fotos de prensa', 'Horizontales y verticales, en alta.', -40, '{definir}', 4),
  ('metadatos', 'Metadatos y créditos', 'Títulos, ISRC, compositores, productores, sello, letras.', -40, '{master}', 5),
  ('distribuidora', 'Subir a la distribuidora', 'Audio, tapa y metadatos. Elegir la fecha y la hora de salida.', -35, '{master,arte,metadatos}', 6),
  ('pitch', 'Pitch editorial en Spotify for Artists', 'Con la canción ya cargada; mínimo 7 días antes.', -28, '{distribuidora}', 7),
  ('presave', 'Link de pre-save', 'Un link para todas las plataformas.', -21, '{distribuidora}', 8),
  ('gacetilla', 'Gacetilla de prensa', 'Texto, fotos, links y contacto.', -25, '{fotos,metadatos}', 9),
  ('prensa', 'Envío a prensa y radios', 'Con la gacetilla y el link privado.', -21, '{gacetilla}', 10),
  ('piezas', 'Piezas gráficas para redes', 'Todos los formatos de la lista de piezas.', -21, '{arte}', 11),
  ('video', 'Video o visualizer', 'Para YouTube y redes.', -21, '{master,arte}', 12),
  ('canvas', 'Canvas de Spotify', 'Video vertical corto (3 a 8 s).', -14, '{arte}', 13),
  ('anuncio', 'Anuncio en redes', 'La fecha, la tapa y el pre-save.', -14, '{piezas,presave}', 14),
  ('playlists', 'Pitch a playlists independientes', 'Curadores y blogs del género.', -10, '{distribuidora}', 15),
  ('newsletter', 'Newsletter a la base de fans', 'Con el pre-save; el día, otro con el link.', -7, '{anuncio}', 16),
  ('teasers', 'Teasers en redes', 'Fragmentos del video o del audio.', -7, '{video,piezas}', 17),
  ('salida', 'Día del lanzamiento', 'Posteo, historias y el link en todos lados.', 0, '{anuncio}', 18),
  ('sitio', 'Actualizar el sitio y los links', 'Discografía, links de escucha y la bio.', 0, '{distribuidora}', 19),
  ('seguimiento', 'Seguimiento', 'Agradecer, compartir lo que publiquen, mirar los números.', 7, '{salida}', 20),
  ('informe', 'Informe de la campaña', 'Qué funcionó y qué no, para el próximo.', 30, '{seguimiento}', 21);

-- Medidas de arranque (píxeles). Las plataformas las cambian: las actualiza el staff. Son las
-- recomendadas por cada plataforma a la fecha; a confirmar (3.2: medidas pendientes).
INSERT INTO "lanzamiento_formato" ("id", "plataforma", "pieza", "ancho", "alto", "notas", "orden") VALUES
  ('tapa', 'Plataformas de música', 'Tapa', 3000, 3000, 'Cuadrada, JPG o PNG en RGB.', 1),
  ('ig-post', 'Instagram', 'Posteo vertical', 1080, 1350, '4:5.', 2),
  ('ig-cuadrado', 'Instagram', 'Posteo cuadrado', 1080, 1080, '1:1.', 3),
  ('ig-historia', 'Instagram', 'Historia / Reel', 1080, 1920, '9:16. Dejar libre arriba y abajo.', 4),
  ('yt-miniatura', 'YouTube', 'Miniatura', 1280, 720, '16:9.', 5),
  ('yt-banner', 'YouTube', 'Banner del canal', 2560, 1440, 'Lo importante, en el centro (1546×423).', 6),
  ('fb-portada', 'Facebook', 'Portada', 1640, 856, '', 7),
  ('fb-evento', 'Facebook', 'Portada de evento', 1920, 1005, '', 8),
  ('x-encabezado', 'X', 'Encabezado', 1500, 500, '3:1.', 9),
  ('bandcamp', 'Bandcamp', 'Tapa', 1400, 1400, 'Mínimo 1400×1400.', 10),
  ('prensa-h', 'Prensa', 'Foto horizontal', 3000, 2000, '3:2, en alta.', 11),
  ('prensa-v', 'Prensa', 'Foto vertical', 2000, 3000, '2:3, en alta.', 12);
