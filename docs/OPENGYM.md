# openGym como cantera de ideas — informe

Encargo: no fusionar openGym con SalazFitness. Solo mirar qué merece la pena
traer (código o idea) y qué no. Repositorio real:
[`DuarteSantos8/openGym`](https://github.com/DuarteSantos8/openGym) — el
enlace `arvids-unavailable/openGym` que se dio inicialmente redirige a este.

Verificado clonando el repositorio y leyendo el código fuente, no solo el
README. Donde no he podido comprobar algo lo digo explícitamente.

## 1. Qué es, y el choque de arquitectura

openGym es un registro de gimnasio y peso corporal autoalojado, con web,
Android e iPhone (Capacitor, igual que SalazFitness). Datos reales del
repositorio:

| | openGym | SalazFitness |
|---|---|---|
| Frontend | React 19 + Vite + Zustand + React Router | React 19 + Vite + Zustand + React Router |
| Backend | Node.js sin framework (`api/server.js`, ~1000 líneas) | Módulo Django sobre wger |
| Datos | Un fichero JSON por usuario (`state-<uid>.json`) | MySQL/SQLite vía el ORM de Django |
| Auth | WebAuthn (passkeys) + código de emparejamiento para móvil | JWT de wger + verificación por correo |
| Licencia | AGPL-3.0 (Copyright Duarte Santos) | AGPL-3.0 (deriva de wger) |
| Sincronización | Empuja el estado entero (debounce de 1.5 s) + `_ts` para conflictos. **Sin WebSocket ni SSE** | `updated_at` por recurso, última escritura gana |

El choque de fondo: openGym guarda **todo el estado de un usuario en un solo
blob JSON** que sube y baja entero. SalazFitness normaliza en tablas
relacionales con integridad referencial (una compra tiene líneas, cada línea
un ingrediente de wger). No hay forma de "traer" el backend de openGym: son
dos filosofías de datos incompatibles. Lo único trasplantable es **el
frontend**, y ahí sí, pieza a pieza.

## 2. Qué merece la pena traer

Ordenado por relación valor/esfuerzo.

### 2.1. El modelo de plantilla + excepción por fecha (alto valor, bajo coste)

Esto es lo que el dueño pedía explícitamente en los puntos 5 y 9: reprogramar
qué rutina toca un día sin romper la plantilla semanal.

openGym resuelve "qué toca hoy" con dos capas, en `frontend/src/lib/history.js`:

```js
export function effectiveRoutineId(S, iso) {
  const ov = S.dayPlan[iso]          // excepcion de ESTA fecha concreta
  if (ov === 'rest') return null
  if (ov && S.routines.some(r => r.id === ov)) return ov
  const wd = new Date(iso + 'T12:00:00').getDay()
  return S.week[wd] || null          // plantilla semanal (lunes..domingo)
}
```

- `S.week[diaDeSemana] = idRutina` — la plantilla: qué rutina toca cada día
  de la semana, se repite indefinidamente. Es el "selector de día de la
  semana, lunes a domingo" que pediste.
- `S.dayPlan[fechaISO] = idRutina | 'rest' | undefined` — la excepción: **una
  fecha concreta** puede anular la plantilla (cambiar la rutina de ese día,
  o marcarlo descanso), sin tocar la plantilla para el resto de semanas.
  `undefined` (la clave no existe) es distinto de `'rest'`: "sin decidir,
  usa la plantilla" no es lo mismo que "hoy descanso a propósito". Esta
  distinción explícita es exactamente lo que el resto del encargo pide para
  Entreno ("no confundir 'no hay registros' con 'no entrené'").
- Deshacer es trivial: borrar la clave de `dayPlan` (`delete s.dayPlan[iso]`)
  vuelve a la plantilla. Es el "debe poder deshacerse" que pediste.

**Qué traer**: la idea, no el código (es Zustand + localStorage, no vale tal
cual). El equivalente en SalazFitness es un modelo `WorkoutDayOverride` en
`backend/salaz`, con `(household_o_usuario, date, override)` donde
`override` sea `null` (sin excepción), `'rest'`, o el id de una rutina de
wger — y la misma función de resolución (`fecha con excepción → excepción;
si no, día de la semana → plantilla`) reimplementada en Python. Esto
reemplaza y amplía el `movidos`/`MovidosMap` que hoy vive en
`web/src/features/entreno/local.ts` (que solo intercambia el contenido entre
dos fechas y es local al dispositivo): el modelo de openGym es más simple de
razonar y ya está probado en producción.

**Coste**: pequeño. Un modelo, una migración, un endpoint con el mismo patrón
que `device-state` (ver `backend/salaz/models/device_state.py`), y la función
de resolución en `entreno/api.ts`. Es el ítem que recomendaría hacer primero
de todo el roadmap de Entreno.

### 2.2. Estimación de 1RM y progresión (valor medio, coste bajo)

`frontend/src/lib/history.js` trae `estimate1RM` (fórmula de Epley/Brzycki,
verificar cuál exactamente al leer el código) y funciones de progresión.
SalazFitness no calcula 1RM en ningún sitio hoy. Es una función pura, sin
estado, sin dependencias del resto de openGym: se puede leer su fórmula y
reimplementarla en un fichero propio (`entreno/progresion.ts`) en media hora.
No hay nada que "portar" literalmente, es una fórmula matemática de dominio
público (Epley y Brzycki son de los años 80-90), pero la forma en que openGym
la aplica a un histórico de series (qué serie cuenta, cómo desempata) vale la
pena mirarla antes de reinventarla.

### 2.3. Mapa de calor muscular (valor medio, coste medio — con aviso de licencia)

Las siluetas SVG del cuerpo (`frontend/src/lib/body-paths.js`) son de
[MuscleMap](https://github.com/melihcolpan/MuscleMap), licencia **MIT**,
reproducida correctamente en `NOTICE.md` de openGym. Esto SÍ se puede reusar
con atribución: son datos geométricos (paths SVG), no código de la app.

El emparejamiento ejercicio→músculo (`exercise-muscle-batch-1.json` y
`-2.json`, ~2600 líneas en total) es trabajo de curación propio de openGym,
bajo su AGPL. Traerlo es viable citando la fuente, pero exige mapear sus ids
de ejercicio a los 872 de wger uno a uno — no hay un cruce automático, es
trabajo manual o un script de coincidencia por nombre que habría que
verificar a mano.

**No traer las animaciones ni las imágenes de ejercicios** (ver la advertencia
de licencia en la sección 3): eso NO es parte de openGym, lo baja cada
instalación de un tercero con derechos disputados.

### 2.4. Emparejamiento de dispositivo sin volver a iniciar sesión (idea, no código)

Para la app instalada, openGym resuelve "conectar el móvil a mi propio
servidor" con un código de un solo uso generado desde el navegador ya
autenticado (`Ajustes → "Emparejar la app móvil"` en su interfaz), en vez de
teclear usuario y contraseña en el móvil. Justificación textual del propio
código: las passkeys no funcionan dentro del WebView de la app porque su
origen nunca coincide con el `RP_ID` del servidor.

SalazFitness no usa passkeys, así que el problema exacto no aplica, pero la
idea general — un código corto generado en un dispositivo ya logueado, para
no volver a escribir la contraseña en el móvil — es un patrón de UX
reutilizable si en algún momento se quiere simplificar el primer login del
APK. Prioridad baja, no lo pediste.

## 3. Qué NO traer, y por qué

| Qué | Por qué no |
|---|---|
| **Autenticación por passkeys (WebAuthn)** | SalazFitness ya tiene JWT de wger + verificación por correo, funcionando y probado (84 pruebas del módulo de cuentas). Cambiar de esquema de autenticación es un rediseño de seguridad completo sin ninguna ganancia: resuelve un problema (contraseñas) que SalazFitness no tiene planteado. |
| **Almacenamiento en JSON por usuario** | Incompatible con el modelo relacional de SalazFitness. Adoptar esto sería tirar el trabajo ya hecho (migraciones, transacciones, integridad referencial entre compra/receta/hogar). |
| **Los 1.324 ejercicios (metadatos + animaciones)** | Las animaciones tienen la titularidad **en disputa** entre Gym visual y ExerciseDB (lo dice el propio openGym en su README y NOTICE.md), openGym no las redistribuye — cada instalación las descarga de un tercero. SalazFitness ya tiene 872 ejercicios de wger con licencia clara, y precisamente decidiste no querer un catálogo enorme sin usar. No hay ninguna razón para asumir un riesgo de licencia por un catálogo que no vas a usar entero. |
| **Importadores de FitNotes / Strong / Hevy** | Sirven para migrar DESDE esas apps. Nadie en SalazFitness viene de ellas; sin usuarios que las necesiten, es código muerto desde el primer día. |
| **El backend Node completo** | Ver la sección 1: arquitectura de datos incompatible. Ni una línea de `api/server.js` encaja en un proyecto Django. |
| **El servidor MCP (`mcp/`)** | Expone el estado de openGym a un LLM externo (Claude Desktop, Cursor...) en modo solo lectura. Interesante como idea a futuro si algún día quieres consultar tus datos desde un asistente, pero no tiene relación con ninguna de las peticiones de esta ronda; no lo he investigado a fondo por no ser pertinente ahora. |

## 4. Obligaciones de licencia

Los dos proyectos son AGPL-3.0, lo que hace legalmente viable reutilizar
código de openGym en SalazFitness (y viceversa) con atribución. En la
práctica:

- **Si se reimplementa una idea sin copiar código** (como el modelo de
  plantilla+excepción de la sección 2.1, o la fórmula de 1RM): no hay
  obligación legal, son ideas/algoritmos, no expresión protegida. Aun así,
  documentar en el propio código de dónde vino la idea es buena práctica y
  ya es el estilo de comentarios que usa este proyecto.
- **Si se copia o adapta código o datos literalmente** (como las siluetas
  SVG de MuscleMap vía openGym, o el mapa músculo-ejercicio): hay que añadir
  una entrada en el `NOTICE` de la raíz de SalazFitness, con la atribución
  exacta que ya lleva `NOTICE.md` de openGym (que a su vez atribuye
  correctamente a MuscleMap bajo MIT). Es una entrada de texto, no cambia la
  licencia de SalazFitness.
- **No hay obligación de abrir el código de SalazFitness a más gente de la
  que ya obliga la AGPL de wger**: SalazFitness ya está bajo AGPL-3.0 desde
  el primer día por derivar de wger (ver `NOTICE` y `docs/DESPLIEGUE.md`), así
  que tomar algo de otro proyecto AGPL no añade una obligación nueva, ya
  estabas ahí.

## 5. Recomendación

Si solo se hace una cosa de esta lista: **el modelo de plantilla + excepción
por fecha (sección 2.1)**. Es lo que pediste explícitamente, es la pieza más
barata de las cuatro, y desbloquea a la vez el "selector de día de la
semana" y el "reprogramar sin perder el plan" — las dos peticiones de tus
puntos 5 y 9 en una sola pieza de trabajo. El 1RM (2.2) es un buen segundo
paso, barato y aislado. El mapa muscular (2.3) déjalo para cuando el resto
de Entreno esté asentado: tiene más fricción (mapear ids a wger a mano) para
un valor más decorativo.

## Lo que no he podido verificar

- No he ejecutado openGym (ni su frontend ni su backend Node): todo lo de
  arriba sale de leer el código fuente, no de probarlo en marcha.
- No he comprobado la fórmula exacta de `estimate1RM` línea a línea (confirmo
  que existe y dónde vive, no su corrección matemática).
- No he investigado el servidor MCP a fondo, por no ser pertinente a esta
  ronda de trabajo.
