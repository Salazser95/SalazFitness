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

WORKDIR /srv/wger
RUN pip install --no-cache-dir . \
    && pip install --no-cache-dir gunicorn mysqlclient

# El modulo propio, encima y aparte.
COPY backend /srv/salaz-backend
ENV PYTHONPATH=/srv/salaz-backend:/srv/wger

COPY deploy/arrancar.sh /usr/local/bin/arrancar.sh
RUN chmod +x /usr/local/bin/arrancar.sh \
    && mkdir -p /srv/salaz/static /srv/salaz/media

EXPOSE 8000
CMD ["/usr/local/bin/arrancar.sh"]
