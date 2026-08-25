# SalazFitness

Aplicación de entrenamiento, nutrición y **coste de la compra** en un solo sitio.
Web, Android e iPhone, con servidor propio y sin que tus datos salgan de tu red.

No está escrita desde cero. Reutiliza el backend de
[wger](https://github.com/wger-project/wger), que aporta 872 ejercicios, 177.302
alimentos de Open Food Facts, autenticación multiusuario y una API REST madura, y
le pone encima una interfaz nueva y un módulo que wger no tiene: precios, compras
y reparto de coste por persona.

## Qué hay dentro

```
SalazFitness/
├── web/               PWA en React 19 + TypeScript + Vite + Tailwind v4
├── backend/           Módulo Django que añade compra, coste, recetas y hogar
├── deploy/            MySQL, gunicorn y nginx en contenedores
├── scripts/           Instalación y generador de rutinas (PowerShell)
└── docs/              Contrato de la API, sistema de diseño y arquitectura
```

El backend de wger vive aparte, en su propio clon, y **no se modifica**. El módulo
`backend/salaz` se engancha por `PYTHONPATH`, así que las actualizaciones de wger
se pueden traer sin conflictos.

## Por qué esta arquitectura

| Decisión | Motivo |
|---|---|
| Reutilizar wger en vez de partir de cero | Las 177.302 fichas de alimentos y los 872 ejercicios son años de trabajo. Rehacerlos no aporta nada |
| MySQL en el servidor (SQLite solo en el portátil) | wger está escrito sobre el ORM de Django, que no habla MongoDB. Y los datos son relacionales: una compra tiene líneas, cada línea un alimento, cada alimento precios. Ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) |
| Frontend nuevo en vez de tocar el de wger | Es donde está el valor: una interfaz pensada para el gimnasio, no un panel de administración |
| PWA en vez de app nativa | Un solo código para web, Android e iPhone. Sin tiendas, sin Xcode, sin Mac, sin cuenta de Apple Developer |
| Módulo Django aparte | El fork de wger queda intacto y `git merge upstream/master` sigue funcionando |

## Plataformas

| Dónde | Cómo | Requisitos |
|---|---|---|
| Navegador | `http://localhost:5173` | Ninguno |
| Android (PWA) | Abrir la URL en Chrome y "Añadir a pantalla de inicio" | Ninguno |
| Android (APK) | GitHub → Actions → "APK de Android" → *Run workflow* | Ninguno: lo compila GitHub |
| iPhone | Abrir la URL en Safari y "Añadir a pantalla de inicio" | Ninguno. **Sin Apple Developer** |
| iPhone (app nativa) | `npx cap add ios` y Xcode | Un Mac. Sin cuenta de pago, la app caduca a los 7 días |
| Windows | Instalar la PWA desde Edge o Chrome | Ninguno |
| Alternativa móvil | App oficial de wger apuntando al mismo servidor | Play Store, F-Droid o App Store |

La PWA declara `display: standalone`, así que una vez instalada se abre a pantalla
completa, sin barra del navegador, igual que una app nativa.

## Puesta en marcha

Requisitos: Git, Node.js, [uv](https://docs.astral.sh/uv/) y `sass`.
No hace falta Python del sistema, ni Docker, ni WSL2, ni Java, ni Android Studio,
ni Flutter.

```powershell
# 1. Backend de wger (una sola vez)
git clone https://github.com/wger-project/wger.git C:\Proyectos\wger
cd C:\Proyectos\wger
uv sync --group dev
npm ci
npm run build:css:sass
mkdir db
$env:DJANGO_SETTINGS_MODULE = "settings.local_dev"
.\.venv\Scripts\wger.exe bootstrap
.\.venv\Scripts\wger.exe load-online-fixtures
```

Después hay que generar las claves JWT, o el login de la API devuelve un 500:

```powershell
.\.venv\Scripts\python.exe manage.py generate-jwt-keys --kid salazfitness
```

Y volcar el resultado en `settings/local_dev_extra.py` (ese fichero está en el
`.gitignore` de wger, así que las claves nunca acaban en un repositorio). El
formato exacto está en `docs/ARQUITECTURA.md`.

```powershell
# 2. Frontend
cd C:\Proyectos\SalazFitness\web
npm install
```

## Arrancar

Dos procesos, en dos terminales:

```powershell
# Backend
cd C:\Proyectos\wger
$env:DJANGO_SETTINGS_MODULE = "settings.local_dev"
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

```powershell
# Frontend
cd C:\Proyectos\SalazFitness\web
npm run dev
```

| | |
|---|---|
| App | http://localhost:5173 |
| Desde el móvil | `http://<IP-del-PC>:5173` |
| API de wger | http://localhost:8000/api/v2/ |
| Usuario por defecto | `admin` / `adminadmin` |

**Cambia la contraseña antes de exponer nada a la red.**

Para llegar desde el móvil hay que abrir el puerto una vez, con PowerShell como
administrador:

```powershell
New-NetFirewallRule -DisplayName "SalazFitness" -Direction Inbound -Protocol TCP -LocalPort 5173,8000 -Action Allow -Profile Private
```

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md) | Todos los endpoints, verificados uno a uno contra el servidor real |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | Colores, tipografía, movimiento, componentes y accesibilidad |
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Cómo encajan las piezas y cómo se actualiza wger sin romper nada |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Servidor con MySQL, cuentas con confirmación por correo, APK de Android y app de iPhone |

## Puesta en marcha en un servidor

Para no depender del PC encendido, hay un despliegue completo en `deploy/`:
MySQL, gunicorn y nginx en contenedores, con alta de usuarios por correo
confirmado. Está explicado paso a paso en
[`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

```bash
cd web && npm ci && npm run build
cd ../deploy && cp .env.example .env   # y rellenarlo
docker compose --env-file .env up -d --build
```

## Privacidad

Los datos de entrenamiento, peso, comidas y compras se quedan en la base de
datos de tu servidor. No hay telemetría, ni analítica, ni cuentas de terceros, ni IA. Las
únicas peticiones que salen son a `wger.de` y Open Food Facts para **descargar**
catálogos de ejercicios y alimentos.

## Licencia

**AGPL-3.0-or-later.** El módulo de backend importa modelos de wger, así que es
obra derivada y hereda su licencia. Ver [`NOTICE`](NOTICE) para las atribuciones
completas y para lo que implica compartir una instancia con otras personas.
