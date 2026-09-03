import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, fetchAll } from '../../lib/api'
import type { DiaSecuencia } from './api'

/**
 * Mover el entreno de una fecha a otra, y marcar una fecha como omitida a
 * proposito. Antes vivian solo en localStorage (`entreno/local.ts`,
 * `MovidosMap`): un dispositivo no veia el movimiento que se hizo en otro.
 * Ahora son /api/v2/salaz/workout-reschedule/ y /api/v2/salaz/workout-day-skip/
 * (ver backend/salaz/models/workout_reschedule.py y workout_day_skip.py para
 * el porque de cada decision de modelo).
 */

// ------------------------------------------------------------ reprogramar

export type WorkoutReschedule = {
  id: number
  user: number
  origin_date: string
  target_date: string
  origin_routine: number | null
  origin_day: number | null
  target_routine: number | null
  target_day: number | null
  created: string
  updated_at: string
}

export type NuevaReprogramacion = {
  origin_date: string
  target_date: string
  origin_routine: number | null
  origin_day: number | null
  target_routine: number | null
  target_day: number | null
}

const claveReschedules = ['entreno', 'reschedules'] as const

export function useReschedules() {
  return useQuery({
    queryKey: claveReschedules,
    queryFn: () => fetchAll<WorkoutReschedule>('/api/v2/salaz/workout-reschedule/'),
  })
}

/**
 * Crea el intercambio. El backend rechaza (400) si origin_date == target_date
 * o si alguna de las dos fechas ya es origen o destino de otro movimiento
 * activo (ver WorkoutRescheduleViewSet.create): hay que deshacer ese primero.
 */
export function useCrearReschedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: NuevaReprogramacion) =>
      api.post<WorkoutReschedule>('/api/v2/salaz/workout-reschedule/', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveReschedules })
    },
  })
}

/** Deshacer es borrar la fila: no hay un PATCH de estado, cada movimiento es su propia fila. */
export function useDeshacerReschedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/v2/salaz/workout-reschedule/${id}/`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveReschedules })
    },
  })
}

/**
 * Aplica los intercambios activos a una secuencia de dias ya calculada por
 * `/date-sequence-gym/`: misma logica que la antigua `aplicarMovidos` de
 * local.ts (intercambia day/label/slots entre origin_date y target_date),
 * ahora alimentada por filas del servidor en vez de un mapa de localStorage.
 * Si alguna de las dos fechas de un movimiento no esta en la secuencia
 * cargada (fuera del rango visible), ese movimiento se ignora sin romper
 * el resto.
 */
export function aplicarReprogramaciones(
  secuencia: DiaSecuencia[],
  reschedules: WorkoutReschedule[],
): DiaSecuencia[] {
  if (reschedules.length === 0) return secuencia

  const indicePorFecha = new Map(secuencia.map((d, i) => [d.date, i] as const))
  const resultado = [...secuencia]

  for (const r of reschedules) {
    const iOrigen = indicePorFecha.get(r.origin_date)
    const iDestino = indicePorFecha.get(r.target_date)
    if (iOrigen === undefined || iDestino === undefined) continue
    const a = resultado[iOrigen]
    const b = resultado[iDestino]
    resultado[iOrigen] = { ...a, day: b.day, label: b.label, slots: b.slots }
    resultado[iDestino] = { ...b, day: a.day, label: a.label, slots: a.slots }
  }

  return resultado
}

// ------------------------------------------------------------------ omitir

export type WorkoutDaySkip = {
  id: number
  user: number
  date: string
  updated_at: string
}

const claveDaySkips = ['entreno', 'day-skips'] as const

export function useDaySkips() {
  return useQuery({
    queryKey: claveDaySkips,
    queryFn: () => fetchAll<WorkoutDaySkip>('/api/v2/salaz/workout-day-skip/'),
  })
}

/** Marca una fecha como omitida a proposito. Marcarla dos veces no duplica (upsert en el backend). */
export function useMarcarOmitido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fecha: string) =>
      api.post<WorkoutDaySkip>('/api/v2/salaz/workout-day-skip/', { date: fecha }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveDaySkips })
    },
  })
}

export function useQuitarOmitido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/v2/salaz/workout-day-skip/${id}/`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveDaySkips })
    },
  })
}
