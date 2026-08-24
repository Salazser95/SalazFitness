/**
 * Capa de datos de Nutricion. Todo lo que habla con el backend de wger, mas
 * los calculos de macros que se repiten en varias pantallas.
 *
 * Verificado contra el servidor real (ver docs/API-CONTRACT.md e informe del
 * agente):
 * - El plan (`nutritionplan`) tiene id UUID, no numerico.
 * - `nutritionplan/{id}/nutritional_values/` suma los `mealitem` (items de
 *   una plantilla planificada), NO los `nutritiondiary` (lo realmente
 *   comido). Con `only_logging: true` no hay mealitems, asi que ese
 *   endpoint siempre da 0. Por eso los totales del dia se calculan aqui,
 *   sumando manualmente los macros de cada entrada del diario.
 * - `nutritiondiary` no trae el alimento anidado: solo el id de
 *   `ingredient`. Hay que pedir los alimentos aparte con
 *   `?id__in=1,2,3`, que si esta soportado.
 * - Las "comidas" (Desayuno/Comida/Cena/Snacks) son objetos `meal` propios
 *   del plan (nombre libre, no un enum de wger). Se crean una vez, la
 *   primera vez que se usa la seccion, y se guarda cada entrada del diario
 *   con su `meal` correspondiente.
 */

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { api, fetchAll } from '../../lib/api'
import type { Paginated } from '../../lib/api'
import { escribirPlanActivoId, leerPlanActivoId, usePlanActivoId } from './local'

// ---------------------------------------------------------------- tipos

export type Ingredient = {
  id: number
  code: string | null
  name: string
  common_name: string | null
  brand: string | null
  /** Todos los macros que siguen son por 100 g. */
  energy: number
  protein: string
  carbohydrates: string
  carbohydrates_sugar: string | null
  fat: string
  fat_saturated: string | null
  fiber: string | null
  sodium: string | null
}

export type NutritionPlan = {
  id: string
  /** Fecha de creacion, YYYY-MM-DD. La asigna el servidor, solo lectura. */
  creation_date: string
  description: string
  only_logging: boolean
  goal_energy: number | null
  goal_protein: number | null
  goal_carbohydrates: number | null
  goal_fat: number | null
  goal_fiber: number | null
}

export type Meal = {
  id: string
  plan: string
  order: number
  time: string | null
  name: string
}

/** Un alimento dentro de la plantilla de una comida (`meal`). Distinto de una entrada del diario. */
export type MealItem = {
  id: string
  meal: string
  ingredient: number
  weight_unit: number | null
  order: number
  amount: string
}

export type MealConItems = Meal & { meal_items: MealItem[] }

export type NutritionPlanInfo = NutritionPlan & { meals: MealConItems[] }

export type DiaryEntry = {
  id: string
  plan: string
  meal: string | null
  ingredient: number
  weight_unit: number | null
  datetime: string
  amount: string
}

export type UserProfile = {
  calories: number | null
}

// ------------------------------------------------------ comidas fijas

// wger no tiene un enum de tipo de comida: son objetos `meal` con nombre
// libre. SalazFitness usa siempre estos cuatro, creandolos la primera vez.
export const MEAL_NAMES = ['Desayuno', 'Comida', 'Cena', 'Snacks'] as const
export type MealName = (typeof MEAL_NAMES)[number]

// ------------------------------------------------------------- macros

export type Macros = {
  energy: number
  protein: number
  carbohydrates: number
  fat: number
  fiber: number
}

const ZERO_MACROS: Macros = { energy: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 }

/**
 * Subconjunto minimo necesario para calcular macros. `Ingredient` (de la API)
 * y `AlimentoGuardado` (de `local.ts`, favoritos/recientes) cumplen ambos con
 * esta forma, asi que `macrosFor` sirve para los dos sin duplicar calculo.
 */
export type MacroFuente = Pick<Ingredient, 'energy' | 'protein' | 'carbohydrates' | 'fat' | 'fiber'>

/** Macros de una cantidad concreta (en gramos) de un alimento, cuyos datos vienen por 100 g. */
export function macrosFor(ing: MacroFuente, gramos: number): Macros {
  const f = gramos / 100
  return {
    energy: ing.energy * f,
    protein: Number(ing.protein) * f,
    carbohydrates: Number(ing.carbohydrates) * f,
    fat: Number(ing.fat) * f,
    fiber: ing.fiber ? Number(ing.fiber) * f : 0,
  }
}

export function sumMacros(lista: Macros[]): Macros {
  return lista.reduce(
    (acc, m) => ({
      energy: acc.energy + m.energy,
      protein: acc.protein + m.protein,
      carbohydrates: acc.carbohydrates + m.carbohydrates,
      fat: acc.fat + m.fat,
      fiber: acc.fiber + m.fiber,
    }),
    ZERO_MACROS,
  )
}

// ------------------------------------------------------------- claves

const keys = {
  planes: ['nutricion', 'planes'] as const,
  planInfo: (id: string | undefined) => ['nutricion', 'plan-info', id] as const,
  diario: (planId: string | undefined, fecha: string) =>
    ['nutricion', 'diario', planId, fecha] as const,
  ingredientes: (ids: number[]) => ['nutricion', 'ingredientes', ids] as const,
  perfil: ['nutricion', 'perfil'] as const,
  buscar: (texto: string) => ['nutricion', 'buscar', texto] as const,
}

// --------------------------------------------------------- consultas

async function fetchPlanes(): Promise<NutritionPlan[]> {
  return fetchAll<NutritionPlan>('/api/v2/nutritionplan/?ordering=-creation_date')
}

/** Todos los planes del usuario, mas recientes primero. Para el selector de plan activo. */
export function usePlanes() {
  return useQuery({
    queryKey: keys.planes,
    queryFn: fetchPlanes,
  })
}

/**
 * El plan activo: el guardado en `localStorage` (clave `salaz.nutricion.planActivoId`)
 * si todavia existe, si no el mas reciente. Comparte cache con `usePlanes()`.
 *
 * Ojo: NO se calcula con `select`. `select` en TanStack Query se memoriza segun la
 * identidad de `data`, y con `structuralSharing` (activo por defecto) esa identidad
 * se mantiene si el array de planes no cambio de verdad, aunque haya habido un
 * refetch. Y aunque se calculara en el cuerpo del hook a secas, TanStack Query solo
 * re-renderiza cuando cambia una propiedad que el componente leyo (`data`,
 * `isLoading`...) — como el plan activo depende de `localStorage`, no de eso, un
 * cambio de plan activo no forzaria un re-render. Por eso `activoId` viene de
 * `usePlanActivoId`, que se suscribe aparte con `useSyncExternalStore`.
 */
export function usePlan(): {
  data: NutritionPlan | null | undefined
  isLoading: boolean
  isError: boolean
  refetch: UseQueryResult<NutritionPlan[]>['refetch']
} {
  const planes = usePlanes()
  const activoId = usePlanActivoId()
  const data = planes.data
    ? (activoId && planes.data.find((p) => p.id === activoId)) || planes.data[0] || null
    : planes.data
  return {
    data,
    isLoading: planes.isLoading,
    isError: planes.isError,
    refetch: planes.refetch,
  }
}

export function usePlanInfo(planId: string | undefined) {
  return useQuery({
    queryKey: keys.planInfo(planId),
    queryFn: () => api.get<NutritionPlanInfo>(`/api/v2/nutritionplaninfo/${planId}/`),
    enabled: !!planId,
  })
}

export function useDiario(planId: string | undefined, fecha: string) {
  return useQuery({
    queryKey: keys.diario(planId, fecha),
    queryFn: async () => {
      const res = await api.get<Paginated<DiaryEntry>>(
        `/api/v2/nutritiondiary/?plan=${planId}&datetime__date=${fecha}&limit=200`,
      )
      return res.results
    },
    enabled: !!planId,
  })
}

/** Trae los alimentos de una lista de ids en una sola llamada (`id__in` funciona en wger). */
export function useIngredientesPorIds(ids: number[]) {
  const unicos = Array.from(new Set(ids)).sort((a, b) => a - b)
  return useQuery({
    queryKey: keys.ingredientes(unicos),
    queryFn: async () => {
      const res = await api.get<Paginated<Ingredient>>(
        `/api/v2/ingredient/?id__in=${unicos.join(',')}&limit=${unicos.length}`,
      )
      const mapa = new Map<number, Ingredient>()
      for (const ing of res.results) mapa.set(ing.id, ing)
      return mapa
    },
    enabled: unicos.length > 0,
  })
}

export function usePerfil() {
  return useQuery({
    queryKey: keys.perfil,
    queryFn: () => api.get<UserProfile>('/api/v2/userprofile/'),
  })
}

export function useBuscarIngredientes(texto: string) {
  const limpio = texto.trim()
  return useQuery({
    queryKey: keys.buscar(limpio),
    queryFn: async () => {
      const res = await api.get<Paginated<Ingredient>>(
        `/api/v2/ingredient/?name__search=${encodeURIComponent(limpio)}&limit=25`,
      )
      return res.results
    },
    enabled: limpio.length >= 2,
  })
}

// --------------------------------------------------------- mutaciones

/** Crea el plan (solo registro, sin dieta planificada) mas las cuatro comidas fijas. */
export function useCrearPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const perfil = await api.get<UserProfile>('/api/v2/userprofile/')
      const kcal = perfil.calories ?? 2200
      const plan = await api.post<NutritionPlan>('/api/v2/nutritionplan/', {
        description: 'Plan nutricional',
        only_logging: true,
        goal_energy: Math.round(kcal),
        goal_protein: Math.round((kcal * 0.3) / 4),
        goal_carbohydrates: Math.round((kcal * 0.4) / 4),
        goal_fat: Math.round((kcal * 0.3) / 9),
      })
      await Promise.all(
        MEAL_NAMES.map((name) => api.post('/api/v2/meal/', { plan: plan.id, name })),
      )
      escribirPlanActivoId(plan.id)
      return plan
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutricion'] }),
  })
}

function useCrearComidasFaltantes(planId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (faltantes: string[]) => {
      await Promise.all(
        faltantes.map((name) => api.post('/api/v2/meal/', { plan: planId, name })),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.planInfo(planId) }),
  })
}

/**
 * Se asegura de que existan las cuatro comidas fijas en el plan. Se llama
 * una vez por plan (guardado con un ref, para no duplicar aunque el efecto
 * se dispare varias veces en StrictMode).
 */
export function useAsegurarComidas(planInfo: NutritionPlanInfo | undefined): {
  listo: boolean
  creando: boolean
} {
  const mut = useCrearComidasFaltantes(planInfo?.id)
  const iniciadoRef = useRef(false)

  useEffect(() => {
    if (!planInfo) return
    const faltantes = MEAL_NAMES.filter((n) => !planInfo.meals.some((m) => m.name === n))
    if (faltantes.length === 0 || iniciadoRef.current) return
    iniciadoRef.current = true
    mut.mutate(faltantes)
  }, [planInfo, mut])

  const listo = !!planInfo && MEAL_NAMES.every((n) => planInfo.meals.some((m) => m.name === n))
  return { listo, creando: mut.isPending }
}

export function mapaComidas(planInfo: NutritionPlanInfo | undefined): Map<MealName, Meal> {
  const mapa = new Map<MealName, Meal>()
  if (!planInfo) return mapa
  for (const nombre of MEAL_NAMES) {
    const encontrada = planInfo.meals.find((m) => m.name === nombre)
    if (encontrada) mapa.set(nombre, encontrada)
  }
  return mapa
}

/** Un POST a nutritiondiary con la hora fija al mediodia (la app agrupa por comida, no por hora exacta). */
function postEntradaDiario(
  planId: string | undefined,
  fecha: string,
  input: { meal: string; ingredient: number; amount: number },
): Promise<DiaryEntry> {
  return api.post<DiaryEntry>('/api/v2/nutritiondiary/', {
    plan: planId,
    meal: input.meal,
    ingredient: input.ingredient,
    amount: input.amount,
    datetime: `${fecha}T12:00:00`,
  })
}

export function useAgregarAlimento(planId: string | undefined, fecha: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { meal: string; ingredient: number; amount: number }) =>
      postEntradaDiario(planId, fecha, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.diario(planId, fecha) }),
  })
}

/**
 * Anota de golpe todos los ingredientes de una receta (modulo compra) como
 * entradas del diario, dentro de una comida. Pensada para el boton "Anotar
 * en el diario" de RecetaDetalle. Reutiliza el mismo POST que
 * useAgregarAlimento (`postEntradaDiario`): no duplica la logica de resolver
 * el plan activo ni la de asegurar que existen las comidas, que siguen
 * resolviendose en el llamante con usePlan/usePlanInfo/useAsegurarComidas.
 */
export function useAnotarRecetaEnDiario(planId: string | undefined, fecha: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { meal: string; items: { ingredient: number; amount: number }[] }) => {
      await Promise.all(
        input.items.map((item) =>
          postEntradaDiario(planId, fecha, { meal: input.meal, ingredient: item.ingredient, amount: item.amount }),
        ),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.diario(planId, fecha) }),
  })
}

export function useEliminarEntrada(planId: string | undefined, fecha: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/v2/nutritiondiary/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.diario(planId, fecha) }),
  })
}

export type ActualizarPlanInput = {
  id: string
  goal_energy?: number | null
  goal_protein?: number | null
  goal_carbohydrates?: number | null
  goal_fat?: number | null
  goal_fiber?: number | null
}

export function useActualizarPlan(): UseMutationResult<
  NutritionPlan,
  Error,
  ActualizarPlanInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ActualizarPlanInput) =>
      api.patch<NutritionPlan>(`/api/v2/nutritionplan/${id}/`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutricion'] }),
  })
}

export function useBuscarPorCodigo() {
  return useMutation({
    mutationFn: async (codigo: string) => {
      const res = await api.get<Paginated<Ingredient>>(
        `/api/v2/ingredient/?code=${encodeURIComponent(codigo)}`,
      )
      return res.results[0] ?? null
    },
  })
}

// ------------------------------------------------------- varios planes

/** Marca un plan como activo (preferencia local) y refresca `usePlan`/`usePlanes`. */
export function useElegirPlanActivo(): (id: string) => void {
  // No hace falta invalidar nada: no cambia ningun dato del servidor. Basta
  // con escribir la preferencia; `escribirPlanActivoId` ya avisa a `usePlan`.
  return (id: string) => escribirPlanActivoId(id)
}

/**
 * Borra un plan. Verificado contra el servidor real: DELETE en cascada borra
 * tambien sus `meal` y, a diferencia de borrar solo una `meal`, TAMBIEN borra
 * las entradas de `nutritiondiary` de ese plan (no las deja huerfanas). Es
 * decir, borra el registro diario completo del plan, no solo la plantilla.
 */
export function useEliminarPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/v2/nutritionplan/${id}/`),
    onSuccess: (_data, id) => {
      if (leerPlanActivoId() === id) escribirPlanActivoId(null)
      qc.invalidateQueries({ queryKey: ['nutricion'] })
    },
  })
}

/**
 * Crea un plan nuevo a partir de otro: mismos objetivos de macros y mismas
 * comidas (con los mismos alimentos dentro, si los tenia). El plan nuevo
 * queda como activo.
 */
export function useDuplicarPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (origenId: string) => {
      const origen = await api.get<NutritionPlanInfo>(
        `/api/v2/nutritionplaninfo/${origenId}/?format=json`,
      )
      const nuevo = await api.post<NutritionPlan>('/api/v2/nutritionplan/', {
        description: `${origen.description} (copia)`.slice(0, 80),
        only_logging: origen.only_logging,
        goal_energy: origen.goal_energy,
        goal_protein: origen.goal_protein,
        goal_carbohydrates: origen.goal_carbohydrates,
        goal_fat: origen.goal_fat,
        goal_fiber: origen.goal_fiber,
      })
      for (const meal of origen.meals) {
        const nuevaComida = await api.post<Meal>('/api/v2/meal/', {
          plan: nuevo.id,
          name: meal.name,
          time: meal.time,
        })
        await Promise.all(
          meal.meal_items.map((item) =>
            api.post('/api/v2/mealitem/', {
              meal: nuevaComida.id,
              ingredient: item.ingredient,
              weight_unit: item.weight_unit,
              amount: item.amount,
            }),
          ),
        )
      }
      escribirPlanActivoId(nuevo.id)
      return nuevo
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutricion'] }),
  })
}

// ------------------------------------------------- comidas de la plantilla

/** Renombra una comida del plan (Desayuno, Comida...). No toca sus alimentos. */
export function useActualizarComida(planId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Meal>(`/api/v2/meal/${id}/`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.planInfo(planId) }),
  })
}

/**
 * Borra una comida entera (borra en cascada sus `mealitem`). Verificado: las
 * entradas de `nutritiondiary` que apuntaban a esta comida NO se borran, se
 * quedan con `meal: null` (dejan de aparecer agrupadas, pero no se pierden).
 */
export function useEliminarComida(planId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/v2/meal/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.planInfo(planId) }),
  })
}

// --------------------------------------------------------- copiar un dia

/** Copia las entradas del diario de `fechaOrigen` a `fechaDestino` (mismo plan). */
export function useCopiarDia(planId: string | undefined, fechaDestino: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fechaOrigen: string) => {
      const res = await api.get<Paginated<DiaryEntry>>(
        `/api/v2/nutritiondiary/?plan=${planId}&datetime__date=${fechaOrigen}&limit=200`,
      )
      await Promise.all(
        res.results.map((entrada) =>
          api.post('/api/v2/nutritiondiary/', {
            plan: planId,
            meal: entrada.meal,
            ingredient: entrada.ingredient,
            weight_unit: entrada.weight_unit,
            amount: entrada.amount,
            datetime: `${fechaDestino}T12:00:00`,
          }),
        ),
      )
      return res.results.length
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.diario(planId, fechaDestino) }),
  })
}
