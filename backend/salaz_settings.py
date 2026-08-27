"""
Settings module for the salaz app.

Loaded via PYTHONPATH=C:\\Proyectos\\SalazFitness\\backend and
DJANGO_SETTINGS_MODULE=salaz_settings, while running manage.py from
C:\\Proyectos\\wger (so the 'settings' and 'wger' packages resolve from
there). This never edits anything under C:\\Proyectos\\wger.

Starts from settings_global (same base as settings/local_dev.py) and then
replicates what local_dev.py does, adding the salaz app and swapping the
root urlconf.
"""

# ruff: noqa: F405
# ruff: noqa: F403

# wger
from settings.settings_global import *

DEBUG = True

ADMINS = ['"Your name" <your_email@example.com>']
MANAGERS = ADMINS

SECRET_KEY = 'wger-local-development-supersecret-key-1234567890!'

ALLOWED_HOSTS = ['*']

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

WGER_SETTINGS['ALLOW_UPLOAD_VIDEOS'] = True
WGER_SETTINGS['ALLOW_GUEST_USERS'] = True
WGER_SETTINGS['ALLOW_REGISTRATION'] = True
WGER_SETTINGS['DOWNLOAD_INGREDIENTS_FROM'] = 'WGER'
WGER_SETTINGS['EMAIL_FROM'] = 'wger Workout Manager <wger@example.com>'
WGER_SETTINGS['EXERCISE_CACHE_TTL'] = 500
WGER_SETTINGS['INGREDIENT_CACHE_TTL'] = 500
WGER_SETTINGS['SYNC_EXERCISES_CELERY'] = False
WGER_SETTINGS['SYNC_EXERCISE_IMAGES_CELERY'] = True
WGER_SETTINGS['SYNC_EXERCISE_VIDEOS_CELERY'] = False
WGER_SETTINGS['SYNC_INGREDIENTS_CELERY'] = True
WGER_SETTINGS['USE_CELERY'] = False
WGER_SETTINGS['CACHE_API_EXERCISES_CELERY'] = True
WGER_SETTINGS['CACHE_API_EXERCISES_CELERY_FORCE_UPDATE'] = True
WGER_SETTINGS['ROUTINE_CACHE_TTL'] = 500
DEFAULT_FROM_EMAIL = WGER_SETTINGS['EMAIL_FROM']

CSRF_TRUSTED_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:8001', 'http://127.0.0.1:8001']

EXPOSE_PROMETHEUS_METRICS = True

COMPRESS_ENABLED = False
AXES_ENABLED = False

CACHE_LOCMEM = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'salaz-cache',
        'TIMEOUT': 100,
    }
}

CACHES = CACHE_LOCMEM

DBCONFIG_SQLITE = {
    'ENGINE': 'django_prometheus.db.backends.sqlite3',
    'NAME': BASE_DIR.parent / 'db' / 'database.sqlite',
}

DATABASES = {
    'default': DBCONFIG_SQLITE,
}

# salaz-specific: register the app and point at our own urlconf, which wraps
# wger's own urls.py unchanged.
INSTALLED_APPS = INSTALLED_APPS + ['salaz']
ROOT_URLCONF = 'salaz_urls'

# La app empaquetada (APK de Android, iPhone) NO comparte origen con el
# servidor de desarrollo: pide desde capacitor://, ionic:// o https://localhost,
# no desde localhost:5173 como el navegador. wger ya abre CORS en /api, pero el
# login vive en /allauth, que esa regex no cubre (ver la nota de CORS en
# docs/ARQUITECTURA.md), asi que sin esto el APK no puede ni hacer login contra
# este servidor de desarrollo. Mismos origenes fijos que salaz_settings_prod.py.
CORS_ALLOWED_ORIGINS = list(globals().get('CORS_ALLOWED_ORIGINS', [])) + [
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
]
# Ademas de esos origenes fijos, el emulador de Android y el iPhone del dueno
# no hablan con "localhost": el emulador ve al PC como 10.0.2.2 y el iPhone
# necesita la IP de la red local (192.168.x.x o 10.x.x.x) en el puerto de Vite
# y en el del propio backend. Una IP concreta cambia con el router, asi que se
# permite el rango entero en vez de mantener una IP fija a mano.
# Los tres rangos privados de la RFC 1918, no solo los dos habituales: la red
# de casa del dueno es 172.17.x.x, que cae en el tercero (172.16-31) y se
# quedaba fuera. El emulador de Android ve al PC como 10.0.2.2, cubierto por el
# segundo.
CORS_ALLOWED_ORIGIN_REGEXES = list(globals().get('CORS_ALLOWED_ORIGIN_REGEXES', [])) + [
    r'^http://192\.168\.\d{1,3}\.\d{1,3}:(5173|8000)$',
    r'^http://10\.\d{1,3}\.\d{1,3}\.\d{1,3}:(5173|8000)$',
    r'^http://172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:(5173|8000)$',
]
CORS_ALLOW_CREDENTIALS = True

# Import other local settings that are not in version control (JWT keys,
# required for login: without them /allauth/app/v1/auth/login returns a 500).
try:
    from settings.local_dev_extra import *
except ImportError:
    pass
