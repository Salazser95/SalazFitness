/**
 * Datos que NO existen en wger y que SalazFitness guarda en `localStorage`.
 * Verificado: buscar "water" en la base de wger da 0 resultados, no hay
 * endpoint de agua. Recetas y favoritos tampoco existen.
 *
 * Todo aqui es local al dispositivo. Si en el futuro wger (o un backend
 * propio) anade estos endpoints, esta es la unica capa que hay que tocar:
 * las pantallas ya llaman a estas funciones, no a `localStorage` directamente.
 */

import type { Ingredient } from './api'

// ------------------------------------------------------------------ agua

export const AGUA_VASO_ML = 250
export const AGUA_OBJETIVO_ML_DEFECTO = 2000

function aguaKey(fecha: string): string {
  return `salaz.agua.${fecha}`
}

/** Mililitros de agua registrados en una fecha (YYYY-MM-DD). */
export function leerAgua(fecha: string): number {
  const raw = localStorage.getItem(aguaKey(fecha))
  const n = raw === null ? 0 : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function escribirAgua(fecha: string, mililitros: number): number {
  const valor = Math.max(0, Math.round(mililitros))
  localStorage.setItem(aguaKey(fecha), String(valor))
  return valor
}

// ----------------------------------------------------- favoritos / recientes

// Solo se guarda lo necesario para pintar una fila y recalcular macros:
// no hace falta el registro completo del alimento (licencias, uuid, etc).
export type AlimentoGuardado = Pick<
  Ingredient,
  | 'id'
  | 'code'
  | 'name'
  | 'brand'
  | 'energy'
  | 'protein'
  | 'carbohydrates'
  | 'carbohydrates_sugar'
  | 'fat'
  | 'fat_saturated'
  | 'fiber'
  | 'sodium'
>

export function aGuardado(ing: AlimentoGuardado): AlimentoGuardado {
  const {
    id,
    code,
    name,
    brand,
    energy,
    protein,
    carbohydrates,
    carbohydrates_sugar,
    fat,
    fat_saturated,
    fiber,
    sodium,
  } = ing
  return {
    id,
    code,
    name,
    brand,
    energy,
    protein,
    carbohydrates,
    carbohydrates_sugar,
    fat,
    fat_saturated,
    fiber,
    sodium,
  }
}

const FAVORITOS_KEY = 'salaz.alimentos.favoritos'
const RECIENTES_KEY = 'salaz.alimentos.recientes'
const RECIENTES_MAX = 30

function leerLista(clave: string): AlimentoGuardado[] {
  try {
    const raw = localStorage.getItem(clave)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AlimentoGuardado[]) : []
  } catch {
    return []
  }
}

export function leerFavoritos(): AlimentoGuardado[] {
  return leerLista(FAVORITOS_KEY)
}

export function leerRecientes(): AlimentoGuardado[] {
  return leerLista(RECIENTES_KEY)
}

export function esFavorito(id: number): boolean {
  return leerFavoritos().some((a) => a.id === id)
}

/** Anade o quita de favoritos. Devuelve la lista resultante para actualizar el estado local. */
export function alternarFavorito(ing: AlimentoGuardado): AlimentoGuardado[] {
  const actuales = leerFavoritos()
  const siguiente = actuales.some((a) => a.id === ing.id)
    ? actuales.filter((a) => a.id !== ing.id)
    : [aGuardado(ing), ...actuales]
  localStorage.setItem(FAVORITOS_KEY, JSON.stringify(siguiente))
  return siguiente
}

/** Registra un alimento como reciente (el 80% de lo que come alguien se repite). */
export function registrarReciente(ing: AlimentoGuardado): AlimentoGuardado[] {
  const sinDuplicado = leerRecientes().filter((a) => a.id !== ing.id)
  const siguiente = [aGuardado(ing), ...sinDuplicado].slice(0, RECIENTES_MAX)
  localStorage.setItem(RECIENTES_KEY, JSON.stringify(siguiente))
  return siguiente
}
