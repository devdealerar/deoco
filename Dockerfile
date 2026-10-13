# Deoco: imagen de producción para Easypanel (o cualquier Docker).
# Construye con `next build` (el descubrimiento de módulos excluye los SOLO_DESARROLLO)
# y al arrancar aplica las migraciones pendientes antes de levantar el servidor.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Lo que necesita el postinstall (descubrir módulos + prisma generate) va antes que npm ci.
COPY package.json package-lock.json prisma.config.ts ./
COPY scripts ./scripts
COPY modulos ./modulos
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx next build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    DEOCO_ARCHIVOS_DIR=/data/archivos
COPY --from=build /app /app
# Volumen de archivos subidos por las bandas: montarlo en Easypanel (ver docs/despliegue.md).
VOLUME ["/data/archivos"]
EXPOSE 3000
CMD ["sh", "scripts/arrancar.sh"]
