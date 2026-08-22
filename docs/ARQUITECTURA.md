# Arquitectura de SalazFitness

## Las tres piezas

```
┌──────────────────────────────────────────────────────────────┐
│  web/            PWA React 19 + TypeScript + Vite + Tailwind │
│                  Navegador, Android, iPhone, Windows          │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP, JSON, Bearer JWT
                            │ (en desarrollo pasa por el proxy de Vite)
┌───────────────────────────▼──────────────────────────────────┐
│  C:\Proyectos\wger        Django 6.0.8 + DRF                  │
│                           SIN MODIFICAR                       │
│                                                               │
│    manager/      rutinas, series, repeticiones, cargas, RIR   │
│    exercises/    872 ejercicios                               │
│    nutrition/    177.302 alimentos de Open Food Facts         │
│    weight/       peso corporal                                │
│    measurements/ medidas                                      │
│    gym/          multiusuario                                 │
│    core/         perfil, IMC, metabolismo basal               │
└───────────────────────────┬──────────────────────────────────┘
                            │ PYTHONPATH
┌───────────────────────────▼──────────────────────────────────┐
│  backend/salaz            Módulo Django de SalazFitness       │
│                                                               │
│    Household, HouseholdMember   hogar y reparto por persona   │
│    IngredientPrice              precio de cada alimento       │
│    Purchase, PurchaseItem       compras y sus líneas          │
│    Recipe, RecipeIngredient     recetas con coste y macros    │
│    ShoppingList(+Item)          lista de la compra            │
└──────────────────────────────────────────────────────────────┘
```

## La decisión que lo sostiene todo

**El repositorio de wger no se toca.** Ni una línea.

El módulo `salaz` se carga por `PYTHONPATH` con un `settings` y un `urls` propios
que viven en `backend/`, fuera del clon de wger. Esto tiene una consecuencia muy
concreta: cuando wger publique la versión 2.7, basta con

```powershell
cd C:\Proyectos\wger
git fetch upstream
git merge upstream/master
uv sync --group dev
.\.venv\Scripts\python.exe manage.py migrate
```

y no hay ni un conflicto que resolver, porque no hay ningún cambio propio encima.

La alternativa habitual (bifurcar wger y meterle el código dentro) obliga a
resolver conflictos en cada actualización y acaba en un fork abandonado a los
seis meses.

## Cómo se arranca cada modo

### Solo wger, sin el módulo de compra

```powershell
cd C:\Proyectos\wger
$env:DJANGO_SETTINGS_MODULE = "settings.local_dev"
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

### Con el módulo de SalazFitness

```powershell
cd C:\Proyectos\wger
$env:PYTHONPATH = "C:\Proyectos\SalazFitness\backend"
$env:DJANGO_SETTINGS_MODULE = "salaz_settings"
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

`salaz_settings.py` hereda de los ajustes de wger, añade `salaz` a
`INSTALLED_APPS` y apunta `ROOT_URLCONF` a `salaz_urls.py`, que incluye las URLs
de wger tal cual y cuelga las propias bajo `/api/v2/salaz/`.

## Autenticación

wger usa **allauth headless** con JWT firmado en RS256. El flujo completo y
verificado está en [`API-CONTRACT.md`](API-CONTRACT.md). Resumen:

1. `POST /allauth/app/v1/auth/login` con usuario y contraseña
2. Devuelve `access_token` (5 minutos) y `refresh_token` (120 días)
3. Las llamadas van con `Authorization: Bearer <access_token>`
4. `POST /allauth/app/v1/tokens/refresh` renueva el par cuando caduca

El cliente de `web/src/lib/api.ts` hace el refresco solo, en cuanto ve un 401 o
un 403, y deduplica las peticiones de refresco concurrentes: si diez llamadas
fallan a la vez, solo se dispara un refresco.

### Claves JWT: el paso que se olvida

Sin claves configuradas, el login devuelve un **500** con
`ValueError: Unable to load PEM file ... MalformedFraming`. Los ajustes de
desarrollo de wger no las traen.

```powershell
cd C:\Proyectos\wger
$env:DJANGO_SETTINGS_MODULE = "settings.local_dev"
.\.venv\Scripts\python.exe manage.py generate-jwt-keys --kid salazfitness
```

El comando escupe dos líneas, `JWT_PRIVATE_KEY=...` y `JWT_PUBLIC_KEY=...`. Van
a `C:\Proyectos\wger\settings\local_dev_extra.py`, que wger importa
automáticamente al final de `local_dev.py` y que está en su `.gitignore`
(línea 49, patrón `settings/*_extra.py`), así que las claves nunca acaban en un
repositorio:

```python
from .settings_global import SIMPLE_JWT, jwk_b64_to_pem

JWT_PRIVATE_KEY = '<la clave privada que imprimió el comando>'
JWT_PUBLIC_KEY = '<la clave pública que imprimió el comando>'

SIMPLE_JWT['SIGNING_KEY'] = jwk_b64_to_pem(JWT_PRIVATE_KEY)
SIMPLE_JWT['VERIFYING_KEY'] = jwk_b64_to_pem(JWT_PUBLIC_KEY)
HEADLESS_JWT_PRIVATE_KEY = SIMPLE_JWT['SIGNING_KEY']

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:5173',
]
```

**La clave privada es un secreto.** No la pegues en un issue, ni en un log, ni
en el repositorio.

## CORS y el proxy de Vite

wger abre CORS solo para la API:

```python
CORS_ORIGIN_ALLOW_ALL = True
CORS_URLS_REGEX = r'^/api/.*$'
```

`/allauth/*` **no** está cubierto por esa expresión, así que una petición de
login desde `localhost:5173` sería bloqueada por el navegador.

Por eso `vite.config.ts` proxea las cuatro rutas del backend (`/api`,
`/allauth`, `/media`, `/static`). Para el navegador todo es el mismo origen y no
hay CORS que valga. En producción se sirve el `dist/` desde el mismo dominio que
el backend y el problema desaparece igualmente.

## El modelo de datos del coste

Esta es la parte que wger no tiene. Verificado buscando en su código: `shopping`,
`recipe`, `price` y `goal_weight` dan cero resultados.

```
Ingredient (de wger)  ──1:N──▶  IngredientPrice
                                  precio, cantidad, unidad, supermercado, fecha

Household  ──1:N──▶  HouseholdMember
                       nombre, consumption_share (%)

Purchase  ──1:N──▶  PurchaseItem
  fecha                 ingrediente o texto libre
  covers_days           cantidad, unidad, precio
                        is_shared, member

Recipe  ──1:N──▶  RecipeIngredient  ──▶  Ingredient (de wger)
  servings                amount (g)

ShoppingList  ──1:N──▶  ShoppingListItem
  start_date, end_date     producto, cantidad, precio estimado, comprado
```

### El cálculo del reparto

No es una división a partes iguales. El algoritmo es:

1. Separar las líneas en **compartidas** (`is_shared = true`) e **individuales**
   (`is_shared = false`, con un `member` asignado).
2. Las individuales se imputan enteras a su persona.
3. Las compartidas se reparten según el `consumption_share` de cada miembro.
4. `coste_por_dia = total / covers_days`
5. `coste_diario_por_persona = coste_persona / covers_days`

Ejemplo con los números que pidió el usuario:

| Concepto | Valor |
|---|---:|
| Compra | 120,00 € |
| Personas | 2 |
| Días que cubre | 14 |
| Coste por persona (50/50) | 60,00 € |
| Coste diario por persona | 4,29 € |

Y con reparto desigual:

| Concepto | Valor |
|---|---:|
| Compra | 100,00 € |
| Persona 1 consume 60% | 60,00 € |
| Persona 2 consume 40% | 40,00 € |

El dinero se guarda en `DecimalField(max_digits=10, decimal_places=2)` y en el
frontend se opera en céntimos con enteros. Nunca en coma flotante: `0.1 + 0.2`
no da `0.3` y en una cuenta de la compra eso se nota.

## Base de datos

SQLite, un solo fichero en `C:\Proyectos\wger\db\database.sqlite`. Unos 146 MB,
la mayor parte son los 177.302 alimentos.

Copia de seguridad en caliente, sin parar el servidor:

```powershell
cd C:\Proyectos\wger
.\.venv\Scripts\python.exe -c "import sqlite3; s=sqlite3.connect('db/database.sqlite'); d=sqlite3.connect('db/backup.sqlite'); s.backup(d); d.close(); s.close()"
```

Para varios usuarios concurrentes de verdad conviene pasar a PostgreSQL:
descomentar `DBCONFIG_PG` en los ajustes, `dumpdata`, `migrate`, `loaddata`.

## Por qué PWA y no app nativa

| | PWA | React Native | Flutter |
|---|---|---|---|
| Un solo código para web, Android e iOS | Sí | No incluye web bien | Parcial |
| Necesita Mac para iOS | No | Sí | Sí |
| Necesita Apple Developer (99 $/año) | No | Sí, para distribuir | Sí |
| Necesita Android Studio | No | Sí | Sí |
| Se instala en la pantalla de inicio | Sí | Sí | Sí |
| Actualizar es desplegar | Sí | Revisión de tienda | Revisión de tienda |

Para un proyecto personal que se comparte con amigos, la PWA gana en todo lo que
importa. Y si algún día hace falta una app de tienda, la app oficial de wger ya
existe para Android e iOS y apunta al mismo servidor.

Lo que la PWA no da: widgets, integración con Apple Health o Health Connect, y
app de Apple Watch. Si eso llega a hacer falta, se añade después sin tirar nada.
