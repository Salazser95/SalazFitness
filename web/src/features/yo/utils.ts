import type { WeightEntry, WorkoutLog, WorkoutSession } from './api'

/**
 * Calculos derivados para "Yo". Todo son funciones puras sobre datos que ya
 * se han pedido a la API: nada de esto hace peticiones de red.
 */

// ------------------------------------------------------------------ Edad

export function calcularEdad(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null
  const nacimiento = new Date(birthdate)
  if (Number.isNaN(nacimiento.getTime())) return null

  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mesDiff = hoy.getMonth() - nacimiento.getMonth()
  if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad
}

// ------------------------------------------------------------------- IMC

export function calcularIMC(pesoKg: number, alturaCm: number): number | null {
  if (!pesoKg || !alturaCm) return null
  const alturaM = alturaCm / 100
  return pesoKg / (alturaM * alturaM)
}

export type ColorClasificacion = 'accent' | 'success' | 'warning' | 'danger'
export type ClasificacionIMC = { etiqueta: string; color: ColorClasificacion }

export function clasificarIMC(imc: number): ClasificacionIMC {
  if (imc < 18.5) return { etiqueta: 'Bajo peso', color: 'accent' }
  if (imc < 25) return { etiqueta: 'Normal', color: 'success' }
  if (imc < 30) return { etiqueta: 'Sobrepeso', color: 'warning' }
  return { etiqueta: 'Obesidad', color: 'danger' }
}

// -------------------------------------------------------------- Peso/media

export type PuntoPeso = { fecha: string; peso: number }
export type PuntoPesoConMedia = PuntoPeso & { media: number }

/**
 * Media movil de 7 dias por ventana de fecha (no por indice de la lista):
 * el peso diario tiene mucho ruido y hay dias sin registro, asi que la media
 * se calcula sobre las entradas de los ultimos 7 dias naturales, no sobre
 * las ultimas 7 entradas.
 */
export function mediaMovil7(puntos: PuntoPeso[]): PuntoPesoConMedia[] {
  const ordenados = [...puntos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const SIETE_DIAS_MS = 6 * 24 * 60 * 60 * 1000

  return ordenados.map((p) => {
    const t = new Date(p.fecha).getTime()
    const ventana = ordenados.filter((x) => {
      const xt = new Date(x.fecha).getTime()
      return xt <= t && xt >= t - SIETE_DIAS_MS
    })
    const media = ventana.reduce((s, x) => s + x.peso, 0) / ventana.length
    return { ...p, media: Math.round(media * 100) / 100 }
  })
}

export type Rango = '1m' | '3m' | '6m' | 'todo'

export function cortarPorRango<T extends { fecha: string }>(puntos: T[], rango: Rango): T[] {
  if (rango === 'todo') return puntos
  const meses = { '1m': 1, '3m': 3, '6m': 6 }[rango]
  const limite = new Date()
  limite.setMonth(limite.getMonth() - meses)
  return puntos.filter((p) => new Date(p.fecha) >= limite)
}

// ---------------------------------------------------------------- Semanas

function inicioDeSemana(d: Date): Date {
  const date = new Date(d)
  const dia = date.getDay() // 0 = domingo .. 6 = sabado
  const diff = (dia === 0 ? -6 : 1) - dia // semana empieza en lunes
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

/** Fecha ISO -> clave del lunes de esa semana, en YYYY-MM-DD. */
export function claveSemana(fechaIso: string): string {
  const d = inicioDeSemana(new Date(fechaIso))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Clave de semana -> etiqueta corta para el eje X, p.ej. "24 ago". */
export function etiquetaSemana(claveSemanaIso: string): string {
  return new Date(claveSemanaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------- Entrenamiento

export type SesionesPorSemana = { semana: string; sesiones: number }

export function calcularSesionesSemanales(sessions: WorkoutSession[]): SesionesPorSemana[] {
  const porSemana = new Map<string, number>()
  for (const s of sessions) {
    const clave = claveSemana(s.date)
    porSemana.set(clave, (porSemana.get(clave) ?? 0) + 1)
  }
  return Array.from(porSemana.entries())
    .map(([semana, sesiones]) => ({ semana, sesiones }))
    .sort((a, b) => a.semana.localeCompare(b.semana))
}

export type VolumenPorSemana = { semana: string; volumen: number }

/** Volumen = peso x repeticiones, sumado por semana. */
export function calcularVolumenSemanal(logs: WorkoutLog[]): VolumenPorSemana[] {
  const porSemana = new Map<string, number>()
  for (const log of logs) {
    const peso = log.weight ? Number(log.weight) : 0
    const reps = log.repetitions ? Number(log.repetitions) : 0
    if (!peso || !reps) continue
    const clave = claveSemana(log.date)
    porSemana.set(clave, (porSemana.get(clave) ?? 0) + peso * reps)
  }
  return Array.from(porSemana.entries())
    .map(([semana, volumen]) => ({ semana, volumen: Math.round(volumen) }))
    .sort((a, b) => a.semana.localeCompare(b.semana))
}

export type RecordPersonal = { exerciseId: number; pesoMax: number; fecha: string }

/** Peso maximo movido por ejercicio, con la fecha en que se consiguio. */
export function calcularRecords(logs: WorkoutLog[]): RecordPersonal[] {
  const porEjercicio = new Map<number, RecordPersonal>()
  for (const log of logs) {
    const peso = log.weight ? Number(log.weight) : 0
    if (!peso) continue
    const actual = porEjercicio.get(log.exercise)
    if (!actual || peso > actual.pesoMax) {
      porEjercicio.set(log.exercise, { exerciseId: log.exercise, pesoMax: peso, fecha: log.date })
    }
  }
  return Array.from(porEjercicio.values()).sort((a, b) => b.pesoMax - a.pesoMax)
}

// ------------------------------------------------------------------ Peso actual

export type PesoActual = { actual: number; fecha: string; delta7d: number | null }

/**
 * Ultimo peso registrado y su variacion frente al registro mas cercano a
 * 7 dias antes (no frente al penultimo registro suelto: los pesajes no son
 * diarios).
 */
export function pesoActualConDelta(entradas: WeightEntry[]): PesoActual | null {
  if (entradas.length === 0) return null
  const ordenadas = [...entradas].sort((a, b) => a.date.localeCompare(b.date))
  const ultima = ordenadas[ordenadas.length - 1]
  const actual = Number(ultima.weight)
  const tActual = new Date(ultima.date).getTime()
  const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

  const referencia = [...ordenadas]
    .reverse()
    .find((e) => e !== ultima && tActual - new Date(e.date).getTime() >= SIETE_DIAS_MS)

  const delta7d = referencia
    ? Math.round((actual - Number(referencia.weight)) * 100) / 100
    : null

  return { actual, fecha: ultima.date, delta7d }
}

// ------------------------------------------------------------------ Meta

/** Ritmo semanal necesario para llegar al objetivo. Null si la fecha ya paso. */
export function ritmoSemanalNecesario(
  pesoActual: number,
  pesoObjetivo: number,
  fechaObjetivo: string,
): number | null {
  const hoy = new Date()
  const fin = new Date(fechaObjetivo)
  const semanas = (fin.getTime() - hoy.getTime()) / (7 * 24 * 60 * 60 * 1000)
  if (semanas <= 0) return null
  return (pesoObjetivo - pesoActual) / semanas
}
