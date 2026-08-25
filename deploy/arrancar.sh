#!/bin/sh
# Arranque del backend: espera a MySQL, migra, y levanta gunicorn.
set -e

cd /srv/wger

echo "Esperando a MySQL en ${SALAZ_DB_HOST}:${SALAZ_DB_PORT}..."
# Se comprueba con el propio Django y no con un `nc`: asi se valida que la
# conexion funciona con estas credenciales, no solo que el puerto esta abierto.
intentos=0
until python manage.py check --database default >/dev/null 2>&1; do
    intentos=$((intentos + 1))
    if [ "$intentos" -gt 60 ]; then
        echo "MySQL no responde despues de 60 intentos. Se aborta." >&2
        python manage.py check --database default
        exit 1
    fi
    sleep 2
done

echo "Aplicando migraciones..."
python manage.py migrate --noinput

echo "Recopilando estaticos..."
python manage.py collectstatic --noinput

# La cuenta de prueba solo se crea si se pide explicitamente. En un servidor
# de verdad no interesa que exista un usuario con contrasena conocida.
if [ -n "${SALAZ_CREAR_USUARIO_PRUEBA}" ]; then
    echo "Creando la cuenta de prueba salaz1..."
    python manage.py crear_usuario salaz1 --password "${SALAZ_CREAR_USUARIO_PRUEBA}"
fi

echo "Arrancando gunicorn..."
exec gunicorn wger.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${SALAZ_WORKERS:-3}" \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
