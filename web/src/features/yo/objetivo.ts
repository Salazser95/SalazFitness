/**
 * Objetivo de peso del usuario.
 *
 * wger no tiene campos para esto: se ha comprobado que "goal_weight" da 0
 * resultados en el repositorio (ver docs/API-CONTRACT.md). Mientras no exista
 * un endpoint en el backend, se guarda en localStorage bajo las claves
 * `salaz.objetivo.peso`, `salaz.objetivo.fecha` y `salaz.objetivo.tipo`.
 *
 * TODO: migrar a la API cuando wger (o SalazFitness) exponga un endpoint
 * propio para el objetivo de peso.
 */

export type TipoObjetivo =
  | 'perder_peso'
  | 'mantener_peso'
  | 'ganar_peso'
  | 'ganar_masa_muscular'
  | 'mejorar_fuerza'
  | 'recomposicion_corporal'

export const TIPOS_OBJETIVO: { value: TipoObjetivo; label: string }[] = [
  { value: 'perder_peso', label: 'Perder peso' },
  { value: 'mantener_peso', label: 'Mantener peso' },
  { value: 'ganar_peso', label: 'Ganar peso' },
  { value: 'ganar_masa_muscular', label: 'Ganar masa muscular' },
  { value: 'mejorar_fuerza', label: 'Mejorar fuerza' },
  { value: 'recomposicion_corporal', label: 'Recomposición corporal' },
]

export type Objetivo = {
  peso: number | null
  fecha: string | null // YYYY-MM-DD
  tipo: TipoObjetivo | null
}

const KEY_PESO = 'salaz.objetivo.peso'
const KEY_FECHA = 'salaz.objetivo.fecha'
const KEY_TIPO = 'salaz.objetivo.tipo'

export function leerObjetivo(): Objetivo {
  const peso = localStorage.getItem(KEY_PESO)
  const fecha = localStorage.getItem(KEY_FECHA)
  const tipo = localStorage.getItem(KEY_TIPO)
  return {
    peso: peso ? Number(peso) : null,
    fecha: fecha || null,
    tipo: tipo ? (tipo as TipoObjetivo) : null,
  }
}

export function guardarObjetivo(o: Objetivo): void {
  if (o.peso !== null && !Number.isNaN(o.peso)) {
    localStorage.setItem(KEY_PESO, String(o.peso))
  } else {
    localStorage.removeItem(KEY_PESO)
  }

  if (o.fecha) localStorage.setItem(KEY_FECHA, o.fecha)
  else localStorage.removeItem(KEY_FECHA)

  if (o.tipo) localStorage.setItem(KEY_TIPO, o.tipo)
  else localStorage.removeItem(KEY_TIPO)
}
