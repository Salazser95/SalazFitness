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

# Import other local settings that are not in version control (JWT keys,
# required for login: without them /allauth/app/v1/auth/login returns a 500).
try:
    from settings.local_dev_extra import *
except ImportError:
    pass
