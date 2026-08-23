/**
 * Progreso del modo gimnasio guardado en localStorage.
 *
 * Si el usuario recarga la pagina a media sesion (pasa en el gimnasio: se
 * cae el wifi, se bloquea el movil) no se puede perder lo que ya ha hecho.
 * Se guarda por fecha+rutina: si cambia el dia, la sesion vieja no se reutiliza.
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
}

const PREFIX = 'salaz.sesion.'

function key(routineId: number, fecha: string): string {
  return `${PREFIX}${routineId}.${fecha}`
}

export function leerProgreso(routineId: number, fecha: string): SesionProgreso | null {
  try {
    const raw = localStorage.getItem(key(routineId, fecha))
    if (!raw) return null
    return JSON.parse(raw) as SesionProgreso
  } catch {
    return null
  }
}

export function guardarProgreso(progreso: SesionProgreso): void {
  try {
    localStorage.setItem(key(progreso.routineId, progreso.fecha), JSON.stringify(progreso))
  } catch {
    /* almacenamiento lleno o bloqueado: no es motivo para romper la sesion */
  }
}

export function borrarProgreso(routineId: number, fecha: string): void {
  localStorage.removeItem(key(routineId, fecha))
}
