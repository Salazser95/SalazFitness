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
# Django ya entiende un valor que empieza por punto como comodin de
# subdominio (".trycloudflare.com" acepta cualquier-cosa.trycloudflare.com),
# no hace falta tocar nada aqui para que funcione: es lo que permite usar el
# modo rapido del tunel de Cloudflare, cuya URL cambia cada vez que se
# reinicia, sin tener que editar SALAZ_ALLOWED_HOSTS en cada prueba. Aceptalo
# solo mientras pruebas: deja pasar cualquier tunel rapido, no solo el tuyo.
# Ver deploy/.env.example y docs/ACCESO-REMOTO.md.

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

# Valvula de escape para probar en local (ver docs/ACCESO-REMOTO.md): con
# SALAZ_EMAIL_CONSOLA=1 los correos no se envian, se imprimen en los logs del
# contenedor. Sirve para levantar la app sin tener credenciales SMTP a mano y
# entrar con el usuario de prueba (SALAZ_CREAR_USUARIO_PRUEBA), que no pasa
# por la verificacion.
#
# Es SOLO para pruebas: con esto, cualquiera que se registre no recibira su
# correo de confirmacion y no podra entrar. Para uso de verdad, SMTP.
EMAIL_CONSOLA = _bool('SALAZ_EMAIL_CONSOLA', False)
if EMAIL_CONSOLA:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Sin SMTP configurado no se puede verificar a nadie, y una cuenta que no se
# puede verificar es una cuenta que no puede entrar. Mejor fallar al arrancar
# que descubrirlo con el primer registro.
if not EMAIL_HOST and not EMAIL_CONSOLA:
    raise RuntimeError(
        'Falta SALAZ_EMAIL_HOST: sin correo no hay verificacion de cuentas. '
        'Para una prueba local sin SMTP, pon SALAZ_EMAIL_CONSOLA=1.'
    )

# ------------------------------------------------------------------- wger

WGER_SETTINGS['ALLOW_GUEST_USERS'] = False
# El alta pasa por /api/v2/salaz/account/register/, que exige confirmar el
# correo. La pagina de registro propia de wger no lo exige, asi que se cierra.
WGER_SETTINGS['ALLOW_REGISTRATION'] = False
WGER_SETTINGS['ALLOW_UPLOAD_VIDEOS'] = True
WGER_SETTINGS['USE_CELERY'] = False
WGER_SETTINGS['EMAIL_FROM'] = DEFAULT_FROM_EMAIL

# --------------------------------------------------------------------- JWT
#
# La app (web/src/lib/api.ts) entra por la API "headless" de allauth, que
# firma sus tokens en RS256 con una clave RSA propia -- no con SALAZ_SECRET_KEY.
# wger trae el mecanismo (settings_global.jwk_b64_to_pem, mas el comando
# `manage.py generate-jwt-keys`) pero solo lo conecta en settings/main.py, que
# aqui no se usa (se parte de settings_global directamente, ver cabecera del
# fichero). Sin esto conectado, SIMPLE_JWT['SIGNING_KEY'] y
# HEADLESS_JWT_PRIVATE_KEY quedan sin valor y el login de la app falla siempre
# con un 500 al intentar firmar el token -- con el usuario y la contrasena
# perfectamente correctos. Es justo lo que paso la primera vez: la app
# ensenaba "usuario o contrasena incorrectos" porque el frontend usa ese texto
# de repuesto para cualquier fallo, cuando el fallo real era este.
#
# Con JWT_PRIVATE_KEY/JWT_PUBLIC_KEY sin poner, se genera aqui una pareja RSA
# nueva. Esto es solo un ultimo recurso para cuando algo importa este modulo
# de ajustes sin pasar por deploy/arrancar.sh (por ejemplo, un `manage.py`
# suelto): en el arranque normal del contenedor, arrancar.sh YA genera y
# exporta estas dos variables antes de lanzar gunicorn, precisamente para que
# los tres workers compartan la MISMA clave -- si cada worker generase la
# suya (como pasaba antes de ese paso en arrancar.sh, porque cada uno importa
# este fichero por su cuenta, sin --preload), el login parecia funcionar un
# instante y fallaba en la siguiente peticion si caia en otro worker, con la
# sesion firmada por una clave que ese worker no reconocia.
#
# Para que las sesiones sobrevivan tambien a un reinicio del CONTENEDOR (y no
# solo entre sus workers) hace falta una pareja fija de verdad, puesta en
# deploy/.env. Se genera una vez con:
#     docker compose exec api python manage.py generate-jwt-keys
# y se copian las dos lineas que imprime (JWT_PRIVATE_KEY=... y
# JWT_PUBLIC_KEY=...) tal cual a deploy/.env.
_jwt_privada_b64 = _env('JWT_PRIVATE_KEY')
_jwt_publica_b64 = _env('JWT_PUBLIC_KEY')

if _jwt_privada_b64 and _jwt_publica_b64:
    JWT_PRIVATE_KEY = jwk_b64_to_pem(_jwt_privada_b64)
    JWT_PUBLIC_KEY = jwk_b64_to_pem(_jwt_publica_b64)
else:
    print(
        'AVISO: JWT_PRIVATE_KEY/JWT_PUBLIC_KEY no estan puestas. Se genera una '
        'clave RSA nueva para esta ejecucion: las sesiones no sobreviven a un '
        'reinicio del contenedor. Ver el comentario de JWT en salaz_settings_prod.py.'
    )
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa as _rsa

    _clave_efimera = _rsa.generate_private_key(public_exponent=65537, key_size=2048)
    JWT_PRIVATE_KEY = _clave_efimera.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    JWT_PUBLIC_KEY = _clave_efimera.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

SIMPLE_JWT['SIGNING_KEY'] = JWT_PRIVATE_KEY
SIMPLE_JWT['VERIFYING_KEY'] = JWT_PUBLIC_KEY
HEADLESS_JWT_PRIVATE_KEY = JWT_PRIVATE_KEY

# --------------------------------------------------------------- seguridad

CSRF_TRUSTED_ORIGINS = _lista('SALAZ_CSRF_ORIGINS') or [f'https://{h}' for h in ALLOWED_HOSTS]

# El TLS no lo termina Django: lo termina Cloudflare (con el tunel) o Caddy
# (con un dominio propio), y nginx en medio habla http de puertas para
# adentro. Por eso Django tiene que fiarse de la cabecera que le manda el
# proxy en vez de mirar la conexion en la que llego. Sin esto, las
# redirecciones a https saldrian siempre en http.
#
# El que esa cabecera diga la verdad depende de deploy/nginx.conf: ahi es
# donde se respeta el X-Forwarded-Proto que ya trae la peticion en vez de
# pisarlo con el "http" fijo con el que nginx ve su propia conexion (ver el
# comentario grande al principio de ese fichero). Con eso en su sitio, no hay
# riesgo de bucle de redirecciones al usar el tunel: la peticion le llega a
# nginx por http interno, pero el X-Forwarded-Proto que reenvia a Django ya
# dice "https", asi que SECURE_SSL_REDIRECT no vuelve a redirigir algo que ya
# iba por https.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = _bool('SALAZ_FORCE_HTTPS', True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
X_FRAME_OPTIONS = 'DENY'

# Bloqueo por intentos fallidos de login. En desarrollo estorba; aqui no.
AXES_ENABLED = True

# Sin esto, un error de servidor (500) no deja rastro: el LOGGING por defecto
# de Django solo imprime a consola con DEBUG=True, y aqui DEBUG es siempre
# False. Sin ADMINS configurado tampoco llega por correo. Resultado: un fallo
# real no aparece en ningun sitio ("docker compose logs api" solo enseña la
# linea de acceso con el 500, sin el traceback) -- nos paso de verdad
# depurando el export/import de datos. Esto manda cualquier error de una
# vista (django.request, nivel ERROR o peor) a la consola del contenedor.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
        'salaz': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
    },
}

# ------------------------------------------------------------- ficheros

STATIC_ROOT = _env('SALAZ_STATIC_ROOT', '/srv/salaz/static')
MEDIA_ROOT = _env('SALAZ_MEDIA_ROOT', '/srv/salaz/media')

# ---------------------------------------------------------------- cache

# La cache TIENE que ser compartida entre procesos, no de memoria local. El
# limite de altas por IP (salaz/api/cuentas.py) lo lleva DRF apoyandose en
# ella: con LocMemCache y tres workers de gunicorn, cada worker cuenta por su
# cuenta y el limite real seria el triple, ademas de reiniciarse en cada
# despliegue. Justo lo que se queria evitar.
#
# Se usa la propia base de datos en vez de anadir un Redis: el volumen de esta
# app no lo justifica, y una pieza menos es una pieza menos que se cae. La
# tabla la crea `manage.py createcachetable` al arrancar (ver deploy/arrancar.sh).
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'salaz_cache',
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
