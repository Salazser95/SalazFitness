import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChefHat, Clock, ScanBarcode, Search, Star, Trash2, X } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, Field, SkeletonList, Superposicion, UndoBar } from '../../components/ui'
import { useUndoStack } from '../../lib/undo'
import { AnotarRecetaModal } from '../compra/componentes/AnotarRecetaModal'
import { useHousehold, useRecipes } from '../compra/datos'
import type { Recipe } from '../compra/tipos'
import {
  comidasOrdenadas,
  macrosFor,
  useAgregarAlimento,
  useAsegurarComidas,
  useBuscarIngredientes,
  useBuscarPorCodigo,
  usePlan,
  usePlanInfo,
} from './api'
import type { Ingredient } from './api'
import {
  alternarFavorito,
  leerFavoritos,
  leerRecientes,
  quitarReciente,
  registrarReciente,
} from './local'
import type { AlimentoGuardado } from './local'
import { int, num, today } from '../../lib/format'

type Alimento = Ingredient | AlimentoGuardado
type Pestana = 'recetas' | 'buscar' | 'recientes' | 'favoritos'

// ----------------------------------------------------------------- recetas

function ListaRecetas({ recetas, onElegir }: { recetas: Recipe[]; onElegir: (r: Recipe) => void }) {
  return (
    <ul className="space-y-2">
      {recetas.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-border bg-surface-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-3"
            onClick={() => onElegir(r)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-fg">{r.name}</span>
              <span className="block truncate text-xs text-fg-subtle">{r.servings} raciones</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------- escaner de codigos

// El navegador expone `BarcodeDetector` en runtime cuando esta disponible,
// pero TypeScript (lib DOM de este proyecto) no lo declara: se define aqui
// el minimo necesario. Si el API no existe, el boton de escaner ni se pinta.
type ResultadoDeteccion = { rawValue: string }
type BarcodeDetectorLike = { detect: (fuente: CanvasImageSource) => Promise<ResultadoDeteccion[]> }
type BarcodeDetectorCtor = new (opciones?: { formats?: string[] }) => BarcodeDetectorLike

function obtenerBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
  return (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
}

function EscanerCodigoBarras({
  onDetectado,
  onCerrar,
}: {
  onDetectado: (codigo: string) => void
  onCerrar: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    let stream: MediaStream | null = null
    let raf = 0
    const Detector = obtenerBarcodeDetector()

    if (!Detector) {
      setError('El escáner no está disponible en este navegador.')
      return
    }
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })

    async function bucle() {
      if (!activo || !videoRef.current) return
      try {
        const resultados = await detector.detect(videoRef.current)
        if (resultados[0]?.rawValue) {
          onDetectado(resultados[0].rawValue)
          return
        }
      } catch {
        /* fotograma no valido, se reintenta en el siguiente */
      }
      if (activo) raf = requestAnimationFrame(() => void bucle())
    }

    async function iniciar() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!activo || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        void bucle()
      } catch {
        setError('No se pudo acceder a la cámara.')
      }
    }

    void iniciar()
    return () => {
      activo = false
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetectado])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4">
      <video ref={videoRef} className="max-h-[70vh] w-full max-w-md rounded-[20px] object-cover" muted playsInline />
      <p className="text-sm text-fg-muted">{error ?? 'Apunta al código de barras del producto.'}</p>
      <Button variant="secondary" onClick={onCerrar}>
        Cerrar
      </Button>
    </div>
  )
}

// ----------------------------------------------------------------- listas

function ListaAlimentos({
  alimentos,
  favoritosIds,
  onElegir,
  onQuitar,
}: {
  alimentos: Alimento[]
  favoritosIds: Set<number>
  onElegir: (a: Alimento) => void
  /** Solo en Favoritos/Recientes: quitar de la lista, directo y sin confirmar. */
  onQuitar?: (a: Alimento) => void
}) {
  return (
    <ul className="space-y-2">
      {alimentos.map((a) => (
        <li key={a.id} className="flex items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[14px] border border-border bg-surface-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-3"
            onClick={() => onElegir(a)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-fg">{a.name}</span>
              <span className="block truncate text-xs text-fg-subtle">
                {a.brand ?? 'Genérico'} · {int(a.energy)} kcal/100 g
              </span>
            </span>
            {favoritosIds.has(a.id) ? (
              <Star size={16} className="shrink-0 text-primary" fill="currentColor" aria-hidden="true" />
            ) : null}
          </button>
          {onQuitar ? (
            <button
              type="button"
              onClick={() => onQuitar(a)}
              aria-label={`Quitar ${a.name}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

// -------------------------------------------------------------- hoja de add

function HojaAlimento({
  alimento,
  gramos,
  onGramos,
  mealOptions,
  mealId,
  onMeal,
  esFavorito,
  onFavorito,
  anadiendo,
  onAnadir,
  onCerrar,
}: {
  alimento: Alimento
  gramos: number
  onGramos: (g: number) => void
  mealOptions: { id: string; nombre: string }[]
  mealId: string
  onMeal: (id: string) => void
  esFavorito: boolean
  onFavorito: () => void
  anadiendo: boolean
  onAnadir: () => void
  onCerrar: () => void
}) {
  const macros = macrosFor(alimento, gramos)

  return (
    <Superposicion abierto onClose={onCerrar} etiqueta={alimento.name} alineacion="abajo">
      <Card
        as="section"
        className="glass animate-rise w-full max-w-lg rounded-b-none border-b-0 pb-safe"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-xl text-fg">{alimento.name}</p>
            {alimento.brand ? <p className="truncate text-sm text-fg-muted">{alimento.brand}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className={`rounded-[10px] p-2 transition-colors duration-150 hover:bg-surface-2 ${esFavorito ? 'text-primary' : 'text-fg-subtle'}`}
              aria-label={esFavorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              onClick={onFavorito}
            >
              <Star size={18} aria-hidden="true" fill={esFavorito ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-2"
              aria-label="Cerrar"
              onClick={onCerrar}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <Field
          label="Cantidad (g)"
          type="number"
          inputMode="decimal"
          min={0}
          value={gramos}
          onChange={(e) => onGramos(Math.max(0, Number(e.target.value)))}
        />

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="font-display text-2xl leading-none tnum text-fg">{int(macros.energy)}</p>
            <p className="mt-1 text-xs text-fg-muted">kcal</p>
          </div>
          <div>
            <p className="font-display text-2xl leading-none tnum" style={{ color: '#22D3EE' }}>
              {num(macros.protein)}
            </p>
            <p className="mt-1 text-xs text-fg-muted">prote. (g)</p>
          </div>
          <div>
            <p className="font-display text-2xl leading-none tnum" style={{ color: '#C6F135' }}>
              {num(macros.carbohydrates)}
            </p>
            <p className="mt-1 text-xs text-fg-muted">hidra. (g)</p>
          </div>
          <div>
            <p className="font-display text-2xl leading-none tnum" style={{ color: '#A78BFA' }}>
              {num(macros.fat)}
            </p>
            <p className="mt-1 text-xs text-fg-muted">grasa (g)</p>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="hoja-comida" className="mb-1.5 block text-sm font-medium text-fg-muted">
            Comida
          </label>
          <select
            id="hoja-comida"
            className="h-12 w-full rounded-[14px] border border-border bg-surface-2 px-4 text-fg transition-colors focus:border-primary"
            value={mealId}
            onChange={(e) => onMeal(e.target.value)}
          >
            {mealOptions.length === 0 ? <option value="">Crea un plan primero</option> : null}
            {mealOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <Button
          full
          size="lg"
          className="mt-5"
          disabled={!mealId || gramos <= 0 || anadiendo}
          onClick={onAnadir}
        >
          {anadiendo ? 'Añadiendo...' : 'Añadir al diario'}
        </Button>
      </Card>
    </Superposicion>
  )
}

// -------------------------------------------------------------------- pagina

export default function BuscarPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fecha = params.get('fecha') ?? today()
  const mealParam = params.get('meal')

  // Por defecto se abre en Recetas: para lo que ya se cocina y se guarda
  // como receta propia, es mas rapido anotar el plato entero que buscar
  // cada alimento suelto en el catalogo de 177.302 de wger.
  const [pestana, setPestana] = useState<Pestana>('recetas')
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [escanerAbierto, setEscanerAbierto] = useState(false)
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null)

  const [seleccionado, setSeleccionado] = useState<Alimento | null>(null)
  const [gramos, setGramos] = useState(100)
  const [mealIdManual, setMealIdManual] = useState<string | null>(null)
  const [recetaSeleccionada, setRecetaSeleccionada] = useState<Recipe | null>(null)

  const [favoritos, setFavoritos] = useState<AlimentoGuardado[]>(() => leerFavoritos())
  const [recientes, setRecientes] = useState<AlimentoGuardado[]>(() => leerRecientes())
  const deshacer = useUndoStack()

  // Debounce de 350 ms: la base tiene 177.302 alimentos, no se puede buscar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto), 350)
    return () => clearTimeout(t)
  }, [texto])

  const busqueda = useBuscarIngredientes(debounced)
  const porCodigo = useBuscarPorCodigo()

  const plan = usePlan()
  const planInfo = usePlanInfo(plan.data?.id)
  useAsegurarComidas(planInfo.data)
  const agregar = useAgregarAlimento(plan.data?.id, fecha)

  const household = useHousehold()
  const recetas = useRecipes(household.data?.id ?? 0)

  const mealOptions = useMemo(
    () => comidasOrdenadas(planInfo.data).map((m) => ({ id: m.id, nombre: m.name })),
    [planInfo.data],
  )
  const mealId = mealIdManual ?? mealParam ?? mealOptions[0]?.id ?? ''

  const favoritosIds = useMemo(() => new Set(favoritos.map((f) => f.id)), [favoritos])
  const detectorDisponible = obtenerBarcodeDetector() !== null

  function abrirSheet(a: Alimento) {
    setSeleccionado(a)
    setGramos(100)
    setErrorCodigo(null)
  }

  function alDetectarCodigo(codigo: string) {
    setEscanerAbierto(false)
    porCodigo.mutate(codigo, {
      onSuccess: (ing) => {
        if (ing) abrirSheet(ing)
        else setErrorCodigo(`No se encontró ningún alimento con el código ${codigo}.`)
      },
    })
  }

  function alternarFav() {
    if (!seleccionado) return
    setFavoritos(alternarFavorito(seleccionado))
  }

  // Sin confirmar: se quita directo, y se puede deshacer justo despues (ver
  // Historial/Despensa, mismo patron).
  function quitarFav(a: Alimento) {
    setFavoritos(alternarFavorito(a))
    deshacer.registrar({
      etiqueta: `${a.name} quitado de favoritos`,
      restaurar: async () => {
        setFavoritos(alternarFavorito(a))
      },
    })
  }

  function quitarRec(a: Alimento) {
    setRecientes(quitarReciente(a.id))
    deshacer.registrar({
      etiqueta: `${a.name} quitado de recientes`,
      restaurar: async () => {
        setRecientes(registrarReciente(a))
      },
    })
  }

  function confirmarAnadir() {
    if (!seleccionado || !mealId || gramos <= 0) return
    agregar.mutate(
      { meal: mealId, ingredient: seleccionado.id, amount: gramos },
      {
        onSuccess: () => {
          setRecientes(registrarReciente(seleccionado))
          setSeleccionado(null)
        },
      },
    )
  }

  return (
    <div className="animate-rise space-y-4">
      <div className="flex gap-1 rounded-[14px] border border-border bg-surface p-1">
        {(
          [
            { id: 'recetas', label: 'Recetas' },
            { id: 'buscar', label: 'Buscar' },
            { id: 'recientes', label: 'Recientes' },
            { id: 'favoritos', label: 'Favoritos' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`flex-1 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              pestana === t.id ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg'
            }`}
            onClick={() => setPestana(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pestana === 'recetas' ? (
        household.isLoading || recetas.isLoading ? (
          <SkeletonList rows={4} height="h-16" />
        ) : household.isError || recetas.isError ? (
          <ErrorState onRetry={() => recetas.refetch()} />
        ) : (recetas.data ?? []).length === 0 ? (
          <EmptyState
            icon={ChefHat}
            title="Sin recetas todavía"
            description="Crea tus recetas en Compra para anotarlas aquí de una vez, sin buscar cada alimento suelto."
            action={{ label: 'Nueva receta', onClick: () => navigate('/compra/recetas/nueva') }}
          />
        ) : (
          <ListaRecetas recetas={recetas.data ?? []} onElegir={setRecetaSeleccionada} />
        )
      ) : pestana === 'buscar' ? (
        <>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              className="h-12 w-full rounded-[14px] border border-border bg-surface-2 pl-10 pr-12 text-fg placeholder:text-fg-subtle transition-colors focus:border-primary"
              placeholder="Buscar alimento (pollo, arroz, manzana...)"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {detectorDisponible ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
                aria-label="Escanear código de barras"
                onClick={() => setEscanerAbierto(true)}
              >
                <ScanBarcode size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {errorCodigo ? <p className="text-sm text-danger">{errorCodigo}</p> : null}

          {debounced.trim().length < 2 ? (
            <p className="py-8 text-center text-sm text-fg-subtle">Escribe al menos 2 letras para buscar.</p>
          ) : busqueda.isLoading ? (
            <SkeletonList rows={5} height="h-16" />
          ) : busqueda.isError ? (
            <ErrorState onRetry={() => busqueda.refetch()} />
          ) : (busqueda.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-subtle">Sin resultados para "{debounced}".</p>
          ) : (
            <ListaAlimentos alimentos={busqueda.data ?? []} favoritosIds={favoritosIds} onElegir={abrirSheet} />
          )}
        </>
      ) : pestana === 'recientes' ? (
        recientes.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Sin alimentos recientes"
            description="Lo que registres en el diario aparecerá aquí para añadirlo más rápido la próxima vez."
          />
        ) : (
          <ListaAlimentos
            alimentos={recientes}
            favoritosIds={favoritosIds}
            onElegir={abrirSheet}
            onQuitar={quitarRec}
          />
        )
      ) : favoritos.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Sin favoritos"
          description="Marca alimentos con la estrella para tenerlos siempre a mano."
        />
      ) : (
        <ListaAlimentos
          alimentos={favoritos}
          favoritosIds={favoritosIds}
          onElegir={abrirSheet}
          onQuitar={quitarFav}
        />
      )}

      {seleccionado ? (
        <HojaAlimento
          alimento={seleccionado}
          gramos={gramos}
          onGramos={setGramos}
          mealOptions={mealOptions}
          mealId={mealId}
          onMeal={setMealIdManual}
          esFavorito={favoritosIds.has(seleccionado.id)}
          onFavorito={alternarFav}
          anadiendo={agregar.isPending}
          onAnadir={confirmarAnadir}
          onCerrar={() => setSeleccionado(null)}
        />
      ) : null}

      {escanerAbierto ? (
        <EscanerCodigoBarras onDetectado={alDetectarCodigo} onCerrar={() => setEscanerAbierto(false)} />
      ) : null}

      {recetaSeleccionada ? (
        <AnotarRecetaModal
          recipeId={recetaSeleccionada.id}
          open
          fecha={fecha}
          mealIdInicial={mealParam ?? undefined}
          onClose={() => {
            setRecetaSeleccionada(null)
            navigate(-1)
          }}
        />
      ) : null}

      <UndoBar
        visible={deshacer.pendientes > 0}
        etiqueta={deshacer.error ?? deshacer.etiquetaUltima}
        onDeshacer={() => void deshacer.deshacer()}
        deshaciendo={deshacer.deshaciendo}
      />
    </div>
  )
}
