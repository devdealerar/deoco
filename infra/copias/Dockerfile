# Servicio de copias (Easypanel: un servicio aparte, sin puertos). Corre copia.sh todos los días a
# las 06:15 UTC (03:15 en Argentina) con crond. restaurar.sh se corre a mano desde su consola.
FROM postgres:16-alpine
RUN apk add --no-cache rclone age tzdata
COPY copia.sh restaurar.sh /usr/local/bin/
RUN echo '15 6 * * * /usr/local/bin/copia.sh >> /proc/1/fd/1 2>&1' > /etc/crontabs/root
CMD ["crond", "-f", "-l", "8"]
