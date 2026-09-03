# Contrato de la API de wger — verificado el 2026-08-22

Todo lo de este documento se ha probado contra el servidor real en
`http://127.0.0.1:8000`. No hay nada supuesto.

## Autenticación

wger usa **allauth headless** con JWT RS256. Requiere que las claves JWT estén
configuradas (`settings/local_dev_extra.py`), si no el login devuelve 500
`MalformedFraming`.

### 1. Login

```http
POST /allauth/app/v1/auth/login
Content-Type: application/json

{"username": "admin", "password": "adminadmin"}
```

Respuesta 200:

```jsonc
{
  "status": 200,
  "data": { "user": { "id": 1, "username": "admin", "display": "admin" } },
  "meta": {
    "is_authenticated": true,
    "session_token": "<32 chars>",
    "access_token":  "<JWT, vive 5 minutos>",
    "refresh_token": "<JWT, vive 120 dias>"
  }
}
```

### 2. Refrescar el access token

```http
POST /allauth/app/v1/tokens/refresh
Content-Type: application/json

{"refresh_token": "<refresh_token>"}
```

Respuesta 200. **Ojo: los tokens vienen en `data`, no en `meta`.**

```jsonc
{ "status": 200, "data": { "access_token": "...", "refresh_token": "..." } }
```

El refresh token **rota** en cada uso: hay que guardar el nuevo.

### 3. Llamadas a la API

```http
Authorization: Bearer <access_token>
```

CORS ya está abierto para `/api/*` (`CORS_ORIGIN_ALLOW_ALL = True`,
`CORS_URLS_REGEX = r'^/api/.*$'`), así que el frontend puede vivir en otro puerto.

**Aviso:** `/allauth/*` NO está cubierto por esa regex de CORS. En desarrollo se
resuelve con el proxy de Vite (ver `vite.config.ts`).

## Entrenamiento

### Jerarquía de datos

```
Routine  ->  Day  ->  Slot  ->  SlotEntry  ->  configs
```

Un `Slot` agrupa ejercicios (varios = superserie). Un `SlotEntry` es un ejercicio.
Los parámetros van en tablas separadas, una fila por iteración (semana).

### Crear una rutina completa

```jsonc
// 1. POST /api/v2/routine/
{"name": "...", "start": "2026-08-24", "end": "2026-11-24", "fit_in_week": true}

// 2. POST /api/v2/day/
{"routine": <id>, "name": "Pecho", "type": "custom", "is_rest": false, "order": 1}
// type: "custom" | "enom" | "amrap" | "hiit" | "tabata" | "edt" | "rft" | "afap"
// Para un dia de descanso: {"is_rest": true, "name": "Descanso"}

// 3. POST /api/v2/slot/
{"day": <id>, "order": 1}

// 4. POST /api/v2/slot-entry/
{"slot": <id>, "exercise": 73, "order": 1, "type": "normal"}

// 5. Configuraciones (una llamada por parametro)
POST /api/v2/sets-config/         {"slot_entry": <id>, "iteration": 1, "value": 4}
POST /api/v2/repetitions-config/  {"slot_entry": <id>, "iteration": 1, "value": 8}
POST /api/v2/weight-config/       {"slot_entry": <id>, "iteration": 1, "value": 80}
POST /api/v2/rest-config/         {"slot_entry": <id>, "iteration": 1, "value": 120}
POST /api/v2/rir-config/          {"slot_entry": <id>, "iteration": 1, "value": 2}
```

### Leer "que toca entrenar"

`GET /api/v2/routine/{id}/date-sequence-gym/` devuelve un array de días:

```jsonc
{
  "iteration": 1,
  "date": "2026-08-24",
  "label": null,
  "day": { "id": 2, "name": "Pecho", "is_rest": false, ... },
  "slots": [
    {
      "comment": "",
      "is_superset": false,
      "exercises": [73],
      "sets": [                          // YA VIENE EXPANDIDO: 4 series = 4 objetos
        {
          "slot_entry_id": 2,
          "exercise": 73,
          "sets": 1,
          "weight": "80", "weight_unit": 1,
          "repetitions": "8", "repetitions_unit": 1,
          "rir": "2", "rpe": "8",
          "rest": "120",
          "type": "normal",
          "text_repr": "8 x 80 kg @ 2 RiR 120s rest"
        }
      ]
    }
  ]
}
```

Los días de descanso vienen con `day: null` y `slots: []`.

Otros endpoints útiles de rutina:

- `GET /api/v2/routine/{id}/structure/` — estructura completa (días y slots)
- `GET /api/v2/routine/{id}/logs/` — registros
- `GET /api/v2/routine/{id}/stats/` — estadísticas agregadas
- `GET /api/v2/routine/{id}/date-sequence-display/` — versión para mostrar

### Registrar el entrenamiento

```jsonc
POST /api/v2/workoutsession/   // sesión del día
POST /api/v2/workoutlog/       // una fila por serie realmente hecha
```

## Ejercicios

- `GET /api/v2/exercise/` — 872 ejercicios. Campos: `id`, `uuid`, `category`,
  `muscles`, `muscles_secondary`, `equipment`, `variation_group`
- `GET /api/v2/exerciseinfo/{id}/` — ejercicio con traducciones e imágenes
- `GET /api/v2/exercise-translation/?name=Bench%20Press` — buscar por nombre (exacto)
- `GET /api/v2/exercisecategory/` — categorías

**NO existe** `/api/v2/exercise/search/`.

### Categorías (ids reales de esta instalación)

| id | Nombre |
|---:|---|
| 8  | Arms |
| 9  | Legs |
| 10 | Abs |
| 11 | Chest |
| 12 | Back |
| 13 | Shoulders |
| 14 | Calves |
| 15 | Cardio |

Idiomas: `language=2` es inglés, `language=4` español.

## Nutrición

- `GET /api/v2/ingredient/?name__search=pollo` — **este es el filtro real**,
  no `?name=`. Verificado: "pollo" 171, "arroz" 362, "chicken" 1211.
  Total en base: **177.302 alimentos**.
- `GET /api/v2/ingredient/?code=<codigo_barras>` — por código de barras
- `GET /api/v2/ingredientinfo/{id}/` — alimento con unidades e imágenes
- `POST /api/v2/nutritionplan/` — `{description, only_logging, goal_energy,
  goal_protein, goal_carbohydrates, goal_fat, goal_fiber}`
- `GET /api/v2/nutritionplaninfo/{id}/` — plan con comidas y alimentos anidados
- `GET /api/v2/nutritionplan/{id}/nutritional_values/` — totales calculados
- `POST /api/v2/nutritiondiary/` — registro diario de lo comido

Macros de un `Ingredient`: por 100 g → `energy` (kcal), `protein`,
`carbohydrates`, `carbohydrates_sugar`, `fat`, `fat_saturated`, `fiber`, `sodium`.

## Peso, medidas y perfil

- `GET|POST /api/v2/weightentry/` — `{date, weight}`
- `GET|POST /api/v2/measurement-category/` — `{name, unit}`
- `GET|POST /api/v2/measurement/` — `{category, date, value, notes}`
- `GET|PATCH /api/v2/userprofile/` — `birthdate`, `gender`, `height`,
  `weight_unit`, `work_intensity`, `sport_intensity`, `freetime_intensity`,
  `calories`

## Lo que NO existe en wger (lo aporta SalazFitness)

| Falta | Comprobado con |
|---|---|
| Registro de agua | búsqueda `water` en el repo: 0 |
| Recetas | búsqueda `recipe`: 0 |
| Lista de la compra | búsqueda `shopping`: 0 |
| Objetivo de peso y fecha | búsqueda `goal_weight`: 0 |
| Precios y coste por persona | no existe |

## Endpoints propios de SalazFitness (`/api/v2/salaz/`)

Los CRUD normales (`household`, `purchase`, `recipe`, `shopping-list`...) siguen
el patrón de DRF y no se detallan aquí. Los que tienen lógica propia sí:

### Nutrición → compra

`POST /api/v2/salaz/shopping-list/from-nutrition/`

Convierte los platos del plan de nutrición en la lista de la compra. Es el
enlace entre las dos mitades de la app: lo que hay apuntado en Desayuno,
Comida, Cena y Snacks es lo que hay que comprar.

```jsonc
{
  "household": 1,
  "plan": "uuid-del-plan",   // opcional: por defecto, el más reciente
  "start_date": "2026-08-26", // opcional: por defecto, hoy
  "days": 12,                 // opcional: 12 por defecto
  "include_produce": true,    // añade fruta y verdura del día a día
  "red_fruit": true,          // moras, fresas y arándanos
  "freeze": null              // fuerza congelar (o no); sin esto lo decide la vida útil
}
```

Devuelve la `ShoppingList` creada, con `trips`: el resumen de cada tanda de
compra.

**Las tandas.** Una lista de 12 días no es una sola compra. Cada línea lleva
`trip`, `buy_date` y `days_covered`, calculados con la vida útil del producto
(`backend/salaz/frescura.py`):

| Producto | Aguanta | En 12 días |
|---|---|---|
| Arroz, aceite, legumbre | 365 d | 1 compra |
| Yogur, huevos, manzana | 18-25 d | 1 compra |
| Brócoli, tomate | 8-9 d | 2 compras |
| Moras, fresas, pollo | 3 d | 4 compras pequeñas |
| Pescado fresco | 2 d | 1 compra, `freeze_on_arrival: true` |

Cuando algo pediría más de 4 viajes al supermercado y se puede congelar, se
compra de una vez y la línea sale marcada para el congelador. Los gramos totales
son los mismos repartidos que de golpe: `gramos al día × días que cubre la
tanda`.

### Compra → nutrición

`GET /api/v2/salaz/shopping-list/{id}/coverage/?date=YYYY-MM-DD`

La vuelta del enlace: para una fecha, qué comidas tienen ya sus alimentos
comprados. Lo consume el diario de Nutrición.

```jsonc
{
  "date": "2026-08-26",
  "nutrition_plan": "uuid-del-plan",
  "meals": [
    { "meal": "...", "name": "Desayuno", "status": "comprado", "total": 4, "purchased": 4 },
    { "meal": "...", "name": "Cena", "status": "parcial", "total": 5, "purchased": 2 }
  ],
  "ingredients": [{ "ingredient": 1234, "purchased": true }]
}
```

`status` es `comprado`, `parcial`, `pendiente` o `sin_datos`. Una línea cubre
una fecha si `buy_date <= fecha < buy_date + days_covered`.

### Ticket de la compra (foto → texto → datos)

Subir la foto de un ticket y volcarla a una compra real. El camino tiene un
paso intermedio a propósito, y ese paso es **texto legible**:

```
foto  →  markdown  →  parsed  →  Purchase + PurchaseItem
                                   ├→ Despensa (PantryItem)
                                   ├→ Resumen / Hogar
                                   └→ Lista (marca lo que ya se ha comprado)
```

`markdown` es la transcripción del ticket, y se guarda **editable**. Esa es la
decisión de diseño importante: si la transcripción lee mal una línea, se
corrige el texto y se vuelve a analizar, sin volver a fotografiar nada, y sin
que el resto de la cadena dependa de cómo se obtuvo ese texto.

> **Estado actual de la transcripción:** hoy el texto se pega a mano. La
> instalación no trae OCR (`tesseract`) ni clave de API de visión, así que el
> endpoint acepta el `markdown` ya transcrito. Enchufar más adelante visión u
> OCR consiste en rellenar `markdown` antes de llamar a `/analizar/`: nada más
> del contrato cambia.

| Endpoint | Qué hace |
|---|---|
| `POST /api/v2/salaz/receipt/` | Crea el ticket. `household` obligatorio; `image` (fichero) y `markdown` opcionales. Acepta multipart y JSON. |
| `POST /api/v2/salaz/receipt/{id}/analizar/` | Pasa el texto por el parser (`salaz/tickets.py`) y guarda el resultado en `parsed`. Admite `markdown` en el cuerpo para corregir el texto en la misma llamada. **No toca compras ni despensa.** |
| `POST /api/v2/salaz/receipt/{id}/confirmar/` | Vuelca a una compra real. `201` la primera vez, `200` si ya estaba confirmado (idempotente), `400` si no está analizado. |
| `GET/PATCH/DELETE /api/v2/salaz/receipt/{id}/` | CRUD normal. Borrar el ticket **no** borra la compra ya confirmada. |

Estados: `pendiente` → `analizado` → `confirmado`, más `error` si el texto no
da ninguna línea de producto.

```jsonc
{
  "id": 3, "household": 1, "status": "analizado",
  "supermarket": "Mercadona", "date": "2026-08-19", "total": "19.10",
  "parsed": {
    "supermarket": "Mercadona", "date": "2026-08-19", "total": "19.10",
    "lines": [
      { "name": "LECHE ENTERA 1L", "units": "2", "amount": "2",
        "unit": "unit", "unit_price": "0.89", "total": "1.78" },
      { "name": "PLATANO", "units": null, "amount": "0.760",
        "unit": "kg", "unit_price": "3.00", "total": "2.28" }
    ],
    "warnings": []
  },
  "purchase": null
}
```

El parser entiende tickets en **castellano y catalán** (`Descripción`/
`Descripció`, `Importe`/`Import`, `TARJETA`/`TARGETA`...), coma decimal, y las
líneas de producto a peso en dos renglones (`PLATANO` … / `0,760 kg 3,00 EUR/kg`).

Al confirmar, cada línea del ticket se intenta casar por nombre normalizado
(`frescura.normalizar_nombre`) contra lo que siga pendiente en la lista de la
compra activa. Lo que casa se marca como comprado **por el ORM, no por el
ViewSet de la lista**: pasar por ahí dispararía `_sincronizar_compra_real` y
crearía una segunda compra por lo mismo, duplicando gasto y despensa.

Hay tickets de prueba (ficticios) en `docs/tickets-prueba/`.

### Sincronización entre dispositivos

Siete datos que hasta ahora vivían solo en el `localStorage` del navegador (y
por tanto no viajaban entre el PC, el emulador de Android y el iPhone del
dueño). Todos siguen el mismo patrón:

- **`GET`** filtra siempre por el usuario autenticado — nunca se ve el dato de
  otra persona, ni siquiera con el id exacto.
- **`POST` hace un upsert**, no una creación estricta: escribir la misma clave
  otra vez (mismo `date`, mismo `household`, misma `key`...) actualiza la fila
  existente en vez de fallar con un conflicto de unicidad. El cliente manda lo
  que tiene y no necesita saber si ya existía.
- Todas las respuestas llevan `updated_at` en solo lectura. Es la pieza que
  implementa **"última escritura gana"**: el servidor no fusiona cambios ni
  guarda historial, simplemente cada escritura pisa a la anterior; `updated_at`
  es lo que le permite a un cliente saber cuándo se escribió por última vez.
  `PATCH /{id}/` sigue disponible para actualizaciones normales.

| Ruta | Modelo | Clave de upsert | Antes vivía en |
|---|---|---|---|
| `/api/v2/salaz/water-log/` | agua del día | `(usuario, date)` | `salaz.agua.{fecha}` |
| `/api/v2/salaz/weight-goal/` | objetivo de peso | `usuario` (uno solo) | `salaz.objetivo.*` |
| `/api/v2/salaz/weekly-plan/` | plan semanal de recetas | `household` (uno solo) | `salaz.plan.semana` |
| `/api/v2/salaz/favorite-ingredient/` | alimentos favoritos | `(usuario, ingredient)` | `salaz.alimentos.favoritos` |
| `/api/v2/salaz/recent-ingredient/` | alimentos recientes | `(usuario, ingredient)` | `salaz.alimentos.recientes` |
| `/api/v2/salaz/workout-session-draft/` | sesión de entreno en curso | `(usuario, date)` | `salaz.sesion.{...}` |
| `/api/v2/salaz/device-state/` | rutina activa / plan activo | `(usuario, key)` | `salaz.entreno.rutinaActivaId`, `salaz.nutricion.planActivoId` |

Detalle de cada uno:

```jsonc
// POST /api/v2/salaz/water-log/   { "date": "2026-08-27", "milliliters": 750 }
// -> 200, { "id": 1, "user": 3, "date": "2026-08-27", "milliliters": 750, "updated_at": "..." }

// POST /api/v2/salaz/weight-goal/
//   { "goal_type": "perder_peso", "target_weight": "78.50", "target_date": "2026-12-31" }
// goal_type: perder_peso | mantener_peso | ganar_peso | ganar_masa_muscular
//            | mejorar_fuerza | recomposicion_corporal (mismos valores que
//            TIPOS_OBJETIVO en web/src/features/yo/objetivo.ts)
// -> 200, un objetivo por usuario: un segundo POST actualiza el mismo.

// POST /api/v2/salaz/weekly-plan/
//   {
//     "household": 1,
//     "start_date": "2026-08-24", "end_date": "2026-09-06",
//     "selection": [{ "recipeId": 1, "recipeName": "Arroz", "tandas": 2 }],
//     "by_day": [{ "fecha": "2026-08-24", "recipeId": 1, "recipeName": "Arroz" }],
//     "ingredient_origins": { "5": ["Arroz"] }
//   }
// household tiene que ser de tu propiedad (404 si no). Un plan por hogar.
// selection, by_day e ingredient_origins son JSON libre: la misma forma que
// PlanSemana en web/src/features/compra/planLocal.ts.

// POST /api/v2/salaz/favorite-ingredient/   { "ingredient": 1234 }
// -> 201. Marcar dos veces el mismo ingredient no duplica ni falla.
// DELETE /api/v2/salaz/favorite-ingredient/{id}/  para quitarlo.

// POST /api/v2/salaz/recent-ingredient/   { "ingredient": 1234 }
// -> 201. Registrar un alimento que ya estaba en recientes lo sube al
// principio (no lo duplica). Tope de 30: al superarlo se recorta el más
// antiguo por updated_at.

// POST /api/v2/salaz/workout-session-draft/
//   { "date": "2026-08-27", "content": { /* SesionProgreso completo */ } }
// content es JSON libre: la misma forma que SesionProgreso en
// web/src/features/entreno/lib/sesionStorage.ts. Un borrador por (usuario, fecha).

// POST /api/v2/salaz/device-state/   { "key": "rutina_activa", "value": "42" }
// key: "rutina_activa" | "plan_activo" (400 con cualquier otra). value es
// siempre texto: el id de rutina y el uuid del plan de nutricion se guardan
// como string.
```

### Cuentas

Los únicos endpoints que se llaman **sin sesión**: quien se registra todavía no
tiene cuenta. Todos con límite de peticiones por IP.

| Método y ruta | Qué hace | Límite |
|---|---|---|
| `POST /api/v2/salaz/account/register/` | Alta. Crea el usuario con `is_active=False` y manda el correo | 5/hora por IP |
| `POST /api/v2/salaz/account/verify/` | Confirma con el token del correo y activa la cuenta | 20/hora por IP |
| `POST /api/v2/salaz/account/resend/` | Reenvía el correo. Responde siempre lo mismo, exista la cuenta o no | 5/hora por IP |
| `GET /api/v2/salaz/account/me/` | Estado de la cuenta que llama (requiere sesión) | — |

Mientras `is_active` sea `False`, el login de wger rechaza la cuenta. La
verificación queda impuesta sin haber tocado nada de wger.

## Esquema OpenAPI completo

`GET /api/v2/schema?format=json` — 129 rutas, 926 KB.
Copia local en `.recon/openapi.json`.
