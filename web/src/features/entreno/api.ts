import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { api, fetchAll } from '../../lib/api'
import { today } from '../../lib/format'
import { useRutinaActivaId } from './local'

/**
 * Capa de datos de entrenamiento contra la API de wger.
 * Contrato verificado en docs/API-CONTRACT.md y probado contra el servidor real
 * (ver informe del agente). La usan tanto features/entreno como features/hoy.
 */

// ------------------------------------------------------------------- tipos

export type Routine = {
  id: number
  name: string
  description: string
  start: string
  end: string
  fit_in_week: boolean
  is_template: boolean
  is_public: boolean
}

export type DayType = 'custom' | 'enom' | 'amrap' | 'hiit' | 'tabata' | 'edt' | 'rft' | 'afap'

export type Day = {
  id: number
  routine: number
  order: number
  name: string
  description: string
  is_rest: boolean
  need_logs_to_advance: boolean
  type: DayType
}

/** Una fila de la serie ya expandida: cada objeto es UNA serie a realizar. */
export type SetConfigData = {
  slot_entry_id: number
  exercise: number
  sets: number
  weight: string | null
  weight_unit: number | null
  repetitions: string | null
  repetitions_unit: number | null
  rir: string | null
  rpe: string | null
  rest: string | null
  type: string
  text_repr: string
  comment: string
}

export type SlotData = {
  comment: string
  is_superset: boolean
  exercises: number[]
  sets: SetConfigData[]
}

/**
 * Un dia de la secuencia de fechas de una rutina, en modo gimnasio.
 * OJO: pese a que el esquema OpenAPI marca "day" y "label" como obligatorios,
 * el servidor real devuelve day:null y label:null en los dias sin entreno
 * (descanso sin configurar). Verificado con curl contra /date-sequence-gym/.
 */
export type DiaSecuencia = {
  iteration: number
  date: string
  label: string | null
  day: Day | null
  slots: SlotData[]
}

export type Impression = '1' | '2' | '3'

export type WorkoutSession = {
  id: string
  routine: number | null
  day: number | null
  date: string
  notes: string | null
  impression: Impression | null
  time_start: string | null
  time_end: string | null
}

export type WorkoutLog = {
  id: string
  date: string
  session: string | null
  routine: number | null
  slot_entry: number | null
  exercise: number
  repetitions: string | null
  weight: string | null
  rir: string | null
  rest: number | null
}

// ---------------------------------------------------------------- rutinas

export function useRoutines() {
  return useQuery({
    queryKey: ['entreno', 'routines'],
    queryFn: () => fetchAll<Routine>('/api/v2/routine/'),
  })
}

/** La rutina activa: start <= hoy <= end. Si hay varias, la de inicio mas reciente. */
export function pickActiveRoutine(routines: Routine[]): Routine | null {
  const hoy = today()
  const activas = routines.filter((r) => r.start <= hoy && hoy <= r.end)
  if (activas.length === 0) return null
  return [...activas].sort((a, b) => (a.start < b.start ? 1 : -1))[0]
}

/**
 * La rutina activa "de verdad": la elegida a mano por el usuario (boton
 * Activar, guardada en localStorage) si todavia existe entre sus rutinas; si
 * no hay eleccion guardada, o esa rutina ya no existe, cae en el calculo por
 * fechas de `pickActiveRoutine` (comportamiento de siempre). Usa
 * `useRutinaActivaId` (useSyncExternalStore) para reaccionar al cambio sin
 * recargar la pagina, igual que `usePlan` en features/nutricion/api.ts.
 */
export function useActiveRoutine(): {
  data: Routine | null | undefined
  isLoading: boolean
  isError: boolean
  refetch: UseQueryResult<Routine[]>['refetch']
} {
  const routines = useRoutines()
  const activaId = useRutinaActivaId()
  const data = routines.data
    ? (activaId !== null && routines.data.find((r) => r.id === activaId)) ||
      pickActiveRoutine(routines.data)
    : routines.data
  return {
    data,
    isLoading: routines.isLoading,
    isError: routines.isError,
    refetch: routines.refetch,
  }
}

export function useRoutine(routineId: number | null) {
  return useQuery({
    queryKey: ['entreno', 'routine', routineId],
    queryFn: () => api.get<Routine>(`/api/v2/routine/${routineId}/`),
    enabled: routineId !== null,
  })
}

export function useDateSequenceGym(routineId: number | null) {
  return useQuery({
    queryKey: ['entreno', 'date-sequence-gym', routineId],
    queryFn: () => api.get<DiaSecuencia[]>(`/api/v2/routine/${routineId}/date-sequence-gym/`),
    enabled: routineId !== null,
  })
}

// ------------------------------------------------------- estructura (detalle)

export type SlotEntryConfig = {
  id: number
  slot_entry: number
  iteration: number
  value: string | number
}

export type StructureSlotEntry = {
  id: number
  slot: number
  exercise: number
  order: number
  comment: string
  type: string
  repetitions_configs: SlotEntryConfig[]
  weight_configs: SlotEntryConfig[]
  set_nr_configs: SlotEntryConfig[]
  rir_configs: SlotEntryConfig[]
  rest_configs: SlotEntryConfig[]
}

export type StructureSlot = {
  id: number
  day: number
  order: number
  comment: string
  entries: StructureSlotEntry[]
}

export type StructureDay = Day & { slots: StructureSlot[] }

export type RoutineStructure = Routine & { days: StructureDay[] }

export function useRoutineStructure(routineId: number | null) {
  return useQuery({
    queryKey: ['entreno', 'structure', routineId],
    queryFn: () => api.get<RoutineStructure>(`/api/v2/routine/${routineId}/structure/`),
    enabled: routineId !== null,
  })
}

// -------------------------------------------------------- nombres de ejercicio

type ExerciseTranslation = { id: number; name: string; exercise: number; language: number }

/**
 * El filtro ?language= del endpoint NO filtra de verdad (comprobado con curl:
 * language=2 y language=4 devuelven el mismo listado completo). Por eso se
 * pide todo y se elige en el cliente: espanol (4) > ingles (2) > el primero.
 */
async function fetchExerciseName(exerciseId: number): Promise<string> {
  const res = await api.get<{ results: ExerciseTranslation[] }>(
    `/api/v2/exercise-translation/?exercise=${exerciseId}`,
  )
  const es = res.results.find((t) => t.language === 4)
  const en = res.results.find((t) => t.language === 2)
  return es?.name ?? en?.name ?? res.results[0]?.name ?? `Ejercicio ${exerciseId}`
}

/** Devuelve un mapa exercise id -> nombre, cargando solo los ids que faltan. */
export function useExerciseNames(ids: number[]) {
  const unique = useMemo(() => Array.from(new Set(ids)).sort((a, b) => a - b), [ids])

  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ['entreno', 'exercise-name', id],
      queryFn: () => fetchExerciseName(id),
      staleTime: Infinity, // el nombre de un ejercicio no cambia
    })),
  })

  return useMemo(() => {
    const map = new Map<number, string>()
    unique.forEach((id, i) => {
      map.set(id, results[i]?.data ?? `Ejercicio ${id}`)
    })
    return map
  }, [unique, results])
}

// ------------------------------------------------------ media del ejercicio

export type ExerciseVideo = {
  id: number
  exercise: number
  video: string
  is_main: boolean
  width: number
  height: number
  duration: string
}

export type ExerciseImage = {
  id: number
  exercise: number
  image: string
  is_main: boolean
  style: string
}

/**
 * OJO: el parametro documentado inicialmente era `exercise_base`, pero NO
 * filtra nada (devuelve siempre la lista completa sin recortar, comprobado
 * con curl). El parametro real que SI filtra en el servidor es `exercise`
 * (visto en el schema OpenAPI y confirmado contra /api/v2/video/?exercise=).
 * Si el id no existe como Exercise, el servidor responde 400 en vez de una
 * lista vacia: por eso ambas peticiones van en try/catch, para no romper la
 * pantalla si un ejercicio no tiene media todavia (caso esperado ahora mismo,
 * mientras `download-exercise-images`/`download-exercise-videos` siguen en
 * marcha en background).
 */
async function fetchExerciseVideo(exerciseId: number): Promise<string | null> {
  try {
    const res = await api.get<{ results: ExerciseVideo[] }>(
      `/api/v2/video/?exercise=${exerciseId}`,
    )
    if (res.results.length === 0) return null
    const principal = res.results.find((v) => v.is_main) ?? res.results[0]
    return principal.video
  } catch {
    return null
  }
}

async function fetchExerciseImage(exerciseId: number): Promise<string | null> {
  try {
    const res = await api.get<{ results: ExerciseImage[] }>(
      `/api/v2/exerciseimage/?exercise=${exerciseId}`,
    )
    if (res.results.length === 0) return null
    const principal = res.results.find((i) => i.is_main) ?? res.results[0]
    return principal.image
  } catch {
    return null
  }
}

export type ExerciseDetail = {
  id: number
  category: number
}

/**
 * Categoria de un ejercicio (Chest, Back, Legs...), para poder pintar
 * `ExerciseIllustration` cuando no hay video ni imagen real. Sigue el mismo
 * patron try/catch que fetchExerciseVideo/fetchExerciseImage: nunca lanza,
 * devuelve null si el ejercicio no existe o el endpoint falla.
 */
async function fetchExerciseCategory(exerciseId: number): Promise<number | null> {
  try {
    const res = await api.get<ExerciseDetail>(`/api/v2/exercise/${exerciseId}/`)
    return res.category
  } catch {
    return null
  }
}

export function useExerciseCategory(exerciseId: number) {
  return useQuery({
    queryKey: ['entreno', 'exercise-category', exerciseId],
    queryFn: () => fetchExerciseCategory(exerciseId),
    staleTime: Infinity, // la categoria de un ejercicio no cambia
    enabled: exerciseId > 0,
  })
}

/**
 * Media de un ejercicio (como hacerlo): prioriza el video sobre la imagen si
 * hay ambos. Devuelve null en cada campo si no hay nada todavia, nunca lanza.
 */
export function useExerciseMedia(exerciseId: number): {
  video: string | null
  image: string | null
  isLoading: boolean
} {
  const results = useQueries({
    queries: [
      {
        queryKey: ['entreno', 'exercise-video', exerciseId],
        queryFn: () => fetchExerciseVideo(exerciseId),
        staleTime: Infinity, // la media de un ejercicio no cambia
      },
      {
        queryKey: ['entreno', 'exercise-image', exerciseId],
        queryFn: () => fetchExerciseImage(exerciseId),
        staleTime: Infinity,
      },
    ],
  })
  const [videoQuery, imageQuery] = results

  return {
    video: videoQuery.data ?? null,
    image: imageQuery.data ?? null,
    isLoading: videoQuery.isLoading || imageQuery.isLoading,
  }
}

// --------------------------------------------------------- sesiones y series

export function useWorkoutSessions(maxPages = 10) {
  return useQuery({
    queryKey: ['entreno', 'sessions', maxPages],
    queryFn: () => fetchAll<WorkoutSession>('/api/v2/workoutsession/?ordering=-date', maxPages),
  })
}

export function useWorkoutLogsBySession(sessionId: string | null) {
  return useQuery({
    queryKey: ['entreno', 'logs-session', sessionId],
    queryFn: () => fetchAll<WorkoutLog>(`/api/v2/workoutlog/?session=${sessionId}&ordering=date`),
    enabled: sessionId !== null,
  })
}

export function useWorkoutLogsByExercise(exerciseId: number | null) {
  return useQuery({
    queryKey: ['entreno', 'logs-exercise', exerciseId],
    queryFn: () =>
      fetchAll<WorkoutLog>(`/api/v2/workoutlog/?exercise=${exerciseId}&ordering=date`),
    enabled: exerciseId !== null,
  })
}

export type NuevaSesion = { routine: number; day: number; date: string }

export function useCrearSesion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: NuevaSesion) => api.post<WorkoutSession>('/api/v2/workoutsession/', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'sessions'] })
    },
  })
}

export type NuevaSerie = {
  session: string
  routine: number | null
  exercise: number
  slot_entry: number
  weight?: string
  repetitions?: string
  rir?: string
  rest?: number
  date: string
}

export function useRegistrarSerie() {
  return useMutation({
    mutationFn: (body: NuevaSerie) => api.post<WorkoutLog>('/api/v2/workoutlog/', body),
  })
}

export type CambiosSerie = {
  weight?: string
  repetitions?: string
  rir?: string
}

/**
 * PATCH /api/v2/workoutlog/{id}/ — verificado con curl real contra el
 * servidor (OPTIONS confirma "Allow: GET, PUT, PATCH, DELETE, HEAD,
 * OPTIONS"; un PATCH de weight devuelve 200 con el registro actualizado).
 * Para corregir una serie ya registrada: peso, repeticiones o RIR mal
 * anotados durante el entreno.
 */
export function useActualizarSerie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CambiosSerie }) =>
      api.patch<WorkoutLog>(`/api/v2/workoutlog/${id}/`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'logs-session'] })
      void qc.invalidateQueries({ queryKey: ['entreno', 'logs-exercise'] })
    },
  })
}

/**
 * DELETE /api/v2/workoutlog/{id}/ — verificado con curl real: se creo un
 * registro de prueba, se borro con DELETE (204) y un GET posterior confirmo
 * 404. Para quitar una serie que en realidad no se hizo (el ejercicio se
 * salto) sin perder el resto del progreso registrado.
 */
export function useEliminarSerie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/api/v2/workoutlog/${id}/`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'logs-session'] })
      void qc.invalidateQueries({ queryKey: ['entreno', 'logs-exercise'] })
    },
  })
}

// ------------------------------------------------- CRUD de rutinas y dias

/**
 * Limites verificados contra el schema OpenAPI real (GET /api/v2/schema?format=json):
 * Routine.name <= 25, Day.name <= 20. El backend los hace cumplir igual,
 * pero se valida tambien en el formulario para dar el error antes.
 */
export const NOMBRE_RUTINA_MAX = 25
export const NOMBRE_DIA_MAX = 20

export type NuevaRutina = {
  name: string
  start: string
  end: string
  fit_in_week?: boolean
  is_template?: boolean
}

export function useCrearRutina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: NuevaRutina) => api.post<Routine>('/api/v2/routine/', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'routines'] })
    },
  })
}

export type CambiosRutina = Partial<NuevaRutina> & { is_public?: boolean }

export function useActualizarRutina(routineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CambiosRutina) => api.patch<Routine>(`/api/v2/routine/${routineId}/`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'routines'] })
      void qc.invalidateQueries({ queryKey: ['entreno', 'routine', routineId] })
      void qc.invalidateQueries({ queryKey: ['entreno', 'structure', routineId] })
    },
  })
}

/** DELETE /api/v2/routine/{id}/ borra en cascada dias, slots, entries y configs (verificado). */
export function useEliminarRutina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (routineId: number) => api.del<void>(`/api/v2/routine/${routineId}/`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'routines'] })
    },
  })
}

export type NuevoDia = {
  routine: number
  name: string
  type?: DayType
  is_rest: boolean
  order: number
}

export function useCrearDia(routineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: NuevoDia) => api.post<Day>('/api/v2/day/', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'structure', routineId] })
    },
  })
}

export function useActualizarDia(routineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dayId, body }: { dayId: number; body: Partial<NuevoDia> }) =>
      api.patch<Day>(`/api/v2/day/${dayId}/`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'structure', routineId] })
    },
  })
}

/** DELETE /api/v2/day/{id}/ borra en cascada sus slots, entries y configs. */
export function useEliminarDia(routineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dayId: number) => api.del<void>(`/api/v2/day/${dayId}/`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'structure', routineId] })
    },
  })
}

// ------------------------------------------- anadir/quitar ejercicios de un dia

export type NuevoEjercicioEnDia = {
  dayId: number
  /** order del slot dentro del dia: 1, 2, 3... */
  order: number
  exercise: number
  series: string
  repeticiones: string
  peso?: string
  descansoSeg?: string
  rir?: string
}

/**
 * Cadena completa verificada contra el servidor real (curl):
 * POST slot -> POST slot-entry -> POST sets/repetitions/weight/rest/rir-config
 * (solo se manda el config si el usuario relleno el campo). Todo a iteration 1:
 * este formulario no gestiona progresion semana a semana, eso se sigue
 * haciendo con el script de PowerShell si hace falta.
 */
async function crearEjercicioEnDia(datos: NuevoEjercicioEnDia): Promise<void> {
  const slot = await api.post<{ id: number }>('/api/v2/slot/', {
    day: datos.dayId,
    order: datos.order,
  })
  const entry = await api.post<{ id: number }>('/api/v2/slot-entry/', {
    slot: slot.id,
    exercise: datos.exercise,
    order: 1,
    type: 'normal',
  })

  await api.post('/api/v2/sets-config/', { slot_entry: entry.id, iteration: 1, value: datos.series })
  await api.post('/api/v2/repetitions-config/', {
    slot_entry: entry.id,
    iteration: 1,
    value: datos.repeticiones,
  })
  if (datos.peso) {
    await api.post('/api/v2/weight-config/', { slot_entry: entry.id, iteration: 1, value: datos.peso })
  }
  if (datos.descansoSeg) {
    await api.post('/api/v2/rest-config/', {
      slot_entry: entry.id,
      iteration: 1,
      value: datos.descansoSeg,
    })
  }
  if (datos.rir) {
    await api.post('/api/v2/rir-config/', { slot_entry: entry.id, iteration: 1, value: datos.rir })
  }
}

export function useAnadirEjercicioADia(routineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: crearEjercicioEnDia,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'structure', routineId] })
    },
  })
}

/**
 * Quita un ejercicio de un dia. Borra el slot-entry y, SOLO si ese slot se
 * queda sin mas entries, tambien el slot vacio (comprobado con curl: DELETE
 * slot-entry no borra el slot en cascada). El aviso de "sin mas entries" lo
 * decide quien llama (`borrarSlotSiVacio`), porque un slot puede tener varias
 * entries si es una superserie (creada fuera de este formulario, que solo
 * genera 1 slot = 1 ejercicio): borrar el slot en ese caso se llevaria por
 * delante a las demas entries de la superserie con el.
 */
export function useEliminarEjercicioDeDia(routineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      slotEntryId,
      slotId,
      borrarSlotSiVacio,
    }: {
      slotEntryId: number
      slotId: number
      borrarSlotSiVacio: boolean
    }) => {
      await api.del<void>(`/api/v2/slot-entry/${slotEntryId}/`)
      if (borrarSlotSiVacio) await api.del<void>(`/api/v2/slot/${slotId}/`)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'structure', routineId] })
    },
  })
}

// ------------------------------------------------- duplicar / importar plantilla

const ENDPOINTS_CONFIG: { clave: keyof StructureSlotEntry; endpoint: string }[] = [
  { clave: 'set_nr_configs', endpoint: '/api/v2/sets-config/' },
  { clave: 'repetitions_configs', endpoint: '/api/v2/repetitions-config/' },
  { clave: 'weight_configs', endpoint: '/api/v2/weight-config/' },
  { clave: 'rest_configs', endpoint: '/api/v2/rest-config/' },
  { clave: 'rir_configs', endpoint: '/api/v2/rir-config/' },
]

/**
 * Recrea una rutina entera (dias, slots, entries y las 5 configs por
 * iteracion) a partir de la estructura de otra, ya sea propia (Duplicar) o
 * publica (Importar plantilla): ambas leen con GET .../structure/ y vuelven
 * a construir todo con POST, iteracion a iteracion, porque wger no tiene un
 * endpoint de "clonar". Secuencial a proposito: cada nivel depende del id
 * que devuelve el anterior.
 */
async function recrearRutinaDesdeEstructura(
  estructura: RoutineStructure,
  nombre: string,
  start: string,
  end: string,
): Promise<Routine> {
  const rutina = await api.post<Routine>('/api/v2/routine/', {
    name: nombre.slice(0, NOMBRE_RUTINA_MAX),
    start,
    end,
    fit_in_week: estructura.fit_in_week,
  })

  for (const dia of [...estructura.days].sort((a, b) => a.order - b.order)) {
    const nuevoDia = await api.post<Day>('/api/v2/day/', {
      routine: rutina.id,
      name: dia.name,
      description: dia.description,
      type: dia.type,
      is_rest: dia.is_rest,
      need_logs_to_advance: dia.need_logs_to_advance,
      order: dia.order,
    })

    for (const slot of [...dia.slots].sort((a, b) => a.order - b.order)) {
      const nuevoSlot = await api.post<{ id: number }>('/api/v2/slot/', {
        day: nuevoDia.id,
        order: slot.order,
        comment: slot.comment,
      })

      for (const entry of [...slot.entries].sort((a, b) => a.order - b.order)) {
        const nuevaEntry = await api.post<{ id: number }>('/api/v2/slot-entry/', {
          slot: nuevoSlot.id,
          exercise: entry.exercise,
          order: entry.order,
          type: entry.type,
          comment: entry.comment,
        })

        for (const { clave, endpoint } of ENDPOINTS_CONFIG) {
          const configs = entry[clave] as SlotEntryConfig[]
          for (const cfg of configs) {
            await api.post(endpoint, {
              slot_entry: nuevaEntry.id,
              iteration: cfg.iteration,
              value: cfg.value,
            })
          }
        }
      }
    }
  }

  return rutina
}

export type DuplicarRutinaInput = { routineId: number; nombre: string; start: string; end: string }

export function useDuplicarRutina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ routineId, nombre, start, end }: DuplicarRutinaInput) => {
      const estructura = await api.get<RoutineStructure>(`/api/v2/routine/${routineId}/structure/`)
      return recrearRutinaDesdeEstructura(estructura, nombre, start, end)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'routines'] })
    },
  })
}

/** Plantillas publicas de la comunidad: solo lectura, para "Importar plantilla". */
export function usePublicTemplates() {
  return useQuery({
    queryKey: ['entreno', 'public-templates'],
    queryFn: () => fetchAll<Routine>('/api/v2/public-templates/'),
  })
}

/** Importar una plantilla publica es duplicarla: misma cadena, distinto origen. */
export function useImportarPlantilla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ routineId, nombre, start, end }: DuplicarRutinaInput) => {
      const estructura = await api.get<RoutineStructure>(`/api/v2/routine/${routineId}/structure/`)
      return recrearRutinaDesdeEstructura(estructura, nombre, start, end)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entreno', 'routines'] })
    },
  })
}

// --------------------------------------------------------- buscador de ejercicios

export type EjercicioBuscable = { id: number; name: string }

/**
 * Lista completa de ejercicios para el selector del formulario de rutinas.
 * Igual que fetchExerciseName: el filtro ?language= del endpoint no filtra
 * de verdad, asi que se pide todo una vez (2035 traducciones, ?limit=999 para
 * no hacer 102 peticiones de 20) y se elige por ejercicio: espanol > ingles >
 * el primero que haya. Cache de sesion entera (staleTime Infinity): la lista
 * de ejercicios no cambia mientras la app esta abierta.
 */
export function useBuscarEjercicios() {
  return useQuery({
    queryKey: ['entreno', 'exercise-search-list'],
    queryFn: async () => {
      const traducciones = await fetchAll<ExerciseTranslation>(
        '/api/v2/exercise-translation/?limit=999',
        10,
      )
      const porEjercicio = new Map<number, { es?: string; en?: string; otro?: string }>()
      for (const t of traducciones) {
        const actual = porEjercicio.get(t.exercise) ?? {}
        if (t.language === 4) actual.es = t.name
        else if (t.language === 2) actual.en = t.name
        else actual.otro ??= t.name
        porEjercicio.set(t.exercise, actual)
      }
      const lista: EjercicioBuscable[] = []
      porEjercicio.forEach((v, id) => {
        const name = v.es ?? v.en ?? v.otro
        if (name) lista.push({ id, name })
      })
      return lista.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    },
    staleTime: Infinity,
  })
}
