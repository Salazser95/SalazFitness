import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, fetchAll } from '../../lib/api'
import { today } from '../../lib/format'

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
