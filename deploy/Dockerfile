# Imagen del backend: wger + el modulo salaz, servido con gunicorn.
#
# wger se clona aqui dentro y NO se modifica: el modulo salaz se engancha por
# PYTHONPATH, que es lo mismo que se hace en local (ver docs/ARQUITECTURA.md).
# Asi `git pull` en wger sigue funcionando sin conflictos.

FROM python:3.12-slim

# Rama de wger que se usa. Fijada a proposito: una imagen que se reconstruye
# sola con el ultimo master de otro proyecto no es reproducible.
ARG WGER_REF=master

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=salaz_settings_prod

RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        build-essential \
        default-libmysqlclient-dev \
        pkg-config \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

RUN git clone --depth 1 --branch "${WGER_REF}" https://github.com/wger-project/wger.git /srv/wger

# Un unico parche puntual sobre wger, aplicado aqui (nunca sobre el checkout
# del desarrollador, ver la nota de mas arriba): la migracion
# manager.0025_change_pk_to_uuid falla siempre contra MySQL con el error 1093
# (autorreferencia una tabla dentro de su propio UPDATE, algo que MySQL
# prohibe y PostgreSQL/SQLite no). Detalle completo en el propio script.
COPY deploy/parches/wger_mysql_workoutlog_next_log.py /tmp/parche.py
RUN python3 /tmp/parche.py && rm /tmp/parche.py

WORKDIR /srv/wger
RUN pip install --no-cache-dir . \
    && pip install --no-cache-dir gunicorn mysqlclient anthropic

# El modulo propio, encima y aparte.
COPY backend /srv/salaz-backend
ENV PYTHONPATH=/srv/salaz-backend:/srv/wger

COPY deploy/arrancar.sh /usr/local/bin/arrancar.sh
# Quita el retorno de carro por si el fichero se clono en Windows con Git
# en modo CRLF: con \r delante del salto de linea, la primera linea deja de
# ser "#!/bin/sh" (pasa a "#!/bin/sh\r") y exec falla con un enganoso
# "no such file or directory" aunque el fichero exista. sed -i 's/\r$//'
# hace esto seguro pase lo que pase con el checkout del host, porque se
# ejecuta aqui dentro, en Linux, sobre los bytes ya copiados.
RUN sed -i 's/\r$//' /usr/local/bin/arrancar.sh \
    && chmod +x /usr/local/bin/arrancar.sh \
    && mkdir -p /srv/salaz/static /srv/salaz/media

EXPOSE 8000
CMD ["/usr/local/bin/arrancar.sh"]
