import { useQuery } from '@tanstack/react-query'

import { api, fetchAll } from '../../lib/api'
import { today } from '../../lib/format'

/**
 * Datos propios de "Hoy" que no viven ya en features/entreno/api.ts ni en
 * features/yo/api.ts: solo el plan nutricional y las calorias de hoy.
 *
 * Verificado contra el servidor real (login admin/adminadmin,
 * http://127.0.0.1:8000):
 * - GET /api/v2/nutritionplan/ SI esta paginado (a diferencia de userprofile)
 *   y el `id` es UUID (string), igual que measurement-category.
 * - GET /api/v2/nutritiondiary/ admite el filtro `datetime__date=YYYY-MM-DD`
 *   (no esta en docs/API-CONTRACT.md, comprobado contra el esquema OpenAPI en
 *   .recon/openapi.json) y `plan=<uuid>`.
 * - Un registro del diario (LogItem) NO trae las calorias: solo
 *   `ingredient` (id numerico) y `amount` (gramos). Las calorias por 100 g
 *   viven en GET /api/v2/ingredient/{id}/ como `energy`.
 */

export type NutritionPlan = {
  id: string
  description: string
  start: string
  end: string
  only_logging: boolean
  goal_energy: number | null
}

export type DiaryLogItem = {
  id: string
  plan: string
  ingredient: number
  amount: string
  datetime: string
}

export function useNutritionPlans() {
  return useQuery({
    queryKey: ['hoy', 'nutrition-plans'],
    queryFn: () => fetchAll<NutritionPlan>('/api/v2/nutritionplan/'),
  })
}

/** El plan nutricional vigente: start <= hoy <= end. Si hay varios, el mas reciente. */
export function pickActivePlan(plans: NutritionPlan[]): NutritionPlan | null {
  const hoy = today()
  const vigentes = plans.filter((p) => p.start <= hoy && hoy <= p.end)
  if (vigentes.length === 0) return null
  return [...vigentes].sort((a, b) => (a.start < b.start ? 1 : -1))[0]
}

const cacheEnergiaIngrediente = new Map<number, number>()

async function energiaDeIngrediente(ingredientId: number): Promise<number> {
  const cacheado = cacheEnergiaIngrediente.get(ingredientId)
  if (cacheado !== undefined) return cacheado
  try {
    const ing = await api.get<{ energy: number | null }>(`/api/v2/ingredient/${ingredientId}/`)
    const energia = ing.energy ?? 0
    cacheEnergiaIngrediente.set(ingredientId, energia)
    return energia
  } catch {
    return 0
  }
}

/** Suma de kcal registradas hoy en el diario del plan dado. Null si no hay plan. */
export function useCaloriasHoy(planId: string | null) {
  const fecha = today()
  return useQuery({
    queryKey: ['hoy', 'calorias', planId, fecha],
    queryFn: async () => {
      const entradas = await fetchAll<DiaryLogItem>(
        `/api/v2/nutritiondiary/?plan=${planId}&datetime__date=${fecha}`,
      )
      if (entradas.length === 0) return 0

      const ids = Array.from(new Set(entradas.map((e) => e.ingredient)))
      const energias = new Map(
        await Promise.all(ids.map(async (id) => [id, await energiaDeIngrediente(id)] as const)),
      )

      const total = entradas.reduce((suma, e) => {
        const energia100g = energias.get(e.ingredient) ?? 0
        return suma + (Number(e.amount) / 100) * energia100g
      }, 0)
      return Math.round(total)
    },
    enabled: planId !== null,
  })
}
