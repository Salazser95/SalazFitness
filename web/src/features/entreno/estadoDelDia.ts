import { useMemo } from 'react'

import {
  useActiveRoutine,
  useDateSequenceGym,
  useWorkoutSessions,
  type DiaSecuencia,
  type Routine,
  type WorkoutSession,
} from './api'
import {
  aplicarReprogramaciones,
  useDaySkips,
  useReschedules,
  type WorkoutDaySkip,
  type WorkoutReschedule,
} from './reprogramacion'

/**
 * Que significa una fecha concreta, en una sola pieza. Unica fuente de
 * verdad para Hoy y para el calendario de Entreno: sin esto cada pantalla
 * volvia a derivar "es descanso", "esta movido", "ya se entreno" por su
 * cuenta y podian acabar diciendo cosas distintas de la misma fecha.
 *
 * La ausencia de datos NUNCA significa "no entrene": sin una WorkoutSession
 * (completado) ni una WorkoutDaySkip (omitido) para la fecha, el estado es
 * "planificado" o "descanso" segun lo que toque, punto. Quien quiera saber
 * "todavia no ha llegado a esta fecha" lo decide comparando con `today()`
 * fuera de este hook, no leyendo el tipo.
 */
export type TipoEstadoDia = 'completado' | 'omitido' | 'planificado' | 'descanso'

export type EstadoDia = {
  fecha: string
  tipo: TipoEstadoDia
  /** El dia resuelto (tras aplicar los intercambios activos) para esta fecha, si la rutina cubre ese rango. */
  dia: DiaSecuencia | null
  /**
   * La secuencia entera ya resuelta (con los intercambios activos
   * aplicados), para quien necesite ofrecer "cambia esta fecha por..."
   * (ver AntesDeEmpezar). null mientras carga o si no hay rutina activa.
   */
  secuencia: DiaSecuencia[] | null
  /** true si esta fecha es el origen o el destino de un intercambio activo. */
  movido: boolean
  reschedule: WorkoutReschedule | null
  sesion: WorkoutSession | null
  marcaOmitido: WorkoutDaySkip | null
  rutina: Routine | null
  isLoading: boolean
  isError: boolean
}

function esDescanso(dia: DiaSecuencia | null): boolean {
  return !dia || !dia.day || dia.day.is_rest
}

function tipoDeEstado(
  dia: DiaSecuencia | null,
  sesion: WorkoutSession | null,
  marcaOmitido: WorkoutDaySkip | null,
): TipoEstadoDia {
  if (sesion) return 'completado'
  if (marcaOmitido) return 'omitido'
  return esDescanso(dia) ? 'descanso' : 'planificado'
}

export function useEstadoDelDia(fecha: string): EstadoDia {
  const rutinaQ = useActiveRoutine()
  const rutina = rutinaQ.data ?? null
  const secuenciaQ = useDateSequenceGym(rutina?.id ?? null)
  const reschedulesQ = useReschedules()
  const skipsQ = useDaySkips()
  const sesionesQ = useWorkoutSessions()

  const secuenciaResuelta = useMemo(() => {
    if (!secuenciaQ.data) return null
    return aplicarReprogramaciones(secuenciaQ.data, reschedulesQ.data ?? [])
  }, [secuenciaQ.data, reschedulesQ.data])

  const dia = useMemo(
    () => secuenciaResuelta?.find((d) => d.date === fecha) ?? null,
    [secuenciaResuelta, fecha],
  )
  const reschedule = useMemo(
    () =>
      (reschedulesQ.data ?? []).find((r) => r.origin_date === fecha || r.target_date === fecha) ??
      null,
    [reschedulesQ.data, fecha],
  )
  const marcaOmitido = useMemo(
    () => (skipsQ.data ?? []).find((s) => s.date === fecha) ?? null,
    [skipsQ.data, fecha],
  )
  const sesion = useMemo(
    () => (sesionesQ.data ?? []).find((s) => s.date === fecha) ?? null,
    [sesionesQ.data, fecha],
  )

  return {
    fecha,
    tipo: tipoDeEstado(dia, sesion, marcaOmitido),
    dia,
    secuencia: secuenciaResuelta,
    movido: reschedule !== null,
    reschedule,
    sesion,
    marcaOmitido,
    rutina,
    isLoading:
      rutinaQ.isLoading ||
      (rutina !== null && secuenciaQ.isLoading) ||
      reschedulesQ.isLoading ||
      skipsQ.isLoading ||
      sesionesQ.isLoading,
    isError: rutinaQ.isError || secuenciaQ.isError || reschedulesQ.isError || sesionesQ.isError,
  }
}
