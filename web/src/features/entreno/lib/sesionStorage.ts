/**
 * Forma del progreso de una sesion de gimnasio en curso.
 *
 * Antes se guardaba en localStorage (de ahi el nombre del fichero): si se
 * recargaba la pagina a media sesion no se perdia. Ahora vive en el
 * servidor (ver features/entreno/sesionDraft.ts, sobre
 * /api/v2/salaz/workout-session-draft/), para que lo mismo valga si el
 * telefono se apaga y se retoma desde el PC. Este fichero se queda solo con
 * los tipos: son el contrato de lo que viaja como `content` en ese endpoint.
 */

export type SerieProgreso = {
  slotEntryId: number
  exercise: number
  orden: number
  peso: string
  repeticiones: string
  rir: string
  descansoSeg: number
  completada: boolean
  /** id del workoutlog ya creado en el backend para esta serie, o null si aun no se ha guardado. */
  logId: string | null
}

export type EjercicioProgreso = {
  exercise: number
  series: SerieProgreso[]
}

export type SesionProgreso = {
  routineId: number
  dayId: number
  fecha: string
  ejercicioActual: number
  ejercicios: EjercicioProgreso[]
  /** id del workoutsession ya creado en el backend, o null si "Terminar" aun no se ha pulsado con exito. */
  sesionId: string | null
  /** Fecha y hora (ISO) de cuando se empezo esta sesion, para el cronometro y para time_start. */
  horaInicio: string
}
