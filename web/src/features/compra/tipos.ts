/**
 * Tipos del modulo de compra y coste.
 *
 * Reflejan el contrato que va a implementar el backend en `/api/v2/salaz/`
 * (ver encargo). Dos decisiones de forma no estaban fijadas en el contrato y
 * hay que confirmarlas con el agente de backend cuando aterrice el modulo real:
 *
 * 1. `consumption_share` es un PORCENTAJE en puntos (0-100), no una fraccion
 *    0-1. Ej: 60 significa "60% del gasto compartido". Las cifras de un
 *    hogar deben sumar 100.
 * 2. Los campos de dinero (`price`, `estimated_price`, importes de los
 *    endpoints de resumen) son STRING decimal en euros, igual que wger
 *    serializa sus DecimalField (ver "weight": "80" en API-CONTRACT.md).
 *    El frontend los convierte a centimos enteros nada mas leerlos
 *    (ver calculo.ts) y solo vuelve a texto para mostrarlos.
 *
 * Los `id` son numericos porque DRF los da asi. Antes de que exista una fila
 * real en el backend, el frontend usa ids negativos para lo que crea en
 * memoria (ver datos.ts).
 */

export type Household = {
  id: number
  name: string
  members: HouseholdMember[]
}

export type HouseholdMember = {
  id: number
  household: number
  name: string
  /** Puntos porcentuales, 0-100. La suma de todos los miembros debe dar 100. */
  consumption_share: number
}

export type Purchase = {
  id: number
  household: number
  /** Fecha ISO YYYY-MM-DD */
  date: string
  description: string
  supermarket: string
  /** Cuantos dias cubre esta compra, para el coste diario por persona. */
  covers_days: number
}

export type PurchaseItem = {
  id: number
  purchase: number
  /** Id de `ingredient` de wger, si se enlazo con la base de alimentos. */
  ingredient: number | null
  name: string
  amount: number
  unit: string
  /** Decimal en euros, como string (ver nota de arriba). */
  price: string
  is_shared: boolean
  /** Obligatorio cuando is_shared es false: de quien es este gasto. */
  member: number | null
}

export type Recipe = {
  id: number
  household: number
  name: string
  servings: number
  instructions: string
}

export type RecipeIngredient = {
  id: number
  recipe: number
  /** El contrato no admite texto libre aqui: siempre un ingrediente de wger. */
  ingredient: number
  /** Cantidad en gramos. */
  amount: number
}

export type ShoppingList = {
  id: number
  household: number
  name: string
  start_date: string
  end_date: string
}

export type ShoppingListItem = {
  id: number
  shopping_list: number
  ingredient: number | null
  name: string
  amount: number
  unit: string
  estimated_price: string
  purchased: boolean
  supermarket: string | null
}

export type IngredientPrice = {
  id: number
  ingredient: number
  household: number
  price: string
  amount: number
  unit: string
  supermarket: string
  date: string
  is_current: boolean
}

// --------------------------------------------------------- respuestas ad-hoc

export type CostePorPersona = {
  member: number
  name: string
  /** Puntos porcentuales aplicados, 0-100. */
  share: number
  amount: string
}

export type PurchaseBreakdown = {
  total: string
  cost_per_day: string
  cost_per_person: CostePorPersona[]
  shared_total: string
  individual_total: string
}

export type ResumenPorPersona = {
  member: number
  name: string
  amount: string
}

export type HouseholdSummary = {
  total: string
  per_person: ResumenPorPersona[]
  daily: string
  weekly: string
  biweekly: string
  monthly: string
}

export type RecipeCost = {
  total_cost: string
  cost_per_serving: string
  energy: number
  protein: number
  carbohydrates: number
  fat: number
}

export type GenerarListaPayload = {
  household: number
  start_date: string
  end_date: string
  recipe_ids: number[]
}

// ------------------------------------------------------- busqueda de wger

/** Resultado de GET /api/v2/ingredient/?name__search= (endpoint real de wger). */
export type IngredientWger = {
  id: number
  name: string
  energy: number | null
  protein: string | null
  carbohydrates: string | null
  fat: string | null
}
