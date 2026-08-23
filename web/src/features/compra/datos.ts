/**
 * Capa de datos del modulo de compra.
 *
 * BACKEND_LISTO controla todo: en `false` (estado actual, mientras el otro
 * agente construye `/api/v2/salaz/` en paralelo) sirve datos de ejemplo desde
 * un almacen en memoria; en `true` llama a la API real. El dia que el
 * backend este listo, cambiar solo esta constante.
 *
 * Excepcion: la busqueda de alimentos (`buscarIngredientesWger`) llama
 * siempre al endpoint real de wger `GET /api/v2/ingredient/?name__search=`,
 * que ya existe y esta verificado en API-CONTRACT.md. No depende de
 * BACKEND_LISTO porque no es parte del modulo nuevo.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, fetchAll, type Paginated } from '../../lib/api'
import { today } from '../../lib/format'
import { costeIngredienteCentimos, eurosACentimos, repartoCompra, sumarCentimos } from './calculo'
import type {
  GenerarListaPayload,
  Household,
  HouseholdMember,
  HouseholdSummary,
  IngredientWger,
  Purchase,
  PurchaseBreakdown,
  PurchaseItem,
  Recipe,
  RecipeCost,
  RecipeIngredient,
  ShoppingList,
  ShoppingListItem,
} from './tipos'

export const BACKEND_LISTO = true

const BASE = '/api/v2/salaz'

// ================================================================
// Busqueda de alimentos contra wger (siempre real, ver nota de arriba)
// ================================================================

export function useBuscarIngredientesWger(texto: string) {
  const query = texto.trim()
  return useQuery({
    queryKey: ['wger', 'ingredient-search', query],
    queryFn: async () => {
      const pagina = await api.get<Paginated<IngredientWger>>(
        `/api/v2/ingredient/?name__search=${encodeURIComponent(query)}&limit=15`,
      )
      return pagina.results
    },
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  })
}

// ================================================================
// Almacen de ejemplo en memoria (BACKEND_LISTO = false)
// ================================================================

type IngredienteMock = {
  id: number
  name: string
  energyPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
  precioCentimosPorKg: number
}

// Ids altos (9000+) para no chocar nunca con ids reales de wger.
const INGREDIENTES_MOCK: IngredienteMock[] = [
  { id: 9001, name: 'Pechuga de pollo', energyPer100: 165, proteinPer100: 31, carbsPer100: 0, fatPer100: 3.6, precioCentimosPorKg: 650 },
  { id: 9002, name: 'Arroz blanco', energyPer100: 130, proteinPer100: 2.7, carbsPer100: 28, fatPer100: 0.3, precioCentimosPorKg: 120 },
  { id: 9003, name: 'Aceite de oliva virgen extra', energyPer100: 884, proteinPer100: 0, carbsPer100: 0, fatPer100: 100, precioCentimosPorKg: 780 },
  { id: 9004, name: 'Brocoli', energyPer100: 34, proteinPer100: 2.8, carbsPer100: 7, fatPer100: 0.4, precioCentimosPorKg: 250 },
  { id: 9005, name: 'Huevo', energyPer100: 155, proteinPer100: 13, carbsPer100: 1.1, fatPer100: 11, precioCentimosPorKg: 320 },
  { id: 9006, name: 'Avena', energyPer100: 389, proteinPer100: 17, carbsPer100: 66, fatPer100: 7, precioCentimosPorKg: 210 },
  { id: 9007, name: 'Platano', energyPer100: 89, proteinPer100: 1.1, carbsPer100: 23, fatPer100: 0.3, precioCentimosPorKg: 190 },
  { id: 9008, name: 'Atun en lata', energyPer100: 116, proteinPer100: 26, carbsPer100: 0, fatPer100: 1, precioCentimosPorKg: 900 },
]

function ingredienteMock(id: number): IngredienteMock | null {
  return INGREDIENTES_MOCK.find((i) => i.id === id) ?? null
}

let contador = 9000

function siguienteId(): number {
  contador += 1
  return contador
}

const almacen = {
  households: [{ id: 1, name: 'Casa Salaz', members: [] as HouseholdMember[] }] as Household[],
  members: [
    { id: 1, household: 1, name: 'Alex', consumption_share: 60 },
    { id: 2, household: 1, name: 'Sam', consumption_share: 40 },
  ] as HouseholdMember[],
  purchases: [
    { id: 1, household: 1, date: '2026-08-18', description: 'Compra semanal', supermarket: 'Mercadona', covers_days: 7 },
    { id: 2, household: 1, date: '2026-08-11', description: 'Compra semanal', supermarket: 'Lidl', covers_days: 7 },
    { id: 3, household: 1, date: '2026-08-04', description: 'Compra semanal', supermarket: 'Mercadona', covers_days: 7 },
    { id: 4, household: 1, date: '2026-07-28', description: 'Compra grande', supermarket: 'Carrefour', covers_days: 10 },
    { id: 5, household: 1, date: '2026-07-21', description: 'Compra semanal', supermarket: 'Mercadona', covers_days: 7 },
  ] as Purchase[],
  purchaseItems: [
    // Compra 1
    { id: 1, purchase: 1, ingredient: 9001, name: 'Pechuga de pollo', amount: 1.5, unit: 'kg', price: '9.75', is_shared: true, member: null },
    { id: 2, purchase: 1, ingredient: 9002, name: 'Arroz blanco', amount: 2, unit: 'kg', price: '2.40', is_shared: true, member: null },
    { id: 3, purchase: 1, ingredient: null, name: 'Verduras varias', amount: 1, unit: 'lote', price: '8.90', is_shared: true, member: null },
    { id: 4, purchase: 1, ingredient: null, name: 'Proteina en polvo', amount: 1, unit: 'ud', price: '24.90', is_shared: false, member: 1 },
    { id: 5, purchase: 1, ingredient: null, name: 'Maquinillas de afeitar', amount: 1, unit: 'ud', price: '5.60', is_shared: false, member: 2 },
    // Compra 2
    { id: 6, purchase: 2, ingredient: 9008, name: 'Atun en lata', amount: 6, unit: 'ud', price: '7.20', is_shared: true, member: null },
    { id: 7, purchase: 2, ingredient: 9006, name: 'Avena', amount: 1, unit: 'kg', price: '2.10', is_shared: true, member: null },
    { id: 8, purchase: 2, ingredient: null, name: 'Fruta variada', amount: 1, unit: 'lote', price: '11.30', is_shared: true, member: null },
    { id: 9, purchase: 2, ingredient: null, name: 'Champu', amount: 1, unit: 'ud', price: '4.20', is_shared: false, member: 1 },
    // Compra 3
    { id: 10, purchase: 3, ingredient: 9001, name: 'Pechuga de pollo', amount: 1, unit: 'kg', price: '6.50', is_shared: true, member: null },
    { id: 11, purchase: 3, ingredient: 9004, name: 'Brocoli', amount: 1, unit: 'kg', price: '2.50', is_shared: true, member: null },
    { id: 12, purchase: 3, ingredient: 9005, name: 'Huevos', amount: 2, unit: 'docena', price: '6.40', is_shared: true, member: null },
    { id: 13, purchase: 3, ingredient: null, name: 'Suplemento vitaminas', amount: 1, unit: 'ud', price: '12.00', is_shared: false, member: 2 },
    // Compra 4 (grande, 10 dias)
    { id: 14, purchase: 4, ingredient: 9002, name: 'Arroz blanco', amount: 5, unit: 'kg', price: '6.00', is_shared: true, member: null },
    { id: 15, purchase: 4, ingredient: 9003, name: 'Aceite de oliva', amount: 1, unit: 'l', price: '7.80', is_shared: true, member: null },
    { id: 16, purchase: 4, ingredient: null, name: 'Congelados varios', amount: 1, unit: 'lote', price: '18.50', is_shared: true, member: null },
    { id: 17, purchase: 4, ingredient: null, name: 'Limpieza del hogar', amount: 1, unit: 'lote', price: '15.20', is_shared: true, member: null },
    // Compra 5
    { id: 18, purchase: 5, ingredient: 9007, name: 'Platanos', amount: 1.2, unit: 'kg', price: '2.28', is_shared: true, member: null },
    { id: 19, purchase: 5, ingredient: 9001, name: 'Pechuga de pollo', amount: 1, unit: 'kg', price: '6.50', is_shared: true, member: null },
    { id: 20, purchase: 5, ingredient: null, name: 'Ropa deportiva', amount: 1, unit: 'ud', price: '22.00', is_shared: false, member: 1 },
  ] as PurchaseItem[],
  recipes: [
    { id: 1, household: 1, name: 'Pollo con arroz y brocoli', servings: 4, instructions: 'Cocer el arroz. Saltear el pollo en dados. Hervir el brocoli al vapor. Mezclar y servir.' },
    { id: 2, household: 1, name: 'Tortilla de avena y platano', servings: 2, instructions: 'Batir los huevos con la avena. Anadir el platano en rodajas. Cuajar en la sarten a fuego medio.' },
    { id: 3, household: 1, name: 'Ensalada de atun', servings: 2, instructions: 'Mezclar el atun escurrido con el brocoli cocido y un chorro de aceite de oliva.' },
  ] as Recipe[],
  recipeIngredients: [
    { id: 1, recipe: 1, ingredient: 9001, amount: 600 },
    { id: 2, recipe: 1, ingredient: 9002, amount: 400 },
    { id: 3, recipe: 1, ingredient: 9004, amount: 300 },
    { id: 4, recipe: 1, ingredient: 9003, amount: 20 },
    { id: 5, recipe: 2, ingredient: 9005, amount: 240 },
    { id: 6, recipe: 2, ingredient: 9006, amount: 160 },
    { id: 7, recipe: 2, ingredient: 9007, amount: 200 },
    { id: 8, recipe: 3, ingredient: 9008, amount: 240 },
    { id: 9, recipe: 3, ingredient: 9004, amount: 200 },
    { id: 10, recipe: 3, ingredient: 9003, amount: 15 },
  ] as RecipeIngredient[],
  shoppingLists: [
    { id: 1, household: 1, name: 'Lista de la semana', start_date: '2026-08-22', end_date: '2026-08-28' },
  ] as ShoppingList[],
  shoppingListItems: [
    { id: 1, shopping_list: 1, ingredient: 9001, name: 'Pechuga de pollo', amount: 1.2, unit: 'kg', estimated_price: '7.80', purchased: true, supermarket: 'Mercadona' },
    { id: 2, shopping_list: 1, ingredient: 9002, name: 'Arroz blanco', amount: 1, unit: 'kg', estimated_price: '1.20', purchased: true, supermarket: 'Mercadona' },
    { id: 3, shopping_list: 1, ingredient: 9004, name: 'Brocoli', amount: 0.6, unit: 'kg', estimated_price: '1.50', purchased: false, supermarket: null },
    { id: 4, shopping_list: 1, ingredient: 9005, name: 'Huevos', amount: 1, unit: 'docena', estimated_price: '3.20', purchased: false, supermarket: null },
    { id: 5, shopping_list: 1, ingredient: null, name: 'Papel de cocina', amount: 1, unit: 'ud', estimated_price: '2.50', purchased: false, supermarket: null },
  ] as ShoppingListItem[],
}

async function retraso<T>(valor: T): Promise<T> {
  // Simula la latencia minima de una llamada real para que los esqueletos
  // de carga sean visibles y el codigo se comporte igual al cambiar a la API real.
  await new Promise((r) => setTimeout(r, 120))
  return valor
}

// -------------------------------------------------------- claves de cache

const claves = {
  household: ['compra', 'household'] as const,
  purchases: (householdId: number) => ['compra', 'purchases', householdId] as const,
  purchase: (id: number) => ['compra', 'purchase', id] as const,
  purchaseItems: (purchaseId: number) => ['compra', 'purchase-items', purchaseId] as const,
  breakdown: (id: number) => ['compra', 'breakdown', id] as const,
  summary: (householdId: number, days: number) => ['compra', 'summary', householdId, days] as const,
  recipes: (householdId: number) => ['compra', 'recipes', householdId] as const,
  recipe: (id: number) => ['compra', 'recipe', id] as const,
  recipeIngredients: (recipeId: number) => ['compra', 'recipe-ingredients', recipeId] as const,
  recipeCost: (id: number) => ['compra', 'recipe-cost', id] as const,
  costeMedioComida: (householdId: number) => ['compra', 'coste-medio-comida', householdId] as const,
  shoppingList: (householdId: number) => ['compra', 'shopping-list', householdId] as const,
  shoppingListItems: (listId: number) => ['compra', 'shopping-list-items', listId] as const,
}

// ================================================================
// Hogar
// ================================================================

async function cargarHousehold(): Promise<Household> {
  if (BACKEND_LISTO) {
    const paginas = await fetchAll<Household>(`${BASE}/household/`)
    const hogar = paginas[0] ?? (await api.post<Household>(`${BASE}/household/`, { name: 'Mi hogar' }))
    // No se confia en que `members` venga anidado en el household: se pide
    // aparte, igual que el resto de listados filtrados por household.
    const miembros = await fetchAll<HouseholdMember>(`${BASE}/household-member/?household=${hogar.id}`)
    return { ...hogar, members: miembros }
  }
  const hogar = almacen.households[0]!
  return retraso({ ...hogar, members: almacen.members.filter((m) => m.household === hogar.id) })
}

export function useHousehold() {
  return useQuery({ queryKey: claves.household, queryFn: cargarHousehold })
}

export function useActualizarReparto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { id: number; consumption_share: number }[]) => {
      if (BACKEND_LISTO) {
        await Promise.all(
          updates.map((u) => api.patch(`${BASE}/household-member/${u.id}/`, { consumption_share: u.consumption_share })),
        )
        return
      }
      for (const u of updates) {
        const miembro = almacen.members.find((m) => m.id === u.id)
        if (miembro) miembro.consumption_share = u.consumption_share
      }
      await retraso(null)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.household }),
  })
}

// ================================================================
// Compras
// ================================================================

async function cargarCompras(householdId: number): Promise<Purchase[]> {
  if (BACKEND_LISTO) return fetchAll<Purchase>(`${BASE}/purchase/?household=${householdId}`)
  return retraso(
    almacen.purchases
      .filter((p) => p.household === householdId)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  )
}

export function usePurchases(householdId: number) {
  return useQuery({
    queryKey: claves.purchases(householdId),
    queryFn: () => cargarCompras(householdId),
    enabled: householdId > 0,
  })
}

async function cargarCompra(id: number): Promise<Purchase> {
  if (BACKEND_LISTO) return api.get<Purchase>(`${BASE}/purchase/${id}/`)
  const compra = almacen.purchases.find((p) => p.id === id)
  if (!compra) throw new Error('Compra no encontrada')
  return retraso(compra)
}

export function usePurchase(id: number) {
  return useQuery({ queryKey: claves.purchase(id), queryFn: () => cargarCompra(id), enabled: id > 0 })
}

async function cargarLineas(purchaseId: number): Promise<PurchaseItem[]> {
  if (BACKEND_LISTO) return fetchAll<PurchaseItem>(`${BASE}/purchase-item/?purchase=${purchaseId}`)
  return retraso(almacen.purchaseItems.filter((i) => i.purchase === purchaseId))
}

export function usePurchaseItems(purchaseId: number) {
  return useQuery({
    queryKey: claves.purchaseItems(purchaseId),
    queryFn: () => cargarLineas(purchaseId),
    enabled: purchaseId > 0,
  })
}

/** Compras con su total ya sumado, para la lista (evita recalcular en cada tarjeta). */
export function usePurchasesConTotal(householdId: number) {
  const compras = usePurchases(householdId)
  return useQuery({
    queryKey: ['compra', 'purchases-total', householdId, compras.data?.length ?? 0],
    queryFn: async () => {
      const lista = compras.data ?? []
      const conTotal = await Promise.all(
        lista.map(async (compra) => {
          const lineas = await cargarLineas(compra.id)
          return { compra, totalCentimos: sumarCentimos(lineas.map((l) => eurosACentimos(l.price))) }
        }),
      )
      return conTotal
    },
    enabled: compras.isSuccess,
  })
}

export type NuevaLinea = Omit<PurchaseItem, 'id' | 'purchase'>

export function useCrearCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { cabecera: Omit<Purchase, 'id'>; lineas: NuevaLinea[] }) => {
      if (BACKEND_LISTO) {
        const compra = await api.post<Purchase>(`${BASE}/purchase/`, input.cabecera)
        await Promise.all(
          input.lineas.map((linea) => api.post(`${BASE}/purchase-item/`, { ...linea, purchase: compra.id })),
        )
        return compra
      }
      const id = siguienteId()
      const compra: Purchase = { id, ...input.cabecera }
      almacen.purchases.push(compra)
      for (const linea of input.lineas) {
        almacen.purchaseItems.push({ id: siguienteId(), purchase: id, ...linea })
      }
      return retraso(compra)
    },
    onSuccess: (compra) => {
      qc.invalidateQueries({ queryKey: claves.purchases(compra.household) })
      qc.invalidateQueries({ queryKey: claves.summary(compra.household, 30) })
    },
  })
}

async function cargarBreakdown(id: number): Promise<PurchaseBreakdown> {
  if (BACKEND_LISTO) return api.get<PurchaseBreakdown>(`${BASE}/purchase/${id}/breakdown/`)

  const compra = almacen.purchases.find((p) => p.id === id)
  if (!compra) throw new Error('Compra no encontrada')
  const lineas = almacen.purchaseItems.filter((i) => i.purchase === id)
  const miembros = almacen.members.filter((m) => m.household === compra.household)

  const reparto = repartoCompra(lineas, miembros)
  const totalCentimos = sumarCentimos(lineas.map((l) => eurosACentimos(l.price)))
  const compartidoCentimos = sumarCentimos(lineas.filter((l) => l.is_shared).map((l) => eurosACentimos(l.price)))
  const individualCentimos = totalCentimos - compartidoCentimos

  return retraso({
    total: (totalCentimos / 100).toFixed(2),
    cost_per_day: (totalCentimos / 100 / Math.max(1, compra.covers_days)).toFixed(2),
    cost_per_person: reparto.map((r) => ({
      member: r.member,
      name: r.name,
      share: r.share,
      amount: (r.amountCentimos / 100).toFixed(2),
    })),
    shared_total: (compartidoCentimos / 100).toFixed(2),
    individual_total: (individualCentimos / 100).toFixed(2),
  })
}

export function usePurchaseBreakdown(id: number) {
  return useQuery({ queryKey: claves.breakdown(id), queryFn: () => cargarBreakdown(id), enabled: id > 0 })
}

// ================================================================
// Resumen del hogar
// ================================================================

async function cargarResumen(householdId: number, days: number): Promise<HouseholdSummary> {
  if (BACKEND_LISTO) return api.get<HouseholdSummary>(`${BASE}/household/${householdId}/summary/?days=${days}`)

  const limite = new Date()
  limite.setDate(limite.getDate() - days)
  const limiteIso = limite.toISOString().slice(0, 10)

  const compras = almacen.purchases.filter((p) => p.household === householdId && p.date >= limiteIso)
  const idsCompras = new Set(compras.map((c) => c.id))
  const lineas = almacen.purchaseItems.filter((i) => idsCompras.has(i.purchase))
  const miembros = almacen.members.filter((m) => m.household === householdId)

  const reparto = repartoCompra(lineas, miembros)
  const totalCentimos = sumarCentimos(lineas.map((l) => eurosACentimos(l.price)))

  return retraso({
    total: (totalCentimos / 100).toFixed(2),
    per_person: reparto.map((r) => ({ member: r.member, name: r.name, amount: (r.amountCentimos / 100).toFixed(2) })),
    daily: (totalCentimos / 100 / Math.max(1, days)).toFixed(2),
    weekly: (totalCentimos / 100 / Math.max(1, days) * 7).toFixed(2),
    biweekly: (totalCentimos / 100 / Math.max(1, days) * 14).toFixed(2),
    monthly: (totalCentimos / 100 / Math.max(1, days) * 30).toFixed(2),
  })
}

export function useHouseholdSummary(householdId: number, days: number) {
  return useQuery({
    queryKey: claves.summary(householdId, days),
    queryFn: () => cargarResumen(householdId, days),
    enabled: householdId > 0,
  })
}

/** Serie semanal de gasto, para la grafica de evolucion. Siempre calculada en el cliente. */
export function useGastoSemanal(householdId: number) {
  const compras = usePurchases(householdId)
  return useQuery({
    queryKey: ['compra', 'gasto-semanal', householdId, compras.data?.length ?? 0],
    queryFn: async () => {
      const lista = compras.data ?? []
      const porSemana = new Map<string, number>()
      for (const compra of lista) {
        const lineas = BACKEND_LISTO
          ? await fetchAll<PurchaseItem>(`${BASE}/purchase-item/?purchase=${compra.id}`)
          : almacen.purchaseItems.filter((i) => i.purchase === compra.id)
        const totalCompra = sumarCentimos(lineas.map((l) => eurosACentimos(l.price)))
        const clave = inicioDeSemana(compra.date)
        porSemana.set(clave, (porSemana.get(clave) ?? 0) + totalCompra)
      }
      return [...porSemana.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([semana, centimos]) => ({ semana, totalCentimos: centimos }))
    },
    enabled: compras.isSuccess,
  })
}

function inicioDeSemana(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = (d.getDay() + 6) % 7 // lunes = 0
  d.setDate(d.getDate() - dow)
  return d.toISOString().slice(0, 10)
}

// ================================================================
// Recetas
// ================================================================

async function cargarRecetas(householdId: number): Promise<Recipe[]> {
  if (BACKEND_LISTO) return fetchAll<Recipe>(`${BASE}/recipe/?household=${householdId}`)
  return retraso(almacen.recipes.filter((r) => r.household === householdId))
}

export function useRecipes(householdId: number) {
  return useQuery({ queryKey: claves.recipes(householdId), queryFn: () => cargarRecetas(householdId), enabled: householdId > 0 })
}

async function cargarReceta(id: number): Promise<Recipe> {
  if (BACKEND_LISTO) return api.get<Recipe>(`${BASE}/recipe/${id}/`)
  const receta = almacen.recipes.find((r) => r.id === id)
  if (!receta) throw new Error('Receta no encontrada')
  return retraso(receta)
}

export function useRecipe(id: number) {
  return useQuery({ queryKey: claves.recipe(id), queryFn: () => cargarReceta(id), enabled: id > 0 })
}

async function cargarIngredientesReceta(recipeId: number): Promise<RecipeIngredient[]> {
  if (BACKEND_LISTO) return fetchAll<RecipeIngredient>(`${BASE}/recipe-ingredient/?recipe=${recipeId}`)
  return retraso(almacen.recipeIngredients.filter((ri) => ri.recipe === recipeId))
}

export function useRecipeIngredients(recipeId: number) {
  return useQuery({
    queryKey: claves.recipeIngredients(recipeId),
    queryFn: () => cargarIngredientesReceta(recipeId),
    enabled: recipeId > 0,
  })
}

async function cargarCosteReceta(id: number): Promise<RecipeCost> {
  if (BACKEND_LISTO) return api.get<RecipeCost>(`${BASE}/recipe/${id}/cost/`)

  const receta = almacen.recipes.find((r) => r.id === id)
  if (!receta) throw new Error('Receta no encontrada')
  const ingredientes = almacen.recipeIngredients.filter((ri) => ri.recipe === id)

  let totalCentimos = 0
  let energy = 0
  let protein = 0
  let carbohydrates = 0
  let fat = 0

  for (const ri of ingredientes) {
    const info = ingredienteMock(ri.ingredient)
    if (!info) continue
    totalCentimos += costeIngredienteCentimos(ri.amount, info.precioCentimosPorKg)
    energy += (info.energyPer100 * ri.amount) / 100
    protein += (info.proteinPer100 * ri.amount) / 100
    carbohydrates += (info.carbsPer100 * ri.amount) / 100
    fat += (info.fatPer100 * ri.amount) / 100
  }

  const raciones = Math.max(1, receta.servings)
  return retraso({
    total_cost: (totalCentimos / 100).toFixed(2),
    cost_per_serving: (totalCentimos / raciones / 100).toFixed(2),
    energy: Math.round(energy / raciones),
    protein: Math.round((protein / raciones) * 10) / 10,
    carbohydrates: Math.round((carbohydrates / raciones) * 10) / 10,
    fat: Math.round((fat / raciones) * 10) / 10,
  })
}

export function useRecipeCost(id: number) {
  return useQuery({ queryKey: claves.recipeCost(id), queryFn: () => cargarCosteReceta(id), enabled: id > 0 })
}

/**
 * Coste medio por comida para el resumen: media del coste por racion de
 * todas las recetas del hogar. No hay endpoint dedicado en el contrato, asi
 * que se calcula en el cliente promediando `cost_per_serving`.
 */
export function useCosteMedioPorComida(householdId: number) {
  const recetas = useRecipes(householdId)
  return useQuery({
    queryKey: claves.costeMedioComida(householdId),
    queryFn: async () => {
      const lista = recetas.data ?? []
      if (lista.length === 0) return 0
      const costes = await Promise.all(lista.map((r) => cargarCosteReceta(r.id)))
      const centimos = costes.map((c) => eurosACentimos(c.cost_per_serving))
      return centimos.reduce((a, b) => a + b, 0) / centimos.length
    },
    enabled: recetas.isSuccess,
  })
}

// ================================================================
// Lista de la compra
// ================================================================

async function cargarListaActiva(householdId: number): Promise<ShoppingList | null> {
  if (BACKEND_LISTO) {
    const listas = await fetchAll<ShoppingList>(`${BASE}/shopping-list/?household=${householdId}`)
    return listas[0] ?? null
  }
  return retraso(almacen.shoppingLists.find((l) => l.household === householdId) ?? null)
}

export function useListaActiva(householdId: number) {
  return useQuery({ queryKey: claves.shoppingList(householdId), queryFn: () => cargarListaActiva(householdId), enabled: householdId > 0 })
}

async function cargarLineasLista(listId: number): Promise<ShoppingListItem[]> {
  if (BACKEND_LISTO) return fetchAll<ShoppingListItem>(`${BASE}/shopping-list-item/?shopping_list=${listId}`)
  return retraso(almacen.shoppingListItems.filter((i) => i.shopping_list === listId))
}

export function useListaItems(listId: number) {
  return useQuery({
    queryKey: claves.shoppingListItems(listId),
    queryFn: () => cargarLineasLista(listId),
    enabled: listId > 0,
  })
}

export function useMarcarComprado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; purchased: boolean; supermarket?: string | null }) => {
      if (BACKEND_LISTO) {
        return api.patch<ShoppingListItem>(`${BASE}/shopping-list-item/${input.id}/`, {
          purchased: input.purchased,
          ...(input.supermarket !== undefined ? { supermarket: input.supermarket } : {}),
        })
      }
      const item = almacen.shoppingListItems.find((i) => i.id === input.id)
      if (!item) throw new Error('Linea no encontrada')
      item.purchased = input.purchased
      if (input.supermarket !== undefined) item.supermarket = input.supermarket
      return retraso(item)
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: claves.shoppingListItems(item.shopping_list) })
    },
  })
}

export function useGenerarLista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: GenerarListaPayload) => {
      if (BACKEND_LISTO) return api.post<ShoppingList>(`${BASE}/shopping-list/generate/`, payload)

      // Agrega los recipe-ingredient de las recetas elegidas por ingrediente.
      const agregados = new Map<number, number>()
      for (const recipeId of payload.recipe_ids) {
        const ingredientes = almacen.recipeIngredients.filter((ri) => ri.recipe === recipeId)
        for (const ri of ingredientes) {
          agregados.set(ri.ingredient, (agregados.get(ri.ingredient) ?? 0) + ri.amount)
        }
      }

      const id = siguienteId()
      const lista: ShoppingList = {
        id,
        household: payload.household,
        name: `Lista ${payload.start_date} a ${payload.end_date}`,
        start_date: payload.start_date,
        end_date: payload.end_date,
      }
      almacen.shoppingLists.push(lista)

      for (const [ingredientId, amount] of agregados) {
        const info = ingredienteMock(ingredientId)
        if (!info) continue
        almacen.shoppingListItems.push({
          id: siguienteId(),
          shopping_list: id,
          ingredient: ingredientId,
          name: info.name,
          amount: Math.round(amount),
          unit: 'g',
          estimated_price: (costeIngredienteCentimos(amount, info.precioCentimosPorKg) / 100).toFixed(2),
          purchased: false,
          supermarket: null,
        })
      }
      return retraso(lista)
    },
    onSuccess: (lista) => {
      qc.invalidateQueries({ queryKey: claves.shoppingList(lista.household) })
      qc.invalidateQueries({ queryKey: claves.shoppingListItems(lista.id) })
    },
  })
}

// -------------------------------------------------------------- utilidades

export function fechaPorDefectoNuevaCompra(): string {
  return today()
}
