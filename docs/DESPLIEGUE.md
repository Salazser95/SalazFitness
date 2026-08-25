# Despliegue: base de datos, servidor y apps

Hasta ahora SalazFitness solo funcionaba con el PC encendido y `npm run dev`
abierto. Esto explica cómo dejarlo en un servidor de verdad, con MySQL, y cómo
sacar el APK de Android y la app de iPhone.

---

## Por qué MySQL y no MongoDB

Era la duda de partida, y la respuesta no es de gustos: **MySQL**, sin discusión.

SalazFitness no es una base de datos nueva. Es un módulo encima de
[wger](https://github.com/wger-project/wger), y wger está escrito sobre el ORM
de Django. Django no habla MongoDB: sus `ForeignKey`, sus migraciones y su capa
de consultas son SQL de arriba abajo. Cambiar a Mongo no sería configurar otro
motor, sería **reescribir wger entero** — los 872 ejercicios, los 177.302
alimentos y toda la API que ya funciona.

Y aunque se pudiera, tampoco convendría. Los datos de esta app son exactamente
lo que un relacional hace bien:

| Lo que hay | Por qué encaja en SQL |
|---|---|
| Una compra tiene líneas, cada línea apunta a un alimento | Claves ajenas, integridad garantizada por la base de datos |
| Un alimento tiene precios en varios supermercados y varias fechas | Una tabla de precios, con índice por alimento y fecha |
| El coste por persona sale de cruzar compras, líneas y miembros del hogar | Joins, que es la operación para la que existe SQL |
| Las macros del día suman entradas del diario por fecha | Agregación con `SUM` y `GROUP BY` |

En Mongo todo eso serían documentos duplicados y agregaciones a mano, más
lentas y más fáciles de dejar incoherentes.

**SQLite sirve para el portátil; MySQL para el servidor.** SQLite bloquea el
fichero entero al escribir, así que con dos personas usando la app a la vez
empiezan los `database is locked`. MySQL aguanta escrituras concurrentes,
copias de seguridad en caliente y conexiones desde varias máquinas.

---

## Montar el servidor

Todo está en `deploy/`. Hacen falta Docker y Docker Compose; nada más.

### 1. Configurar

```bash
cd deploy
cp .env.example .env
```

Y rellenar `deploy/.env`. Los cuatro imprescindibles:

| Variable | Qué es |
|---|---|
| `SALAZ_SECRET_KEY` | Clave de Django. Genérala con `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `SALAZ_ALLOWED_HOSTS` | Tu dominio, o la IP desde la que vas a entrar |
| `SALAZ_APP_URL` | La dirección pública de la app: es la que va en el enlace del correo de confirmación |
| `SALAZ_EMAIL_*` | Servidor SMTP. **Sin esto el backend no arranca**, porque sin correo no se puede verificar ninguna cuenta |

`deploy/.env` está en el `.gitignore`: las contraseñas no van al repositorio.

Con Gmail hay que crear una **contraseña de aplicación** en la cuenta de Google
y usar esa, no la del correo.

### 2. Compilar la PWA

nginx sirve la web ya compilada:

```bash
cd web
npm ci
npm run build
```

### 3. Arrancar

```bash
cd deploy
docker compose --env-file .env up -d --build
```

La primera vez tarda: clona wger, instala sus dependencias, espera a MySQL,
aplica todas las migraciones y recopila los estáticos. Se puede seguir con
`docker compose logs -f api`.

Después de eso, la app está en `http://<tu-servidor>/` y la API en
`http://<tu-servidor>/api/v2/`.

### 4. HTTPS

El `nginx.conf` se queda en el puerto 80 a propósito, porque cada uno resuelve
el certificado a su manera. Lo más cómodo es poner
[Caddy](https://caddyserver.com/) delante, que saca el certificado de Let's
Encrypt solo. Mientras no haya certificado, pon `SALAZ_FORCE_HTTPS=0` o Django
redirigirá a `https://` y no responderá nadie.

Con HTTPS puesto, vuelve a poner `SALAZ_FORCE_HTTPS=1`.

### 5. Cargar los catálogos de wger

Los ejercicios y los alimentos no vienen con la imagen; se descargan una vez:

```bash
docker compose exec api python manage.py sync-exercises
docker compose exec api python manage.py download-exercise-images
```

---

## Cuentas

### `salaz1`, la de prueba

Verificada de entrada, sin pasar por el correo, como se pidió:

```bash
docker compose exec api python manage.py crear_usuario salaz1 --password 123456
```

O automáticamente al arrancar, poniendo `SALAZ_CREAR_USUARIO_PRUEBA=123456` en
`deploy/.env`.

`123456` no pasaría los validadores de contraseña de Django, y por eso hace
falta esta orden: el alta normal desde la app sí los aplica. **Es una cuenta de
prueba: no la dejes en un servidor abierto a internet.**

### El resto: confirmación por correo

Cualquier otra cuenta se crea desde la propia app (*Crear una cuenta* en la
pantalla de entrada) y **no puede entrar hasta confirmar el correo**. El
proceso:

1. La app llama a `POST /api/v2/salaz/account/register/`.
2. Se crea el usuario con `is_active = False` y se le manda un enlace.
3. El enlace abre `/verificar?token=...` en la app, que llama a
   `POST /api/v2/salaz/account/verify/`.
4. La cuenta se activa y ya se puede entrar.

Hasta el paso 4 el login de wger la rechaza, sin haber tocado nada de wger.

Esto es lo que impide que alguien abra cuentas en bucle contra un servidor
doméstico. Además hay límites por IP, declarados en
`backend/salaz/api/cuentas.py` para que viajen con el módulo:

| Endpoint | Límite |
|---|---|
| `register/` | 5 por hora y por IP |
| `resend/` | 5 por hora y por IP, y como mucho 5 correos por cuenta, uno cada 5 minutos |
| `verify/` | 20 por hora y por IP |

El enlace del correo vale 48 horas.

**Un detalle que importa:** DRF lleva la cuenta de esos límites en la caché de
Django, y por eso `salaz_settings_prod.py` usa la caché en base de datos y no
la de memoria. Con la de memoria, cada worker de gunicorn contaría por su
cuenta —el límite real sería el triple— y se reiniciaría en cada despliegue. La
tabla la crea `manage.py createcachetable`, que ya lanza `deploy/arrancar.sh`.

---

### Comprobar que todo esto funciona

El módulo trae sus propias pruebas, que cubren el reparto en tandas, la
cobertura hacia Nutrición y el alta con confirmación:

```powershell
cd C:\Proyectos\wger
$env:DJANGO_SETTINGS_MODULE = "salaz_settings"
.\.venv\Scripts\python.exe manage.py test salaz
```

En el servidor: `docker compose exec api python manage.py test salaz`.

---

## Traer los datos del SQLite de casa

Si ya hay datos en el SQLite del PC:

```powershell
# En el PC, con los ajustes de siempre
cd C:\Proyectos\wger
$env:DJANGO_SETTINGS_MODULE = "salaz_settings"
.\.venv\Scripts\python.exe manage.py dumpdata `
    --natural-foreign --natural-primary `
    --exclude contenttypes --exclude auth.permission --exclude sessions `
    --indent 2 > datos.json
```

`contenttypes` y `auth.permission` se excluyen porque los regenera Django solo
al migrar, y si se importan chocan con los que ya existen.

Luego, en el servidor:

```bash
docker compose cp datos.json api:/tmp/datos.json
docker compose exec api python manage.py loaddata /tmp/datos.json
```

---

## Copias de seguridad

Todo vive en el volumen `datos-mysql`. Una copia es un `mysqldump`:

```bash
docker compose exec db sh -c \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction salazfitness' \
  > copia-$(date +%F).sql
```

`--single-transaction` la hace sin bloquear la base de datos, así que se puede
lanzar con la app funcionando. Las fotos van aparte, en el volumen `subidas`.

---

## Las apps del móvil

### Android: el APK

La forma cómoda, **sin instalar nada**: en GitHub, pestaña *Actions* → *APK de
Android* → *Run workflow*, y se escribe la URL del servidor. Al terminar, el
APK se descarga desde la propia ejecución, en *Artifacts*.

Para instalarlo hay que permitir "instalar aplicaciones de origen desconocido"
en el móvil. Es un APK firmado de depuración, suficiente para uso propio; para
la Play Store haría falta firmarlo con una clave de subida.

En local, si prefieres compilarlo tú (hace falta JDK 21 y el SDK de Android):

```bash
cd web
VITE_API_BASE=https://salazfitness.tudominio.com npm run build
npx cap add android      # solo la primera vez
npm run app:android
cd android && ./gradlew assembleDebug
```

El APK queda en `web/android/app/build/outputs/apk/debug/`.

### iPhone

Aquí hay que ser claro: **Apple no deja instalar una app en un iPhone sin un
Mac con Xcode**. No es una limitación de este proyecto, es de Apple. Hay dos
caminos:

**Opción A — la PWA (lo que ya funciona, y no cuesta nada).** Abrir la app en
Safari, *Compartir* → *Añadir a pantalla de inicio*. Queda un icono en la
pantalla, se abre a pantalla completa sin barra del navegador y se comporta
como una app. No hace falta Mac, ni Xcode, ni cuenta de desarrollador.

**Opción B — app nativa.** Con un Mac:

```bash
cd web
VITE_API_BASE=https://salazfitness.tudominio.com npm run build
npx cap add ios          # solo la primera vez
npm run app:ios
npm run app:abrir:ios    # abre Xcode
```

Con una cuenta de Apple gratuita se puede instalar en tu propio iPhone, pero
**caduca a los 7 días** y hay que reinstalarla. Para que no caduque hace falta
el Apple Developer Program (99 $/año), y para publicarla en la App Store,
además, pasar la revisión.

Para uso personal, la opción A es la sensata.

### El servidor en la app instalada

La app instalada no se sirve desde el servidor, así que necesita saber dónde
está. Se resuelve en dos capas (`web/src/lib/config.ts`):

1. `VITE_API_BASE` al compilar: el servidor con el que sale la app.
2. *Yo → Ajustes → Servidor* dentro de la app: lo cambia y se guarda en el
   móvil.

En el navegador se puede dejar en blanco: usa el mismo sitio del que se cargó.
