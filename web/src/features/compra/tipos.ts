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
  /**
   * Id de la cuenta vinculada, o null si este miembro no tiene cuenta
   * propia (solo existe para el reparto de gasto). Solo lectura: para
   * vincular o desvincular se manda `link_username` (ver useCrearMiembro /
   * useActualizarMiembro en datos.ts), nunca este id directamente.
   */
  user: number | null
  /** Nombre de usuario de la cuenta vinculada, solo para mostrar. */
  username: string | null
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
  /** Si ya se ha metido en el carro durante esta compra. */
  purchased: boolean
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
  /**
   * URL de la foto de la receta, o null si no tiene. Campo anadido por el
   * orquestador en backend/salaz/models/recipe.py (ImageField), expuesto por
   * el serializer bajo la misma clave `image`.
   */
  image: string | null
}

export type RecipeIngredient = {
  id: number
  recipe: number
  /** El contrato no admite texto libre aqui: siempre un ingrediente de wger. */
  ingredient: number
  /** Cantidad en gramos. */
  amount: number
}

/** Categoria de frescura que asigna el backend (ver backend/salaz/frescura.py). */
export type CategoriaFrescura =
  | 'despensa'
  | 'congelado'
  | 'lacteo'
  | 'fruta'
  | 'fruta_delicada'
  | 'verdura'
  | 'carne'
  | 'pescado'
  | 'huevos'
  | 'panaderia'

/** Una tanda de compra dentro de una lista: un viaje al supermercado. */
export type Tanda = {
  /** 1 = la compra grande del primer dia; 2, 3... reposiciones de fresco. */
  trip: number
  /** Fecha ISO en la que toca hacer esta compra, o null en listas antiguas. */
  buy_date: string | null
  items: number
  purchased: number
  estimated_total: string
  done: boolean
}

export type ShoppingList = {
  id: number
  household: number
  name: string
  start_date: string
  end_date: string
  /**
   * Id del plan de nutricion del que salio la lista, o cadena vacia si se
   * genero desde recetas o a mano. Es lo que une las dos mitades de la app.
   */
  nutrition_plan: string
  /** Dias que cubre la lista. 12 por defecto. */
  days: number
  trips: Tanda[]
}

export type ShoppingListItem = {
  id: number
  shopping_list: number
  ingredient: number | null
  name: string
  /**
   * Identifica "el mismo producto" a traves de sus tandas: lo asigna siempre
   * el backend (generador_lista comparte uno por producto entre sus tandas;
   * una linea suelta creada a mano nace con el suyo propio). Nunca se agrupa
   * por nombre en el cliente: dos lineas de texto libre con el mismo nombre
   * en la misma lista no son necesariamente el mismo producto que comprar.
   */
  group_key: string
  amount: number
  unit: string
  estimated_price: string
  purchased: boolean
  supermarket: string | null
  category: CategoriaFrescura | ''
  /** Dias que aguanta el producto desde que se compra. */
  shelf_life_days: number | null
  trip: number
  buy_date: string | null
  /** Dias del plan que cubre esta linea concreta. */
  days_covered: number
  /** Hay que meterlo en el congelador al llegar a casa. */
  freeze_on_arrival: boolean
  /** De donde sale: 'Desayuno, Cena', 'Fruta y verdura'... */
  source: string
  note: string
}

/**
 * Cuanto queda en la despensa de un hogar de un producto dado. Se rellena a
 * mano (ver DespensaPage) y en automatico al marcar/desmarcar una linea de
 * compra como comprada (ver CompraDetalle.tsx / el campo `purchased` de
 * PurchaseItem).
 */
export type PantryItem = {
  id: number
  household: number
  ingredient: number | null
  name: string
  unit: string
  amount: number
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
  /**
   * Calculado por el backend (solo lectura): precio normalizado a 100 g/ml.
   * `null` si la unidad es `unit` (pieza suelta, sin peso fijo) o si no hay
   * cantidad valida. Verificado contra backend/salaz/models/ingredient_price.py.
   */
  price_per_100g: string | null
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
  /**
   * Verificado contra el backend real 2026-08-23: las macros vienen anidadas
   * bajo esta clave, no planas como se penso al escribir el contrato.
   */
  macros_per_serving: {
    energy: number
    protein: number
    carbohydrates: number
    fat: number
  }
}

/** Cuerpo de POST /shopping-list/from-nutrition/. */
export type GenerarDesdeNutricionPayload = {
  household: number
  /** Id del plan; si se omite, el backend usa el mas reciente del usuario. */
  plan?: string
  /** Fecha ISO del primer dia. Por defecto, hoy. */
  start_date?: string
  /** 12 por defecto, que es lo que dura una compra grande. */
  days?: number
  /** Anadir fruta y verdura del dia a dia. Por defecto, si. */
  include_produce?: boolean
  /** Incluir moras, fresas y arandanos. Por defecto, si. */
  red_fruit?: boolean
  /** Forzar congelar (o no) todo lo fresco. Sin esto lo decide la vida util. */
  freeze?: boolean
}

/** Respuesta de GET /shopping-list/{id}/coverage/?date=. */
export type CoberturaComida = {
  meal: string
  name: string
  status: 'comprado' | 'parcial' | 'pendiente' | 'sin_datos'
  total: number
  purchased: number
}

export type Cobertura = {
  date: string
  shopping_list: number
  nutrition_plan: string
  meals: CoberturaComida[]
  ingredients: { ingredient: number; purchased: boolean }[]
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
