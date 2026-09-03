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
import { ApiError, api, fetchAll, type Paginated } from '../../lib/api'
import { today } from '../../lib/format'
import { costeIngredienteCentimos, eurosACentimos, repartoCompra, sumarCentimos } from './calculo'
import type {
  Cobertura,
  GenerarDesdeNutricionPayload,
  GenerarListaPayload,
  Household,
  HouseholdMember,
  HouseholdSummary,
  IngredientPrice,
  IngredientWger,
  PantryItem,
  Purchase,
  PurchaseBreakdown,
  PurchaseItem,
  Receipt,
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

/** Un ingrediente concreto de wger por id (siempre real, igual que la busqueda). */
export function useIngredienteWger(id: number) {
  return useQuery({
    queryKey: ['wger', 'ingredient', id],
    queryFn: () => api.get<IngredientWger>(`/api/v2/ingredient/${id}/`),
    enabled: id > 0,
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
    { id: 1, household: 1, date: '2026-08-18', description: 'Compra semanal', supermarket: 'Mercadona', covers_days: 7, shopping_list: null, trip: null },
    { id: 2, household: 1, date: '2026-08-11', description: 'Compra semanal', supermarket: 'Lidl', covers_days: 7, shopping_list: null, trip: null },
    { id: 3, household: 1, date: '2026-08-04', description: 'Compra semanal', supermarket: 'Mercadona', covers_days: 7, shopping_list: null, trip: null },
    { id: 4, household: 1, date: '2026-07-28', description: 'Compra grande', supermarket: 'Carrefour', covers_days: 10, shopping_list: null, trip: null },
    { id: 5, household: 1, date: '2026-07-21', description: 'Compra semanal', supermarket: 'Mercadona', covers_days: 7, shopping_list: null, trip: null },
  ] as Purchase[],
  purchaseItems: [
    // Compra 1
    { id: 1, purchase: 1, ingredient: 9001, name: 'Pechuga de pollo', amount: 1.5, unit: 'kg', price: '9.75', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 2, purchase: 1, ingredient: 9002, name: 'Arroz blanco', amount: 2, unit: 'kg', price: '2.40', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 3, purchase: 1, ingredient: null, name: 'Verduras varias', amount: 1, unit: 'lote', price: '8.90', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 4, purchase: 1, ingredient: null, name: 'Proteina en polvo', amount: 1, unit: 'ud', price: '24.90', purchased: false, is_shared: false, member: 1, shopping_list_item: null },
    { id: 5, purchase: 1, ingredient: null, name: 'Maquinillas de afeitar', amount: 1, unit: 'ud', price: '5.60', purchased: false, is_shared: false, member: 2, shopping_list_item: null },
    // Compra 2
    { id: 6, purchase: 2, ingredient: 9008, name: 'Atun en lata', amount: 6, unit: 'ud', price: '7.20', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 7, purchase: 2, ingredient: 9006, name: 'Avena', amount: 1, unit: 'kg', price: '2.10', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 8, purchase: 2, ingredient: null, name: 'Fruta variada', amount: 1, unit: 'lote', price: '11.30', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 9, purchase: 2, ingredient: null, name: 'Champu', amount: 1, unit: 'ud', price: '4.20', purchased: false, is_shared: false, member: 1, shopping_list_item: null },
    // Compra 3
    { id: 10, purchase: 3, ingredient: 9001, name: 'Pechuga de pollo', amount: 1, unit: 'kg', price: '6.50', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 11, purchase: 3, ingredient: 9004, name: 'Brocoli', amount: 1, unit: 'kg', price: '2.50', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 12, purchase: 3, ingredient: 9005, name: 'Huevos', amount: 2, unit: 'docena', price: '6.40', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 13, purchase: 3, ingredient: null, name: 'Suplemento vitaminas', amount: 1, unit: 'ud', price: '12.00', purchased: false, is_shared: false, member: 2, shopping_list_item: null },
    // Compra 4 (grande, 10 dias)
    { id: 14, purchase: 4, ingredient: 9002, name: 'Arroz blanco', amount: 5, unit: 'kg', price: '6.00', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 15, purchase: 4, ingredient: 9003, name: 'Aceite de oliva', amount: 1, unit: 'l', price: '7.80', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 16, purchase: 4, ingredient: null, name: 'Congelados varios', amount: 1, unit: 'lote', price: '18.50', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 17, purchase: 4, ingredient: null, name: 'Limpieza del hogar', amount: 1, unit: 'lote', price: '15.20', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    // Compra 5
    { id: 18, purchase: 5, ingredient: 9007, name: 'Platanos', amount: 1.2, unit: 'kg', price: '2.28', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 19, purchase: 5, ingredient: 9001, name: 'Pechuga de pollo', amount: 1, unit: 'kg', price: '6.50', purchased: false, is_shared: true, member: null, shopping_list_item: null },
    { id: 20, purchase: 5, ingredient: null, name: 'Ropa deportiva', amount: 1, unit: 'ud', price: '22.00', purchased: false, is_shared: false, member: 1, shopping_list_item: null },
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
  // Despensa vacia por defecto: se rellena comprando (o a mano), no trae
  // ejemplos precargados como el resto del almacen.
  pantryItems: [] as PantryItem[],
  // Sin tickets de ejemplo precargados, igual que la despensa: nacen de subir uno.
  receipts: [] as Receipt[],
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
  pantryItems: (householdId: number) => ['compra', 'pantry-items', householdId] as const,
  receipts: (householdId: number) => ['compra', 'receipts', householdId] as const,
  receipt: (id: number) => ['compra', 'receipt', id] as const,
}

// Prefijos usados para invalidar en bloque queries derivadas que no dependen
// solo de un id (series calculadas en el cliente, resumenes, etc).
const prefijos = {
  summary: ['compra', 'summary'] as const,
  gastoSemanal: ['compra', 'gasto-semanal'] as const,
  purchasesTotal: ['compra', 'purchases-total'] as const,
  breakdown: ['compra', 'breakdown'] as const,
  costeMedioComida: ['compra', 'coste-medio-comida'] as const,
  pantryItems: ['compra', 'pantry-items'] as const,
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

/**
 * Rellena los campos de frescura que anadio el backend (tanda, categoria,
 * fecha de compra...) en una linea del almacen de ejemplo. Solo se usa con
 * BACKEND_LISTO = false: la API real ya los manda calculados.
 */
function lineaEjemplo(parcial: Omit<ShoppingListItem, keyof CamposFrescura> & Partial<CamposFrescura>): ShoppingListItem {
  return {
    category: '',
    shelf_life_days: null,
    trip: 1,
    buy_date: null,
    days_covered: 0,
    freeze_on_arrival: false,
    source: '',
    note: '',
    // Igual que el backend (ver _nueva_clave_grupo en el modelo): sin uno
    // explicito, cada linea de ejemplo nace con su propio grupo de una sola
    // linea.
    group_key: crypto.randomUUID(),
    ...parcial,
  }
}

type CamposFrescura = Pick<
  ShoppingListItem,
  | 'category'
  | 'shelf_life_days'
  | 'trip'
  | 'buy_date'
  | 'days_covered'
  | 'freeze_on_arrival'
  | 'source'
  | 'note'
  | 'group_key'
>

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

export type NuevoMiembro = { household: number; name: string; link_username?: string }

/**
 * Anade un miembro al hogar. `link_username` es opcional: sin el, el
 * miembro solo existe para el reparto de gasto (igual que hasta ahora); con
 * el, vincula de una vez la cuenta de quien ya se haya registrado en la
 * app, y esa persona pasa a ver y editar los mismos datos del hogar.
 */
export function useCrearMiembro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NuevoMiembro) => {
      if (BACKEND_LISTO) return api.post<HouseholdMember>(`${BASE}/household-member/`, input)
      const miembro: HouseholdMember = {
        id: siguienteId(),
        household: input.household,
        name: input.name,
        consumption_share: 0,
        user: null,
        username: input.link_username || null,
      }
      almacen.members.push(miembro)
      return retraso(miembro)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.household }),
  })
}

/** Vincula (username no vacio) o desvincula (cadena vacia) la cuenta de un miembro ya creado. */
export function useVincularMiembro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; link_username: string }) => {
      if (BACKEND_LISTO) {
        return api.patch<HouseholdMember>(`${BASE}/household-member/${input.id}/`, {
          link_username: input.link_username,
        })
      }
      const miembro = almacen.members.find((m) => m.id === input.id)
      if (miembro) miembro.username = input.link_username || null
      return retraso(miembro)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.household }),
  })
}

/** Elimina un miembro del hogar. Se lleva por delante su reparto de gasto. */
export function useEliminarMiembro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/household-member/${id}/`)
        return id
      }
      const idx = almacen.members.findIndex((m) => m.id === id)
      if (idx >= 0) almacen.members.splice(idx, 1)
      return retraso(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.household })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.breakdown })
    },
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
    queryKey: [...prefijos.purchasesTotal, householdId, compras.data?.length ?? 0],
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

export type NuevaLinea = Omit<PurchaseItem, 'id' | 'purchase' | 'shopping_list_item'>

export function useCrearCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { cabecera: Omit<Purchase, 'id' | 'shopping_list' | 'trip'>; lineas: NuevaLinea[] }) => {
      if (BACKEND_LISTO) {
        const compra = await api.post<Purchase>(`${BASE}/purchase/`, input.cabecera)
        await Promise.all(
          input.lineas.map((linea) => api.post(`${BASE}/purchase-item/`, { ...linea, purchase: compra.id })),
        )
        return compra
      }
      const id = siguienteId()
      const compra: Purchase = { id, shopping_list: null, trip: null, ...input.cabecera }
      almacen.purchases.push(compra)
      for (const linea of input.lineas) {
        almacen.purchaseItems.push({ id: siguienteId(), purchase: id, shopping_list_item: null, ...linea })
      }
      return retraso(compra)
    },
    onSuccess: (compra) => {
      qc.invalidateQueries({ queryKey: claves.purchases(compra.household) })
      qc.invalidateQueries({ queryKey: claves.summary(compra.household, 30) })
    },
  })
}

/** Cambia la cabecera de una compra ya creada (fecha, descripcion, super, dias). */
export function useActualizarCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; cambios: Partial<Omit<Purchase, 'id' | 'household' | 'shopping_list' | 'trip'>> }) => {
      if (BACKEND_LISTO) return api.patch<Purchase>(`${BASE}/purchase/${input.id}/`, input.cambios)
      const compra = almacen.purchases.find((p) => p.id === input.id)
      if (!compra) throw new Error('Compra no encontrada')
      Object.assign(compra, input.cambios)
      return retraso(compra)
    },
    onSuccess: (compra) => {
      qc.invalidateQueries({ queryKey: claves.purchase(compra.id) })
      qc.invalidateQueries({ queryKey: claves.purchases(compra.household) })
      qc.invalidateQueries({ queryKey: claves.breakdown(compra.id) })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.gastoSemanal })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
    },
  })
}

/** Borra una compra entera junto con todas sus lineas. */
export function useEliminarCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; household: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/purchase/${input.id}/`)
        return input
      }
      const idx = almacen.purchases.findIndex((p) => p.id === input.id)
      if (idx >= 0) almacen.purchases.splice(idx, 1)
      for (let i = almacen.purchaseItems.length - 1; i >= 0; i--) {
        if (almacen.purchaseItems[i]!.purchase === input.id) almacen.purchaseItems.splice(i, 1)
      }
      return retraso(input)
    },
    onSuccess: ({ id, household }) => {
      qc.removeQueries({ queryKey: claves.purchase(id) })
      qc.removeQueries({ queryKey: claves.purchaseItems(id) })
      qc.removeQueries({ queryKey: claves.breakdown(id) })
      qc.invalidateQueries({ queryKey: claves.purchases(household) })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.gastoSemanal })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
    },
  })
}

/** Duplica una compra entera (cabecera + lineas) con la fecha de hoy. "Repetir esta compra". */
export function useDuplicarCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (purchaseId: number) => {
      const original = await cargarCompra(purchaseId)
      const lineasOriginales = await cargarLineas(purchaseId)

      if (BACKEND_LISTO) {
        const compra = await api.post<Purchase>(`${BASE}/purchase/`, {
          household: original.household,
          date: today(),
          description: original.description,
          supermarket: original.supermarket,
          covers_days: original.covers_days,
        })
        await Promise.all(
          lineasOriginales.map((linea) =>
            api.post(`${BASE}/purchase-item/`, {
              ingredient: linea.ingredient,
              name: linea.name,
              amount: linea.amount,
              unit: linea.unit,
              price: linea.price,
              purchased: false,
              is_shared: linea.is_shared,
              member: linea.member,
              purchase: compra.id,
            }),
          ),
        )
        return compra
      }

      const id = siguienteId()
      const compra: Purchase = {
        id,
        household: original.household,
        date: today(),
        description: original.description,
        supermarket: original.supermarket,
        covers_days: original.covers_days,
        shopping_list: null,
        trip: null,
      }
      almacen.purchases.push(compra)
      for (const linea of lineasOriginales) {
        almacen.purchaseItems.push({ ...linea, id: siguienteId(), purchase: id, purchased: false, shopping_list_item: null })
      }
      return retraso(compra)
    },
    onSuccess: (compra) => {
      qc.invalidateQueries({ queryKey: claves.purchases(compra.household) })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.gastoSemanal })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
    },
  })
}

/** Anade una linea suelta a una compra ya creada. */
export function useCrearLineaCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { purchase: number; linea: NuevaLinea }) => {
      if (BACKEND_LISTO) {
        return api.post<PurchaseItem>(`${BASE}/purchase-item/`, { ...input.linea, purchase: input.purchase })
      }
      const item: PurchaseItem = { id: siguienteId(), purchase: input.purchase, shopping_list_item: null, ...input.linea }
      almacen.purchaseItems.push(item)
      return retraso(item)
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: claves.purchaseItems(item.purchase) })
      qc.invalidateQueries({ queryKey: claves.breakdown(item.purchase) })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.gastoSemanal })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
    },
  })
}

/** Cambia una linea suelta de una compra ya creada. */
export function useActualizarLineaCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; purchase: number; cambios: Partial<NuevaLinea> }) => {
      if (BACKEND_LISTO) return api.patch<PurchaseItem>(`${BASE}/purchase-item/${input.id}/`, input.cambios)
      const item = almacen.purchaseItems.find((i) => i.id === input.id)
      if (!item) throw new Error('Linea no encontrada')
      Object.assign(item, input.cambios)
      return retraso(item)
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: claves.purchaseItems(item.purchase) })
      qc.invalidateQueries({ queryKey: claves.breakdown(item.purchase) })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.gastoSemanal })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
      // Marcar/desmarcar como comprada puede haber ajustado la despensa en
      // el backend (ver PurchaseItemViewSet.perform_update): sin saber aqui
      // el household, se invalida el prefijo entero en vez de una clave sola.
      qc.invalidateQueries({ queryKey: prefijos.pantryItems })
    },
  })
}

/** Quita una linea suelta de una compra ya creada. */
export function useEliminarLineaCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; purchase: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/purchase-item/${input.id}/`)
        return input
      }
      const idx = almacen.purchaseItems.findIndex((i) => i.id === input.id)
      if (idx >= 0) almacen.purchaseItems.splice(idx, 1)
      return retraso(input)
    },
    onSuccess: ({ purchase }) => {
      qc.invalidateQueries({ queryKey: claves.purchaseItems(purchase) })
      qc.invalidateQueries({ queryKey: claves.breakdown(purchase) })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.gastoSemanal })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
      // Borrar una linea que seguia marcada como comprada tambien devuelve
      // su cantidad a la despensa (ver PurchaseItemViewSet.perform_destroy).
      qc.invalidateQueries({ queryKey: prefijos.pantryItems })
    },
  })
}

// ================================================================
// Despensa
// ================================================================

async function cargarDespensa(householdId: number): Promise<PantryItem[]> {
  if (BACKEND_LISTO) return fetchAll<PantryItem>(`${BASE}/pantry-item/?household=${householdId}`)
  return retraso(almacen.pantryItems.filter((i) => i.household === householdId))
}

export function usePantryItems(householdId: number) {
  return useQuery({
    queryKey: claves.pantryItems(householdId),
    queryFn: () => cargarDespensa(householdId),
    enabled: householdId > 0,
  })
}

export type NuevaLineaDespensa = { household: number; ingredient?: number | null; name: string; unit: string; amount: number }

/** Anade una linea a mano a la despensa. */
export function useCrearPantryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NuevaLineaDespensa) => {
      if (BACKEND_LISTO) return api.post<PantryItem>(`${BASE}/pantry-item/`, input)
      const item: PantryItem = { id: siguienteId(), ingredient: null, ...input }
      almacen.pantryItems.push(item)
      return retraso(item)
    },
    onSuccess: (item) => qc.invalidateQueries({ queryKey: claves.pantryItems(item.household) }),
  })
}

/** Corrige a mano la cantidad de una linea de despensa (segun se va gastando). */
export function useActualizarPantryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; household: number; amount: number }) => {
      if (BACKEND_LISTO) return api.patch<PantryItem>(`${BASE}/pantry-item/${input.id}/`, { amount: input.amount })
      const item = almacen.pantryItems.find((i) => i.id === input.id)
      if (!item) throw new Error('Linea de despensa no encontrada')
      item.amount = input.amount
      return retraso(item)
    },
    onSuccess: (item) => qc.invalidateQueries({ queryKey: claves.pantryItems(item.household) }),
  })
}

/** Quita una linea de despensa. */
export function useEliminarPantryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; household: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/pantry-item/${input.id}/`)
        return input
      }
      const idx = almacen.pantryItems.findIndex((i) => i.id === input.id)
      if (idx >= 0) almacen.pantryItems.splice(idx, 1)
      return retraso(input)
    },
    onSuccess: ({ household }) => qc.invalidateQueries({ queryKey: claves.pantryItems(household) }),
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
    queryKey: [...prefijos.gastoSemanal, householdId, compras.data?.length ?? 0],
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
  if (BACKEND_LISTO) {
    // `ordering=name` para que la paginacion (LIMIT/OFFSET sin ORDER BY
    // estable) no repita ni salte filas entre paginas -- sin un orden fijo,
    // MySQL no garantiza que la pagina 2 empiece justo donde acabo la 1.
    const paginas = await fetchAll<Recipe>(`${BASE}/recipe/?household=${householdId}&ordering=name`)
    // Defensa extra: si aun asi llega algun id repetido (dos household
    // solapados, una recarga a mitad de escritura...), no se ve duplicado
    // en la lista.
    const vistos = new Set<number>()
    return paginas.filter((r) => (vistos.has(r.id) ? false : (vistos.add(r.id), true)))
  }
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

export type NuevaReceta = Omit<Recipe, 'id' | 'image'>

/** Crea una receta nueva (sin ingredientes todavia: se anaden aparte con useCrearIngredienteReceta). */
export function useCrearReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NuevaReceta) => {
      if (BACKEND_LISTO) return api.post<Recipe>(`${BASE}/recipe/`, input)
      const receta: Recipe = { id: siguienteId(), image: null, ...input }
      almacen.recipes.push(receta)
      return retraso(receta)
    },
    onSuccess: (receta) => {
      qc.invalidateQueries({ queryKey: claves.recipes(receta.household) })
    },
  })
}

/** Cambia nombre, raciones o instrucciones de una receta ya creada. */
export function useActualizarReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; cambios: Partial<Omit<Recipe, 'id' | 'household'>> }) => {
      if (BACKEND_LISTO) return api.patch<Recipe>(`${BASE}/recipe/${input.id}/`, input.cambios)
      const receta = almacen.recipes.find((r) => r.id === input.id)
      if (!receta) throw new Error('Receta no encontrada')
      Object.assign(receta, input.cambios)
      return retraso(receta)
    },
    onSuccess: (receta) => {
      qc.invalidateQueries({ queryKey: claves.recipe(receta.id) })
      qc.invalidateQueries({ queryKey: claves.recipes(receta.household) })
      qc.invalidateQueries({ queryKey: claves.recipeCost(receta.id) })
      qc.invalidateQueries({ queryKey: prefijos.costeMedioComida })
    },
  })
}

/**
 * Sube la foto de una receta. `api.patchForm` de lib/api.ts: un FormData en
 * vez de JSON, porque hace falta `multipart/form-data`, que el navegador
 * construye solo a partir de un `FormData` (no forzar el Content-Type a
 * mano, o pierde el boundary).
 */
export function useSubirFotoReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const body = new FormData()
      body.append('image', file)
      return api.patchForm<Recipe>(`${BASE}/recipe/${id}/`, body)
    },
    onSuccess: (receta) => {
      qc.invalidateQueries({ queryKey: claves.recipe(receta.id) })
      qc.invalidateQueries({ queryKey: claves.recipes(receta.household) })
    },
  })
}

/** Borra una receta entera junto con sus ingredientes. */
export function useEliminarReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; household: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/recipe/${input.id}/`)
        return input
      }
      const idx = almacen.recipes.findIndex((r) => r.id === input.id)
      if (idx >= 0) almacen.recipes.splice(idx, 1)
      for (let i = almacen.recipeIngredients.length - 1; i >= 0; i--) {
        if (almacen.recipeIngredients[i]!.recipe === input.id) almacen.recipeIngredients.splice(i, 1)
      }
      return retraso(input)
    },
    onSuccess: ({ id, household }) => {
      qc.removeQueries({ queryKey: claves.recipe(id) })
      qc.removeQueries({ queryKey: claves.recipeIngredients(id) })
      qc.removeQueries({ queryKey: claves.recipeCost(id) })
      qc.invalidateQueries({ queryKey: claves.recipes(household) })
      qc.invalidateQueries({ queryKey: prefijos.costeMedioComida })
    },
  })
}

/** Duplica una receta con sus ingredientes. Nombre "<original> (copia)". */
export function useDuplicarReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (recipeId: number) => {
      const original = await cargarReceta(recipeId)
      const ingredientesOriginales = await cargarIngredientesReceta(recipeId)

      if (BACKEND_LISTO) {
        const receta = await api.post<Recipe>(`${BASE}/recipe/`, {
          household: original.household,
          name: `${original.name} (copia)`,
          servings: original.servings,
          instructions: original.instructions,
        })
        await Promise.all(
          ingredientesOriginales.map((ri) =>
            api.post(`${BASE}/recipe-ingredient/`, { ingredient: ri.ingredient, amount: ri.amount, recipe: receta.id }),
          ),
        )
        return receta
      }

      const id = siguienteId()
      const receta: Recipe = {
        id,
        household: original.household,
        name: `${original.name} (copia)`,
        servings: original.servings,
        instructions: original.instructions,
        image: null,
      }
      almacen.recipes.push(receta)
      for (const ri of ingredientesOriginales) {
        almacen.recipeIngredients.push({ id: siguienteId(), recipe: id, ingredient: ri.ingredient, amount: ri.amount })
      }
      return retraso(receta)
    },
    onSuccess: (receta) => {
      qc.invalidateQueries({ queryKey: claves.recipes(receta.household) })
      qc.invalidateQueries({ queryKey: prefijos.costeMedioComida })
    },
  })
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

export type NuevoIngredienteReceta = Omit<RecipeIngredient, 'id' | 'recipe'>

/** Anade un ingrediente a una receta ya creada. */
export function useCrearIngredienteReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { recipe: number; ingrediente: NuevoIngredienteReceta }) => {
      if (BACKEND_LISTO) {
        return api.post<RecipeIngredient>(`${BASE}/recipe-ingredient/`, { ...input.ingrediente, recipe: input.recipe })
      }
      const ri: RecipeIngredient = { id: siguienteId(), recipe: input.recipe, ...input.ingrediente }
      almacen.recipeIngredients.push(ri)
      return retraso(ri)
    },
    onSuccess: (ri) => {
      qc.invalidateQueries({ queryKey: claves.recipeIngredients(ri.recipe) })
      qc.invalidateQueries({ queryKey: claves.recipeCost(ri.recipe) })
      qc.invalidateQueries({ queryKey: prefijos.costeMedioComida })
    },
  })
}

/** Cambia el ingrediente o la cantidad de una linea de receta ya creada. */
export function useActualizarIngredienteReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; recipe: number; cambios: Partial<NuevoIngredienteReceta> }) => {
      if (BACKEND_LISTO) return api.patch<RecipeIngredient>(`${BASE}/recipe-ingredient/${input.id}/`, input.cambios)
      const ri = almacen.recipeIngredients.find((r) => r.id === input.id)
      if (!ri) throw new Error('Ingrediente no encontrado')
      Object.assign(ri, input.cambios)
      return retraso(ri)
    },
    onSuccess: (ri) => {
      qc.invalidateQueries({ queryKey: claves.recipeIngredients(ri.recipe) })
      qc.invalidateQueries({ queryKey: claves.recipeCost(ri.recipe) })
      qc.invalidateQueries({ queryKey: prefijos.costeMedioComida })
    },
  })
}

/** Quita un ingrediente de una receta ya creada. */
export function useEliminarIngredienteReceta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; recipe: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/recipe-ingredient/${input.id}/`)
        return input
      }
      const idx = almacen.recipeIngredients.findIndex((r) => r.id === input.id)
      if (idx >= 0) almacen.recipeIngredients.splice(idx, 1)
      return retraso(input)
    },
    onSuccess: ({ recipe }) => {
      qc.invalidateQueries({ queryKey: claves.recipeIngredients(recipe) })
      qc.invalidateQueries({ queryKey: claves.recipeCost(recipe) })
      qc.invalidateQueries({ queryKey: prefijos.costeMedioComida })
    },
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
    macros_per_serving: {
      energy: Math.round(energy / raciones),
      protein: Math.round((protein / raciones) * 10) / 10,
      carbohydrates: Math.round((carbohydrates / raciones) * 10) / 10,
      fat: Math.round((fat / raciones) * 10) / 10,
    },
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
    // Solo se necesita la mas reciente (el backend ordena por -created), asi
    // que se pide una y no todas: cada lista serializada arrastra el resumen
    // de sus tandas, y paginarlas enteras seria trabajo tirado.
    const pagina = await api.get<Paginated<ShoppingList>>(
      `${BASE}/shopping-list/?household=${householdId}&limit=1`,
    )
    return pagina.results[0] ?? null
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
      // Marcar/desmarcar como comprado puede haber creado o tocado su
      // reflejo real en Compras -- una Purchase por tanda de la lista, con
      // su PurchaseItem -- y, con ello, la despensa (ver
      // _sincronizar_compra_real en el backend). No se sabe aqui el
      // household ni el id de esa Purchase, asi que se invalidan los
      // prefijos enteros en vez de una clave sola.
      qc.invalidateQueries({ queryKey: ['compra', 'purchases'] })
      qc.invalidateQueries({ queryKey: ['compra', 'purchase-items'] })
      qc.invalidateQueries({ queryKey: ['compra', 'breakdown'] })
      qc.invalidateQueries({ queryKey: prefijos.pantryItems })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
    },
  })
}

/** Quita una linea de la lista de la compra activa. */
export function useEliminarLineaLista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; shopping_list: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/shopping-list-item/${input.id}/`)
        return input
      }
      const idx = almacen.shoppingListItems.findIndex((i) => i.id === input.id)
      if (idx >= 0) almacen.shoppingListItems.splice(idx, 1)
      return retraso(input)
    },
    onSuccess: ({ shopping_list }) => {
      qc.invalidateQueries({ queryKey: claves.shoppingListItems(shopping_list) })
    },
  })
}

/**
 * Borra la lista de la compra entera, con todas sus lineas. No hay hook
 * equivalente hasta ahora (ver encargo): sin esto, una lista generada por
 * error se queda de "activa" para siempre porque useListaActiva siempre coge
 * la mas reciente.
 *
 * Al invalidar claves.shoppingList(household), useListaActiva vuelve a pedir
 * la lista mas reciente y automaticamente cae en la anterior (o en null si
 * no queda ninguna): no hace falta logica extra para "la lista activa pasa a
 * ser la anterior".
 */
export function useEliminarLista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; household: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/shopping-list/${input.id}/`)
        return input
      }
      const idx = almacen.shoppingLists.findIndex((l) => l.id === input.id)
      if (idx >= 0) almacen.shoppingLists.splice(idx, 1)
      for (let i = almacen.shoppingListItems.length - 1; i >= 0; i--) {
        if (almacen.shoppingListItems[i]!.shopping_list === input.id) almacen.shoppingListItems.splice(i, 1)
      }
      return retraso(input)
    },
    onSuccess: ({ id, household }) => {
      qc.removeQueries({ queryKey: claves.shoppingListItems(id) })
      qc.invalidateQueries({ queryKey: claves.shoppingList(household) })
      qc.invalidateQueries({ queryKey: ['compra', 'cobertura'] })
    },
  })
}

/**
 * Quita un producto de TODA la lista, no solo la fila que se pulso. Hace
 * falta porque desde que la compra se reparte en tandas (ver
 * backend/salaz/frescura.py) un mismo producto puede tener una linea por
 * tanda: borrar una sola no lo quita del todo.
 *
 * El backend no tiene un endpoint bulk para esto, asi que se borra cada
 * linea por separado (mismo patron que useCrearCompra con varias lineas) y
 * solo se invalida una vez, al final.
 */
/**
 * Quita un producto de TODA la lista, no solo la fila que se pulso: todas sus
 * tandas de una vez. Hace falta porque desde que la compra se reparte en
 * tandas (ver backend/salaz/frescura.py) un mismo producto puede tener una
 * linea por tanda, y borrar una sola no lo quita del todo.
 *
 * Una unica peticion DELETE atomica al backend (por-grupo), no N peticiones
 * en paralelo: si el movil pierde la conexion a mitad, con N peticiones
 * sueltas el producto quedaria a medio borrar en unas tandas si y en otras
 * no. Con la transaccion del backend, o se borra entero o no se borra nada.
 * El agrupado usa `group_key` (asignado por el servidor), nunca el nombre:
 * dos productos de texto libre con el mismo nombre en la misma lista no son
 * necesariamente el mismo producto.
 */
export function useEliminarProductoLista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { groupKey: string; shopping_list: number }) => {
      if (BACKEND_LISTO) {
        return api.del<{ shopping_list: number; deleted: number }>(
          `${BASE}/shopping-list-item/by-group/${input.groupKey}/`,
        )
      }
      const idx = almacen.shoppingListItems.filter((i) => i.group_key === input.groupKey)
      for (const item of idx) {
        const i = almacen.shoppingListItems.findIndex((x) => x.id === item.id)
        if (i >= 0) almacen.shoppingListItems.splice(i, 1)
      }
      return retraso({ shopping_list: input.shopping_list, deleted: idx.length })
    },
    onSuccess: ({ shopping_list }) => {
      qc.invalidateQueries({ queryKey: claves.shoppingListItems(shopping_list) })
      qc.invalidateQueries({ queryKey: ['compra', 'cobertura'] })
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
        nutrition_plan: '',
        days: 0,
        trips: [],
      }
      almacen.shoppingLists.push(lista)

      for (const [ingredientId, amount] of agregados) {
        const info = ingredienteMock(ingredientId)
        if (!info) continue
        almacen.shoppingListItems.push(
          lineaEjemplo({
            id: siguienteId(),
            shopping_list: id,
            ingredient: ingredientId,
            name: info.name,
            amount: Math.round(amount),
            unit: 'g',
            estimated_price: (costeIngredienteCentimos(amount, info.precioCentimosPorKg) / 100).toFixed(2),
            purchased: false,
            supermarket: null,
          }),
        )
      }
      return retraso(lista)
    },
    onSuccess: (lista) => {
      qc.invalidateQueries({ queryKey: claves.shoppingList(lista.household) })
      qc.invalidateQueries({ queryKey: claves.shoppingListItems(lista.id) })
    },
  })
}

// ================================================================
// Planificador: recetas de la semana/quincena -> lista de la compra
// ================================================================

export type SeleccionPlanificador = { recipeId: number; tandas: number }

export type ResultadoPlanificador = {
  lista: ShoppingList
  items: ShoppingListItem[]
  /** Id de ingrediente de wger -> nombres de las recetas de las que sale. Para guardar en planLocal. */
  origenPorIngrediente: Record<number, string[]>
}

/**
 * Genera la lista de la compra sumando, por ingrediente, las cantidades de
 * varias recetas multiplicadas por sus tandas.
 *
 * El endpoint `POST .../shopping-list/generate/` NO sirve para esto:
 * verificado contra backend/salaz/api/views.py, agrega con
 * `Recipe.objects.filter(id__in=recipe_ids, ...)`, que en Django deduplica
 * ids repetidos (un `WHERE id IN (...)` no cuenta cuantas veces aparece un id
 * en la lista). Repetir un id para representar varias tandas no suma nada
 * mas: la receta se cuenta una sola vez.
 *
 * Por eso aqui NO se usa `generate`: se crea la lista vacia a mano, se suman
 * las cantidades en el cliente (amount de cada RecipeIngredient x tandas) y
 * se crea cada ShoppingListItem uno a uno, con el precio calculado a partir
 * de `ingredient-price` (`price_per_100g`, ver tipos.ts), igual que hace el
 * backend en su propio calculo de coste de receta
 * (backend/salaz/models/recipe.py).
 */
export function useGenerarListaDesdePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      household: number
      start_date: string
      end_date: string
      seleccion: SeleccionPlanificador[]
    }): Promise<ResultadoPlanificador> => {
      // 1. Suma cantidades por ingrediente y recuerda de que recetas sale cada una.
      const cantidades = new Map<number, number>()
      const origenes = new Map<number, Set<string>>()

      for (const sel of input.seleccion) {
        if (sel.tandas <= 0) continue
        const [receta, ingredientes] = await Promise.all([
          cargarReceta(sel.recipeId),
          cargarIngredientesReceta(sel.recipeId),
        ])
        for (const ri of ingredientes) {
          cantidades.set(ri.ingredient, (cantidades.get(ri.ingredient) ?? 0) + ri.amount * sel.tandas)
          if (!origenes.has(ri.ingredient)) origenes.set(ri.ingredient, new Set())
          origenes.get(ri.ingredient)!.add(receta.name)
        }
      }

      // 2. Crea la lista vacia (sin usar /generate/, ver nota de arriba).
      let lista: ShoppingList
      if (BACKEND_LISTO) {
        lista = await api.post<ShoppingList>(`${BASE}/shopping-list/`, {
          household: input.household,
          name: `Lista ${input.start_date} a ${input.end_date}`,
          start_date: input.start_date,
          end_date: input.end_date,
        })
      } else {
        lista = {
          id: siguienteId(),
          household: input.household,
          name: `Lista ${input.start_date} a ${input.end_date}`,
          start_date: input.start_date,
          end_date: input.end_date,
          nutrition_plan: '',
          days: 0,
          trips: [],
        }
        almacen.shoppingLists.push(lista)
      }

      // 3. Crea cada linea, una a una, con el nombre y el precio ya resueltos.
      const items: ShoppingListItem[] = []
      for (const [ingredientId, amountBruto] of cantidades) {
        const amount = Math.round(amountBruto)

        if (BACKEND_LISTO) {
          let nombre = `Ingrediente #${ingredientId}`
          try {
            const wger = await api.get<IngredientWger>(`/api/v2/ingredient/${ingredientId}/`)
            nombre = wger.name
          } catch {
            /* si falla, se queda el nombre por defecto */
          }

          let estimatedPrice: string | null = null
          try {
            const precios = await api.get<Paginated<IngredientPrice>>(
              `${BASE}/ingredient-price/?household=${input.household}&ingredient=${ingredientId}&is_current=true`,
            )
            const precio = precios.results[0]
            if (precio?.price_per_100g) {
              estimatedPrice = ((Number(precio.price_per_100g) / 100) * amount).toFixed(2)
            }
          } catch {
            /* sin precio conocido para este ingrediente: se deja sin estimar */
          }

          const item = await api.post<ShoppingListItem>(`${BASE}/shopping-list-item/`, {
            shopping_list: lista.id,
            ingredient: ingredientId,
            name: nombre,
            amount,
            unit: 'g',
            estimated_price: estimatedPrice,
            purchased: false,
            // Verificado contra el backend real: ShoppingListItem.supermarket es un
            // CharField con blank=True pero SIN null=True, asi que null da 400
            // ("This field may not be null."). Hay que mandar cadena vacia.
            supermarket: '',
          })
          items.push(item)
        } else {
          const info = ingredienteMock(ingredientId)
          const precioCentimos = info ? costeIngredienteCentimos(amount, info.precioCentimosPorKg) : 0
          const item: ShoppingListItem = lineaEjemplo({
            id: siguienteId(),
            shopping_list: lista.id,
            ingredient: ingredientId,
            name: info?.name ?? `Ingrediente #${ingredientId}`,
            amount,
            unit: 'g',
            estimated_price: (precioCentimos / 100).toFixed(2),
            purchased: false,
            supermarket: null,
          })
          almacen.shoppingListItems.push(item)
          items.push(item)
        }
      }

      const origenPorIngrediente: Record<number, string[]> = {}
      for (const [ingredientId, nombres] of origenes) {
        origenPorIngrediente[ingredientId] = [...nombres]
      }

      return { lista, items, origenPorIngrediente }
    },
    onSuccess: ({ lista }) => {
      qc.invalidateQueries({ queryKey: claves.shoppingList(lista.household) })
      qc.invalidateQueries({ queryKey: claves.shoppingListItems(lista.id) })
    },
  })
}

// ================================================================
// Nutricion -> compra: la lista sale de los platos del plan
// ================================================================

/**
 * Genera la lista de la compra a partir del plan de nutricion.
 *
 * Es la sincronizacion que pedia el usuario: lo que hay apuntado en Desayuno,
 * Comida, Cena y Snacks es exactamente lo que hay que comprar. Toda la cuenta
 * la hace el backend (POST /shopping-list/from-nutrition/), incluido el
 * reparto en tandas segun lo que aguante cada producto: por eso aqui no hay
 * agregacion en el cliente, al contrario que en `useGenerarListaDesdePlan`,
 * que suma recetas a mano porque el endpoint `generate` no sabe de tandas.
 */
export function useGenerarListaDesdeNutricion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: GenerarDesdeNutricionPayload) =>
      api.post<ShoppingList>(`${BASE}/shopping-list/from-nutrition/`, payload),
    onSuccess: (lista) => {
      qc.invalidateQueries({ queryKey: claves.shoppingList(lista.household) })
      qc.invalidateQueries({ queryKey: claves.shoppingListItems(lista.id) })
      qc.invalidateQueries({ queryKey: ['compra', 'cobertura'] })
    },
  })
}

/**
 * Que platos de un dia tienen ya sus alimentos comprados.
 *
 * Lo lee la pantalla de Nutricion. `listId` sale de la lista activa del hogar;
 * si no hay lista (o no salio de un plan de nutricion) la consulta no se
 * lanza y la pantalla simplemente no ensena nada.
 */
export function useCobertura(listId: number, fecha: string) {
  return useQuery({
    queryKey: ['compra', 'cobertura', listId, fecha] as const,
    queryFn: () => api.get<Cobertura>(`${BASE}/shopping-list/${listId}/coverage/?date=${fecha}`),
    enabled: listId > 0 && fecha.length === 10,
    staleTime: 60_000,
  })
}

// ================================================================
// Tickets de compra
// ================================================================

async function cargarTickets(householdId: number): Promise<Receipt[]> {
  if (BACKEND_LISTO) return fetchAll<Receipt>(`${BASE}/receipt/?household=${householdId}`)
  return retraso(
    almacen.receipts
      .filter((t) => t.household === householdId)
      .slice()
      .sort((a, b) => b.created.localeCompare(a.created)),
  )
}

export function useReceipts(householdId: number) {
  return useQuery({
    queryKey: claves.receipts(householdId),
    queryFn: () => cargarTickets(householdId),
    enabled: householdId > 0,
  })
}

async function cargarTicket(id: number): Promise<Receipt> {
  if (BACKEND_LISTO) return api.get<Receipt>(`${BASE}/receipt/${id}/`)
  const ticket = almacen.receipts.find((t) => t.id === id)
  if (!ticket) throw new Error('Ticket no encontrado')
  return retraso(ticket)
}

export function useReceipt(id: number) {
  return useQuery({ queryKey: claves.receipt(id), queryFn: () => cargarTicket(id), enabled: id > 0 })
}

export type NuevoTicket = { household: number; image?: File | null; markdown?: string }

/**
 * Sube un ticket nuevo: la foto de papel (como justificante) y/o la
 * transcripcion pegada a mano. Un FormData -- api.postForm en vez de
 * api.post porque esto es multipart, no JSON -- pero por lo demas pasa por
 * el mismo cliente que el resto de la app: hereda el refresco de token en
 * 401/403, que un fetch a mano no tenia (y esta pantalla, por el tiempo que
 * lleva transcribir un ticket entero, es de las que mas facil topa con un
 * access token ya caducado -- ver docs/API-CONTRACT.md, dura 5 minutos).
 */
export function useSubirTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NuevoTicket) => {
      if (BACKEND_LISTO) {
        const body = new FormData()
        body.append('household', String(input.household))
        if (input.image) body.append('image', input.image)
        if (input.markdown) body.append('markdown', input.markdown)
        return api.postForm<Receipt>(`${BASE}/receipt/`, body)
      }

      const ahora = new Date().toISOString()
      const ticket: Receipt = {
        id: siguienteId(),
        household: input.household,
        // URL local solo para poder ensenar la miniatura en el mock: nunca
        // se manda a ningun sitio, y se pierde al recargar la pagina.
        image: input.image ? URL.createObjectURL(input.image) : null,
        markdown: input.markdown ?? '',
        status: 'pendiente',
        supermarket: '',
        date: null,
        total: null,
        parsed: {},
        error: '',
        purchase: null,
        created: ahora,
        updated_at: ahora,
      }
      almacen.receipts.push(ticket)
      return retraso(ticket)
    },
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: claves.receipts(ticket.household) })
    },
  })
}

/**
 * Transcribe la foto ya subida a `markdown`, via vision (Claude), sin
 * analizar ni tocar compras/despensa -- eso lo sigue haciendo
 * useAnalizarTicket() aparte. Si el servidor no tiene la clave configurada,
 * o Claude falla, la llamada rechaza con el mensaje del backend (mismo
 * ApiError que el resto de mutaciones): el texto se queda vacio y el
 * usuario puede escribirlo o pegarlo a mano, como siempre.
 */
export function useTranscribirTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number }) => {
      if (BACKEND_LISTO) return api.post<Receipt>(`${BASE}/receipt/${input.id}/transcribir/`)

      // Sin backend real no hay vision que llamar: se deja tal cual para
      // que la pantalla caiga al mismo mensaje de error que si faltara la
      // clave, y el flujo manual (escribir el texto) siga siendo el camino.
      throw new Error('La transcripción automática no está disponible en este modo.')
    },
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: claves.receipt(ticket.id) })
      qc.invalidateQueries({ queryKey: claves.receipts(ticket.household) })
    },
  })
}

/**
 * Analiza (o reanaliza) un ticket. `markdown`, si se manda, reemplaza el
 * texto guardado en la misma llamada -- es el arreglo cuando la transcripcion
 * ha leido mal una linea: se corrige el texto y se vuelve a analizar de una.
 *
 * El backend responde 400 cuando no hay texto que analizar, pero con el
 * propio ticket (ya en status 'error') en el cuerpo: se recupera ese cuerpo
 * en vez de dejar que el 400 tumbe la mutacion, para que la pantalla lo trate
 * igual que cualquier otro ticket en error (mensaje en rojo + reintentar),
 * no como un fallo de red.
 */
export function useAnalizarTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; markdown?: string }) => {
      if (BACKEND_LISTO) {
        try {
          return await api.post<Receipt>(
            `${BASE}/receipt/${input.id}/analizar/`,
            input.markdown !== undefined ? { markdown: input.markdown } : undefined,
          )
        } catch (e) {
          if (e instanceof ApiError && e.status === 400 && e.body && typeof e.body === 'object') {
            return e.body as Receipt
          }
          throw e
        }
      }

      const ticket = almacen.receipts.find((t) => t.id === input.id)
      if (!ticket) throw new Error('Ticket no encontrado')
      if (input.markdown !== undefined) ticket.markdown = input.markdown
      ticket.updated_at = new Date().toISOString()

      if (!ticket.markdown.trim()) {
        ticket.status = 'error'
        ticket.error = 'No hay texto que analizar. Escribe o pega la transcripcion del ticket.'
        return retraso(ticket)
      }

      // Analisis de mentira: no reimplementa el parser real (eso lo hace el
      // backend), solo deja el ticket en un estado plausible para poder
      // probar el resto del flujo con BACKEND_LISTO = false.
      ticket.status = 'analizado'
      ticket.error = ''
      ticket.supermarket = 'Mercadona'
      ticket.date = today()
      ticket.total = '19.10'
      ticket.parsed = {
        supermarket: ticket.supermarket,
        date: ticket.date,
        total: ticket.total,
        lines: [
          { name: 'Leche entera 1L', units: '2', amount: '2', unit: 'unit', unit_price: '0.89', total: '1.78' },
          { name: 'Pan de molde', units: '1', amount: '1', unit: 'unit', unit_price: null, total: '1.45' },
          { name: 'Platano', units: null, amount: '0.760', unit: 'kg', unit_price: '3.00', total: '2.28' },
        ],
        warnings: ['Análisis de ejemplo: todavía sin backend real (BACKEND_LISTO = false).'],
      }
      return retraso(ticket)
    },
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: claves.receipt(ticket.id) })
      qc.invalidateQueries({ queryKey: claves.receipts(ticket.household) })
    },
  })
}

/** Confirma un ticket ya analizado: a partir de aqui existe una Purchase real. */
export function useConfirmarTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number }) => {
      if (BACKEND_LISTO) return api.post<Receipt>(`${BASE}/receipt/${input.id}/confirmar/`)

      const ticket = almacen.receipts.find((t) => t.id === input.id)
      if (!ticket) throw new Error('Ticket no encontrado')
      if (ticket.status === 'confirmado') return retraso(ticket) // idempotente, igual que el backend real
      if (ticket.status !== 'analizado') throw new Error('El ticket todavía no está analizado.')

      const lineas = ticket.parsed.lines ?? []
      const purchaseId = siguienteId()
      almacen.purchases.push({
        id: purchaseId,
        household: ticket.household,
        date: ticket.date ?? today(),
        description: `Ticket ${ticket.supermarket || 'sin identificar'}`,
        supermarket: ticket.supermarket,
        covers_days: 7,
        shopping_list: null,
        trip: null,
      })
      for (const linea of lineas) {
        const amount = Number(String(linea.amount).replace(',', '.')) || 0
        almacen.purchaseItems.push({
          id: siguienteId(),
          purchase: purchaseId,
          ingredient: null,
          name: linea.name,
          amount,
          unit: linea.unit,
          price: linea.total,
          purchased: true,
          is_shared: true,
          member: null,
          shopping_list_item: null,
        })
        // Igual que confirmar de verdad: lo comprado tambien entra en la despensa.
        almacen.pantryItems.push({
          id: siguienteId(),
          household: ticket.household,
          ingredient: null,
          name: linea.name,
          unit: linea.unit,
          amount,
        })
      }

      ticket.status = 'confirmado'
      ticket.purchase = purchaseId
      ticket.updated_at = new Date().toISOString()
      return retraso(ticket)
    },
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: claves.receipt(ticket.id) })
      qc.invalidateQueries({ queryKey: claves.receipts(ticket.household) })
      // Confirmar crea una Purchase real -- y con ella toca Despensa, Resumen
      // y puede marcar lineas de la Lista si el ticket venia de una compra en
      // curso. Mismo motivo y mismas invalidaciones que useMarcarComprado
      // (ver su comentario): no se sabe aqui el id de esa Purchase ni si tocó
      // alguna linea de la lista, asi que se invalidan los prefijos enteros.
      qc.invalidateQueries({ queryKey: ['compra', 'purchases'] })
      qc.invalidateQueries({ queryKey: ['compra', 'purchase-items'] })
      qc.invalidateQueries({ queryKey: ['compra', 'breakdown'] })
      qc.invalidateQueries({ queryKey: prefijos.pantryItems })
      qc.invalidateQueries({ queryKey: prefijos.summary })
      qc.invalidateQueries({ queryKey: prefijos.purchasesTotal })
      qc.invalidateQueries({ queryKey: ['compra', 'shopping-list-items'] })
    },
  })
}

/** Borra un ticket. No toca la Purchase que ya se hubiera creado al confirmarlo. */
export function useEliminarTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; household: number }) => {
      if (BACKEND_LISTO) {
        await api.del(`${BASE}/receipt/${input.id}/`)
        return input
      }
      const idx = almacen.receipts.findIndex((t) => t.id === input.id)
      if (idx >= 0) almacen.receipts.splice(idx, 1)
      return retraso(input)
    },
    onSuccess: ({ id, household }) => {
      qc.removeQueries({ queryKey: claves.receipt(id) })
      qc.invalidateQueries({ queryKey: claves.receipts(household) })
    },
  })
}

// -------------------------------------------------------------- utilidades

export function fechaPorDefectoNuevaCompra(): string {
  return today()
}
