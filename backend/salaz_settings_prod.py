"""
Ajustes de produccion: MySQL, sin DEBUG y con envio de correo de verdad.

Por que MySQL y no MongoDB, que era la otra opcion sobre la mesa: SalazFitness
no es una base de datos nueva, es un modulo encima de wger, y wger esta escrito
sobre el ORM de Django. Django no habla MongoDB: sus ForeignKey, sus
migraciones y su capa de consultas son de SQL. Cambiar a Mongo no seria
configurar otro motor, seria reescribir wger entero, con sus 872 ejercicios y
sus 177.302 alimentos. Ademas los datos de esta app son justo lo que un
relacional hace bien: una compra tiene lineas, cada linea apunta a un alimento,
cada alimento tiene precios en varios supermercados. Eso son joins, no
documentos.

Todo lo sensible entra por variables de entorno, nunca por el repositorio.
Las minimas para arrancar:

    SALAZ_SECRET_KEY      clave de Django (obligatoria)
    SALAZ_ALLOWED_HOSTS   dominios separados por comas
    SALAZ_APP_URL         donde vive la app, para los enlaces del correo
    SALAZ_DB_*            conexion a MySQL
    SALAZ_EMAIL_*         servidor SMTP

Ver deploy/.env.example y docs/DESPLIEGUE.md.
"""

# ruff: noqa: F405
# ruff: noqa: F403

import os

# wger
from settings.settings_global import *


def _env(clave: str, por_defecto: str = '') -> str:
    return os.environ.get(clave, por_defecto).strip()


def _lista(clave: str) -> list[str]:
    return [x.strip() for x in _env(clave).split(',') if x.strip()]


def _bool(clave: str, por_defecto: bool) -> bool:
    valor = _env(clave)
    return valor.lower() in ('1', 'true', 'yes', 'si', 'on') if valor else por_defecto


DEBUG = False

# Sin clave no se arranca. Poner un valor por defecto aqui seria dejar la
# instalacion con una clave publica escrita en un repositorio.
SECRET_KEY = _env('SALAZ_SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError('Falta SALAZ_SECRET_KEY. Ver docs/DESPLIEGUE.md.')

ALLOWED_HOSTS = _lista('SALAZ_ALLOWED_HOSTS') or ['localhost', '127.0.0.1']

# Donde vive la app. Es lo que se pone en el enlace del correo de verificacion
# (ver salaz/api/cuentas.py) y tiene que ser la direccion que abre el usuario,
# no la interna del contenedor.
SALAZ_APP_URL = _env('SALAZ_APP_URL', f'https://{ALLOWED_HOSTS[0]}')

# --------------------------------------------------------------- base de datos

DATABASES = {
    'default': {
        'ENGINE': 'django_prometheus.db.backends.mysql',
        'NAME': _env('SALAZ_DB_NAME', 'salazfitness'),
        'USER': _env('SALAZ_DB_USER', 'salaz'),
        'PASSWORD': _env('SALAZ_DB_PASSWORD'),
        'HOST': _env('SALAZ_DB_HOST', '127.0.0.1'),
        'PORT': _env('SALAZ_DB_PORT', '3306'),
        'OPTIONS': {
            # utf8mb4 o los nombres con tilde y los emoji se guardan mal.
            'charset': 'utf8mb4',
            # STRICT_TRANS_TABLES convierte en error lo que MySQL trunca en
            # silencio por defecto (un texto mas largo que su columna). Es lo
            # que recomienda la propia documentacion de Django.
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        },
        'CONN_MAX_AGE': 60,
    },
}

# ------------------------------------------------------------------- correo

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = _env('SALAZ_EMAIL_HOST')
EMAIL_PORT = int(_env('SALAZ_EMAIL_PORT', '587'))
EMAIL_HOST_USER = _env('SALAZ_EMAIL_USER')
EMAIL_HOST_PASSWORD = _env('SALAZ_EMAIL_PASSWORD')
EMAIL_USE_TLS = _bool('SALAZ_EMAIL_TLS', True)
EMAIL_USE_SSL = _bool('SALAZ_EMAIL_SSL', False)
DEFAULT_FROM_EMAIL = _env('SALAZ_EMAIL_FROM', 'SalazFitness <no-reply@localhost>')
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Sin SMTP configurado no se puede verificar a nadie, y una cuenta que no se
# puede verificar es una cuenta que no puede entrar. Mejor fallar al arrancar
# que descubrirlo con el primer registro.
if not EMAIL_HOST:
    raise RuntimeError('Falta SALAZ_EMAIL_HOST: sin correo no hay verificacion de cuentas.')

# ------------------------------------------------------------------- wger

WGER_SETTINGS['ALLOW_GUEST_USERS'] = False
# El alta pasa por /api/v2/salaz/account/register/, que exige confirmar el
# correo. La pagina de registro propia de wger no lo exige, asi que se cierra.
WGER_SETTINGS['ALLOW_REGISTRATION'] = False
WGER_SETTINGS['ALLOW_UPLOAD_VIDEOS'] = True
WGER_SETTINGS['USE_CELERY'] = False
WGER_SETTINGS['EMAIL_FROM'] = DEFAULT_FROM_EMAIL

# --------------------------------------------------------------- seguridad

CSRF_TRUSTED_ORIGINS = _lista('SALAZ_CSRF_ORIGINS') or [f'https://{h}' for h in ALLOWED_HOSTS]

# El TLS lo termina nginx, asi que Django ve http y hay que decirle que mire la
# cabecera que le pone el proxy. Sin esto, las redirecciones salen en http.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = _bool('SALAZ_FORCE_HTTPS', True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
X_FRAME_OPTIONS = 'DENY'

# Bloqueo por intentos fallidos de login. En desarrollo estorba; aqui no.
AXES_ENABLED = True

# ------------------------------------------------------------- ficheros

STATIC_ROOT = _env('SALAZ_STATIC_ROOT', '/srv/salaz/static')
MEDIA_ROOT = _env('SALAZ_MEDIA_ROOT', '/srv/salaz/media')

# ---------------------------------------------------------------- cache

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'salaz-cache',
        'TIMEOUT': 300,
    }
}

# --------------------------------------------------------------- el modulo

INSTALLED_APPS = INSTALLED_APPS + ['salaz']
ROOT_URLCONF = 'salaz_urls'

# La app empaquetada (APK, iPhone) NO comparte origen con el servidor: pide
# desde capacitor:// o https://localhost. wger ya abre CORS en /api, pero el
# login vive en /allauth, asi que hay que declarar esos origenes.
CORS_ALLOWED_ORIGINS = list(globals().get('CORS_ALLOWED_ORIGINS', [])) + [
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
] + _lista('SALAZ_CORS_ORIGINS')
CORS_ALLOW_CREDENTIALS = True

# Claves JWT y cualquier otro ajuste local que no va en el repositorio.
try:
    from settings.local_prod_extra import *
except ImportError:
    pass
