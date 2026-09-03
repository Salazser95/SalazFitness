import type { QueryClient } from '@tanstack/react-query'
import { hasSession, refreshAccessToken } from './api'
import { urlApi } from './config'
import { readTokens } from './tokens'

/**
 * Cliente de tiempo real del hogar: escucha el SSE de cambios que expone el
 * backend y invalida las queries de TanStack Query que toquen, para que la
 * app de quien no hizo el cambio se refresque sola sin recargar.
 *
 * Por que fetch() a mano y no EventSource (la decision no obvia de este
 * fichero): EventSource no deja mandar cabeceras, y aqui la autenticacion es
 * "Authorization: Bearer <token>" (ver lib/api.ts y lib/tokens.ts). Meter el
 * access token en la URL como query param no vale: acaba en los logs del
 * servidor y de cualquier proxy por el que pase la peticion. La unica forma
 * correcta de autenticar un SSE con Bearer es fetch() + ReadableStream,
 * parseando las tramas a mano con el reader de la respuesta.
 *
 * El servidor corta el stream a los ~5 minutos a proposito (para no dejar un
 * worker ocupado eternamente): cuando el stream se cierra solo, sin error,
 * es funcionamiento normal y aqui se reconecta enseguida, sin backoff.
 */

const RUTA_EVENTOS = '/api/v2/salaz/events/'

const BACKOFF_INICIAL_MS = 1_000
const BACKOFF_MAXIMO_MS = 30_000
// Cuanto se espera entre comprobaciones cuando no hay sesion o la pestana
// esta oculta, antes de volver a mirar si ya toca conectar.
const ESPERA_INACTIVO_MS = 3_000
// Ventana en la que se agrupan las entidades que van llegando antes de
// invalidar: una compra con veinte lineas manda veinte tramas, no veinte
// invalidaciones.
const VENTANA_LOTE_MS = 250

// ============================================================
// Parseo de SSE (funciones puras, exportadas para poder probarlas sueltas)
// ============================================================

export type TramaSSE = {
  id: string | null
  event: string | null
  data: string
}

/**
 * Separa un buffer acumulado en tramas SSE completas (las que ya tienen su
 * linea en blanco final) y lo que queda a medias. Puro y sin estado propio:
 * quien lo usa va acumulando en su propio buffer y pasando el texto entero
 * cada vez, no solo el trozo nuevo -- asi una trama partida a mitad entre dos
 * lecturas del reader (p.ej. justo en medio de "data:" o justo en el "\n\n")
 * se completa sola en la siguiente vuelta en vez de perderse.
 */
export function separarTramas(buffer: string): { tramas: string[]; resto: string } {
  const normalizado = buffer.replace(/\r\n/g, '\n')
  const partes = normalizado.split('\n\n')
  // El ultimo trozo es lo que no tiene todavia su separador: se devuelve
  // como resto, no como trama.
  const resto = partes.pop() ?? ''
  return { tramas: partes, resto }
}

/** Convierte el texto de una trama ya completa en sus campos. Null si es solo un comentario (el ping). */
export function parsearTrama(textoTrama: string): TramaSSE | null {
  if (textoTrama.trim() === '') return null

  let id: string | null = null
  let event: string | null = null
  const lineasData: string[] = []
  let huboCampo = false

  for (const linea of textoTrama.split('\n')) {
    if (linea === '') continue
    if (linea.startsWith(':')) continue // comentario SSE (el ": ping" del servidor)

    huboCampo = true
    const posDosPuntos = linea.indexOf(':')
    const campo = posDosPuntos === -1 ? linea : linea.slice(0, posDosPuntos)
    let valor = posDosPuntos === -1 ? '' : linea.slice(posDosPuntos + 1)
    if (valor.startsWith(' ')) valor = valor.slice(1) // el espacio tras los dos puntos es parte del formato, no del valor

    if (campo === 'id') id = valor
    else if (campo === 'event') event = valor
    else if (campo === 'data') lineasData.push(valor)
    // otros campos del estandar SSE (retry...) no se usan aqui
  }

  if (!huboCampo) return null
  return { id, event, data: lineasData.join('\n') }
}

// ============================================================
// Entidad -> que invalidar
// ============================================================

export type EntidadCambio =
  | 'household'
  | 'household-member'
  | 'purchase'
  | 'purchase-item'
  | 'pantry-item'
  | 'shopping-list'
  | 'shopping-list-item'
  | 'recipe'
  | 'recipe-ingredient'
  | 'ingredient-price'
  | 'weekly-plan'
  | 'receipt'

type CargaCambio = { entity?: string; household?: number }

/**
 * Que prefijos de query key toca cada entidad. Son los mismos strings que
 * usan `claves` y `prefijos` en features/compra/datos.ts -- verificados
 * contra ese fichero linea a linea, no inventados -- pero copiados aqui como
 * arrays literales porque datos.ts no los exporta y este modulo no debe
 * importar hooks de React desde una feature.
 */
function prefijosParaEntidad(entity: EntidadCambio): (readonly unknown[])[] {
  switch (entity) {
    case 'household':
    case 'household-member':
      // claves.household, prefijos.summary, prefijos.breakdown
      return [
        ['compra', 'household'],
        ['compra', 'summary'],
        ['compra', 'breakdown'],
      ]
    case 'purchase':
    case 'purchase-item':
      // claves.purchases(*), claves.purchaseItems(*), prefijos.breakdown,
      // prefijos.summary, prefijos.gastoSemanal, prefijos.purchasesTotal
      return [
        ['compra', 'purchases'],
        ['compra', 'purchase-items'],
        ['compra', 'breakdown'],
        ['compra', 'summary'],
        ['compra', 'gasto-semanal'],
        ['compra', 'purchases-total'],
      ]
    case 'pantry-item':
      // prefijos.pantryItems
      return [['compra', 'pantry-items']]
    case 'shopping-list':
    case 'shopping-list-item':
      // claves.shoppingList(*), claves.shoppingListItems(*), la cobertura
      return [
        ['compra', 'shopping-list'],
        ['compra', 'shopping-list-items'],
        ['compra', 'cobertura'],
      ]
    case 'recipe':
    case 'recipe-ingredient':
      // claves.recipes(*), claves.recipe(*), claves.recipeIngredients(*),
      // claves.recipeCost(*), prefijos.costeMedioComida
      return [
        ['compra', 'recipes'],
        ['compra', 'recipe'],
        ['compra', 'recipe-ingredients'],
        ['compra', 'recipe-cost'],
        ['compra', 'coste-medio-comida'],
      ]
    case 'ingredient-price':
      // No hay cache de precios sueltos en el cliente (se piden al vuelo
      // dentro de mutations, no con useQuery): lo que de verdad cambia con
      // el precio es el coste ya calculado de las recetas que usan ese
      // ingrediente, igual que hace useActualizarIngredienteReceta.
      return [
        ['compra', 'recipe-cost'],
        ['compra', 'coste-medio-comida'],
      ]
    case 'weekly-plan':
      // Todavia no hay pantalla de plan semanal en el cliente (modulo
      // futuro): se deja el prefijo listo para cuando exista, hoy no
      // invalida ninguna query real.
      return [['compra', 'weekly-plan']]
    case 'receipt':
      // claves.receipts(*), claves.receipt(*)
      return [
        ['compra', 'receipts'],
        ['compra', 'receipt'],
      ]
    default:
      return []
  }
}

// ============================================================
// Cliente de tiempo real
// ============================================================

/**
 * Arranca el cliente de tiempo real y devuelve la funcion para pararlo.
 * Pensado para llamarse una vez, al arrancar la app (ver main.tsx).
 */
export function iniciarTiempoReal(queryClient: QueryClient): () => void {
  let detenido = false
  let controladorActual: AbortController | null = null
  let ultimoId: string | null = null
  let intentos = 0
  let temporizadorEspera: ReturnType<typeof setTimeout> | null = null

  // Lote de invalidaciones pendientes, indexado por el JSON del prefijo para
  // no repetir el mismo dos veces dentro de la misma ventana.
  const loteClaves = new Map<string, readonly unknown[]>()
  let temporizadorLote: ReturnType<typeof setTimeout> | null = null

  function vaciarLote() {
    temporizadorLote = null
    const prefijos = [...loteClaves.values()]
    loteClaves.clear()
    for (const queryKey of prefijos) {
      queryClient.invalidateQueries({ queryKey: queryKey as unknown[] })
    }
  }

  function encolarInvalidacion(entity: EntidadCambio) {
    for (const prefijo of prefijosParaEntidad(entity)) {
      loteClaves.set(JSON.stringify(prefijo), prefijo)
    }
    if (temporizadorLote === null) {
      temporizadorLote = setTimeout(vaciarLote, VENTANA_LOTE_MS)
    }
  }

  const ENTIDADES_VALIDAS = new Set<string>([
    'household',
    'household-member',
    'purchase',
    'purchase-item',
    'pantry-item',
    'shopping-list',
    'shopping-list-item',
    'recipe',
    'recipe-ingredient',
    'ingredient-price',
    'weekly-plan',
    'receipt',
  ])

  function procesarTrama(trama: TramaSSE) {
    if (trama.id) ultimoId = trama.id
    if (trama.event !== 'cambio' || !trama.data) return
    try {
      const carga = JSON.parse(trama.data) as CargaCambio
      if (carga.entity && ENTIDADES_VALIDAS.has(carga.entity)) {
        encolarInvalidacion(carga.entity as EntidadCambio)
      }
    } catch {
      // trama con JSON mal formado: se ignora, no merece tumbar la conexion
    }
  }

  function pestanaVisible(): boolean {
    return document.visibilityState === 'visible'
  }

  /** Backoff exponencial con tope y jitter, para no reconectar todos los clientes a la vez. */
  function proximaEsperaBackoff(): number {
    const base = Math.min(BACKOFF_MAXIMO_MS, BACKOFF_INICIAL_MS * 2 ** intentos)
    intentos += 1
    return base / 2 + Math.random() * (base / 2)
  }

  function esperar(ms: number): Promise<void> {
    return new Promise((resolve) => {
      temporizadorEspera = setTimeout(resolve, ms)
    })
  }

  async function conectarYLeer(): Promise<void> {
    const tokens = readTokens()
    if (!tokens) return // sin sesion: nada que hacer, el bucle ya lo comprueba antes de llamar aqui

    const controller = new AbortController()
    controladorActual = controller

    try {
      const ruta = ultimoId ? `${RUTA_EVENTOS}?desde=${encodeURIComponent(ultimoId)}` : RUTA_EVENTOS
      const opciones = (access: string): RequestInit => ({
        headers: { Authorization: `Bearer ${access}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      })

      let res = await fetch(urlApi(ruta), opciones(tokens.access))

      if (res.status === 401) {
        const nuevoAccess = await refreshAccessToken()
        if (!nuevoAccess) {
          // El usuario no tiene sesion valida de verdad: no tiene sentido
          // seguir reintentando, la UI ya se encarga de mandarlo al login.
          detenido = true
          return
        }
        res = await fetch(urlApi(ruta), opciones(nuevoAccess))
        if (res.status === 401) {
          detenido = true
          return
        }
      }

      if (!res.ok || !res.body) {
        throw new Error(`Conexion de tiempo real: HTTP ${res.status}`)
      }

      // Conexion establecida de verdad: se reinicia el backoff.
      intentos = 0

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { tramas, resto } = separarTramas(buffer)
        buffer = resto
        for (const textoTrama of tramas) {
          const trama = parsearTrama(textoTrama)
          if (trama) procesarTrama(trama)
        }
      }
      // El stream se cierra solo aqui cuando el servidor corta a los ~5 min
      // a proposito: no es un error, el bucle de fuera reconecta enseguida.
    } finally {
      controladorActual = null
    }
  }

  async function bucle() {
    while (!detenido) {
      if (!hasSession() || !pestanaVisible()) {
        await esperar(ESPERA_INACTIVO_MS)
        continue
      }

      let falloDeRed = false
      try {
        await conectarYLeer()
      } catch (e) {
        // Un AbortError viene de detener() o de que la pestana se oculto a
        // mitad de stream (ver visibilitychange abajo): ninguno de los dos
        // es un fallo de red, no cuenta para el backoff.
        if (!(e instanceof DOMException && e.name === 'AbortError')) falloDeRed = true
      }

      if (detenido) break
      if (falloDeRed) await esperar(proximaEsperaBackoff())
      // sin fallo (corte normal del servidor o pausa por pestana oculta): se
      // vuelve arriba directo, sin esperar -- la comprobacion de arriba ya
      // decide si toca reconectar ya o esperar a que vuelva la pestana
    }
  }

  function alCambiarVisibilidad() {
    // Cortar el stream nada mas ocultarse, no esperar a que el servidor lo
    // note: en movil mantenerlo abierto en segundo plano gasta batería para
    // nada.
    if (document.visibilityState === 'hidden') controladorActual?.abort()
  }
  document.addEventListener('visibilitychange', alCambiarVisibilidad)

  bucle()

  return function detener() {
    detenido = true
    document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    if (temporizadorEspera) clearTimeout(temporizadorEspera)
    if (temporizadorLote) clearTimeout(temporizadorLote)
    controladorActual?.abort()
  }
}
