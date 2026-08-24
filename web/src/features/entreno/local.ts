import { useSyncExternalStore } from 'react'
import type { DiaSecuencia } from './api'

/**
 * Datos que NO existen en wger sobre entrenamiento y que SalazFitness guarda
 * en `localStorage`. Mismo patron que features/nutricion/local.ts.
 */

// -------------------------------------------------------------- rutina activa

// wger no tiene concepto de "rutina activa elegida por el usuario": el
// comportamiento por defecto (pickActiveRoutine en api.ts) elige por fechas,
// lo que obligaba a duplicar una rutina solo para que sus fechas cubrieran
// hoy. Esta clave guarda la eleccion explicita del usuario, que gana sobre
// el calculo por fechas si la rutina todavia existe.
const RUTINA_ACTIVA_KEY = 'salaz.entreno.rutinaActivaId'

export function leerRutinaActivaId(): number | null {
  const raw = localStorage.getItem(RUTINA_ACTIVA_KEY)
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

// Pub-sub minimo: localStorage no dispara el evento nativo `storage` en la
// MISMA pestana que escribe, asi que sin esto un componente ya montado no se
// enteraria del cambio de rutina activa hasta un remount.
type Listener = () => void
const listenersRutinaActiva = new Set<Listener>()

/** `null` borra la preferencia (vuelve a elegirse por fechas). */
export function escribirRutinaActivaId(id: number | null): void {
  if (id === null) localStorage.removeItem(RUTINA_ACTIVA_KEY)
  else localStorage.setItem(RUTINA_ACTIVA_KEY, String(id))
  for (const l of listenersRutinaActiva) l()
}

function suscribirRutinaActiva(listener: Listener): () => void {
  listenersRutinaActiva.add(listener)
  return () => listenersRutinaActiva.delete(listener)
}

/** Igual que `leerRutinaActivaId`, pero re-renderiza el componente si cambia. */
export function useRutinaActivaId(): number | null {
  return useSyncExternalStore(suscribirRutinaActiva, leerRutinaActivaId, () => null)
}

// --------------------------------------------------------- entrenos movidos

/**
 * Desplazamiento puntual de un dia de entreno a otra fecha ("si no entreno
 * martes, pasarlo a miercoles"). Guardado por rutina, mapa fecha origen ->
 * fecha destino (YYYY-MM-DD). Solo afecta a la semana en la que se hace: no
 * toca el `order` de los `Day` en el backend, asi que la rutina en si no
 * cambia para siempre. Pendiente de backend: si wger anade algun dia el
 * concepto de "excepcion puntual de fecha", esta es la unica capa a tocar.
 */
export type MovidosMap = Record<string, string>

const EMPTY_MOVIDOS: MovidosMap = {}

function movidosKey(routineId: number): string {
  return `salaz.entreno.movidos.${routineId}`
}

// Cache por rutina: useSyncExternalStore exige que getSnapshot devuelva la
// MISMA referencia si no ha cambiado nada, o React entra en bucle de aviso.
// Como JSON.parse siempre crea un objeto nuevo, se cachea junto al string
// crudo y solo se reparsea si ese string cambio de verdad.
const movidosCache = new Map<number, { raw: string; parsed: MovidosMap }>()

export function leerMovidos(routineId: number): MovidosMap {
  const raw = localStorage.getItem(movidosKey(routineId))
  if (raw === null) return EMPTY_MOVIDOS
  const cacheado = movidosCache.get(routineId)
  if (cacheado && cacheado.raw === raw) return cacheado.parsed
  try {
    const parsed = JSON.parse(raw) as MovidosMap
    movidosCache.set(routineId, { raw, parsed })
    return parsed
  } catch {
    return EMPTY_MOVIDOS
  }
}

const listenersMovidos = new Set<Listener>()

function escribirMovidos(routineId: number, mapa: MovidosMap): void {
  if (Object.keys(mapa).length === 0) localStorage.removeItem(movidosKey(routineId))
  else localStorage.setItem(movidosKey(routineId), JSON.stringify(mapa))
  for (const l of listenersMovidos) l()
}

/** Mueve el entreno de `desde` a `hasta` (intercambia el contenido de las dos fechas). */
export function moverEntreno(routineId: number, desde: string, hasta: string): void {
  const actual = { ...leerMovidos(routineId) }
  if (desde === hasta) delete actual[desde]
  else actual[desde] = hasta
  escribirMovidos(routineId, actual)
}

/** Deshace el movimiento cuyo origen es `desde` (vuelve todo a su fecha real). */
export function deshacerMovido(routineId: number, desde: string): void {
  const actual = { ...leerMovidos(routineId) }
  delete actual[desde]
  escribirMovidos(routineId, actual)
}

function suscribirMovidos(listener: Listener): () => void {
  listenersMovidos.add(listener)
  return () => listenersMovidos.delete(listener)
}

/** Mapa fecha origen -> fecha destino para la rutina dada, reactivo. */
export function useMovidos(routineId: number | null): MovidosMap {
  return useSyncExternalStore(
    suscribirMovidos,
    () => (routineId !== null ? leerMovidos(routineId) : EMPTY_MOVIDOS),
    () => EMPTY_MOVIDOS,
  )
}

/**
 * Aplica los movimientos puntuales a una secuencia de dias ya calculada por
 * `/date-sequence-gym/`: intercambia `day`/`label`/`slots` entre la fecha
 * origen y la fecha destino de cada movimiento, dejando `date` e `iteration`
 * como estaban (son propiedades del calendario, no del contenido movido).
 * Si alguna de las dos fechas no esta en la secuencia cargada (fuera del
 * rango visible), ese movimiento se ignora sin romper el resto.
 */
export function aplicarMovidos(secuencia: DiaSecuencia[], movidos: MovidosMap): DiaSecuencia[] {
  const entradas = Object.entries(movidos)
  if (entradas.length === 0) return secuencia

  const indicePorFecha = new Map(secuencia.map((d, i) => [d.date, i] as const))
  const resultado = [...secuencia]

  for (const [desde, hasta] of entradas) {
    const iDesde = indicePorFecha.get(desde)
    const iHasta = indicePorFecha.get(hasta)
    if (iDesde === undefined || iHasta === undefined) continue
    const a = resultado[iDesde]
    const b = resultado[iHasta]
    resultado[iDesde] = { ...a, day: b.day, label: b.label, slots: b.slots }
    resultado[iHasta] = { ...b, day: a.day, label: a.label, slots: a.slots }
  }

  return resultado
}
