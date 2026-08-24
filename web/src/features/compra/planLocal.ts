/**
 * Planificacion semanal/quincenal de recetas: que receta toca cada dia, y de
 * que recetas sale cada ingrediente de la ultima lista generada desde el
 * planificador. Todo esto NO existe en el backend (ni en wger ni en el modulo
 * salaz): es almacenamiento local, PENDIENTE DE BACKEND. Cuando exista un
 * endpoint propio de planificacion, esta es la unica capa que hay que tocar:
 * PlanificarPage, DiarioPage y ListaPage ya llaman a estas funciones, no a
 * `localStorage` directamente.
 *
 * Enlaza nutricion y compra: DiarioPage (nutricion) lee `recetaDelDia` para
 * ofrecer "Anotar la receta de hoy", y ListaPage (compra) lee
 * `origenesDeIngrediente` para mostrar de que recetas sale cada linea.
 */

import { useSyncExternalStore } from 'react'

const PLAN_KEY = 'salaz.plan.semana'

export type RecetaEnPlan = {
  recipeId: number
  recipeName: string
  /** Cuantas tandas de esta receta entraron en la ultima lista generada. */
  tandas: number
}

export type AsignacionDia = {
  fecha: string // YYYY-MM-DD
  recipeId: number
  recipeName: string
}

export type PlanSemana = {
  household: number
  inicio: string // YYYY-MM-DD
  fin: string // YYYY-MM-DD
  seleccion: RecetaEnPlan[]
  /** Que receta toca comer cada dia del rango (solo los dias que el usuario asigno). */
  porDia: AsignacionDia[]
  /** Id de ingrediente de wger -> nombres de las recetas de las que sale, en la ultima lista generada. */
  origenPorIngrediente: Record<number, string[]>
}

type Listener = () => void
const listeners = new Set<Listener>()

// Cache del ultimo `raw` leido y su parseo. Imprescindible para
// `useSyncExternalStore`: su `getSnapshot` (aqui `leerPlanSemana`) tiene que
// devolver la MISMA referencia si el dato no cambio, o React entra en bucle
// infinito de render (`JSON.parse` crea un objeto nuevo en cada llamada, y
// React compara por referencia). Verificado en el navegador: sin cache,
// "Maximum update depth exceeded" en cuanto usePlanSemana se monta.
let cacheRaw: string | null | undefined
let cacheValor: PlanSemana | null = null

export function leerPlanSemana(): PlanSemana | null {
  const raw = localStorage.getItem(PLAN_KEY)
  if (raw === cacheRaw) return cacheValor

  let valor: PlanSemana | null = null
  try {
    valor = raw ? (JSON.parse(raw) as PlanSemana) : null
  } catch {
    valor = null
  }
  cacheRaw = raw
  cacheValor = valor
  return valor
}

export function escribirPlanSemana(plan: PlanSemana): void {
  localStorage.setItem(PLAN_KEY, JSON.stringify(plan))
  for (const l of listeners) l()
}

function suscribirPlanSemana(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** El plan guardado, re-renderizando el componente si cambia (mismo patron que usePlanActivoId de nutricion/local.ts). */
export function usePlanSemana(): PlanSemana | null {
  return useSyncExternalStore(suscribirPlanSemana, leerPlanSemana, () => null)
}

/** La receta asignada a una fecha concreta del plan guardado, o null si ese dia no tiene ninguna. */
export function recetaDelDia(plan: PlanSemana | null, fecha: string): AsignacionDia | null {
  if (!plan) return null
  return plan.porDia.find((a) => a.fecha === fecha) ?? null
}

/** Nombres de las recetas de las que sale un ingrediente, segun el ultimo plan generado. Vacio si no hay dato. */
export function origenesDeIngrediente(plan: PlanSemana | null, ingredientId: number | null): string[] {
  if (!plan || ingredientId === null) return []
  return plan.origenPorIngrediente[ingredientId] ?? []
}
