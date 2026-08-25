import { useState } from 'react'
import { Apple, Check, ListPlus, ShoppingCart, Trash2 } from 'lucide-react'

import { Button, Card, ConfirmModal, EmptyState, ErrorState, Field, SectionLabel, SkeletonList, StatCard } from '../../components/ui'
import { eur, today } from '../../lib/format'
import { supermercadoDefectoActual } from '../../lib/settings'
import { eurosACentimos, sumarCentimos } from './calculo'
import {
  fechaPorDefectoNuevaCompra,
  useEliminarLineaLista,
  useGenerarLista,
  useGenerarListaDesdeNutricion,
  useHousehold,
  useListaActiva,
  useListaItems,
  useMarcarComprado,
  useRecipes,
} from './datos'
import { origenesDeIngrediente, usePlanSemana } from './planLocal'
import { AvisoDeHoy, CabeceraTanda, PistasFrescura } from './componentes/TandaCompra'
import type { ShoppingListItem } from './tipos'

/** Suma dias a una fecha ISO YYYY-MM-DD, sin desplazarse de zona horaria. */
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 44x44 minimo: se usa de pie en el super, con una mano. Reutilizada por CompraDetalle. */
export function Casilla({ marcado, onToggle, ariaLabel }: { marcado: boolean; onToggle: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border transition-colors duration-150 ${
        marcado
          ? 'border-primary bg-primary text-on-primary'
          : 'border-border bg-surface-2 text-transparent hover:border-border-strong'
      }`}
    >
      <Check size={22} aria-hidden="true" />
    </button>
  )
}

/**
 * Agrupa las lineas por tanda de compra, conservando el orden que ya trae el
 * backend (ordering = trip, category, id). Las listas antiguas, generadas antes
 * de que existieran las tandas, caen todas en la tanda 1 y se ensenan como una
 * sola compra: es exactamente lo que eran.
 */
function agruparPorTanda(items: ShoppingListItem[]): { trip: number; fecha: string | null; items: ShoppingListItem[] }[] {
  const grupos = new Map<number, { trip: number; fecha: string | null; items: ShoppingListItem[] }>()
  for (const item of items) {
    const grupo = grupos.get(item.trip) ?? { trip: item.trip, fecha: item.buy_date, items: [] }
    grupo.items.push(item)
    // La fecha de la tanda es la mas temprana de sus lineas, igual que en el backend.
    if (item.buy_date && (grupo.fecha === null || item.buy_date < grupo.fecha)) {
      grupo.fecha = item.buy_date
    }
    grupos.set(item.trip, grupo)
  }
  return [...grupos.values()].sort((a, b) => a.trip - b.trip)
}

/** El generador desde el plan de nutricion, que es el camino por defecto. */
function GeneradorNutricion({
  householdId,
  onHecho,
}: {
  householdId: number
  onHecho: () => void
}) {
  const generar = useGenerarListaDesdeNutricion()
  const [dias, setDias] = useState(12)
  const [inicio, setInicio] = useState(today())
  const [conFrutaVerdura, setConFrutaVerdura] = useState(true)
  const [conFrutaRoja, setConFrutaRoja] = useState(true)

  async function onGenerar() {
    if (householdId <= 0) return
    await generar.mutateAsync({
      household: householdId,
      start_date: inicio,
      days: dias,
      include_produce: conFrutaVerdura,
      red_fruit: conFrutaRoja,
    })
    onHecho()
  }

  return (
    <Card className="space-y-3">
      <SectionLabel>Desde el plan de nutricion</SectionLabel>
      <p className="text-sm text-fg-muted">
        Coge lo que tienes apuntado en Desayuno, Comida, Cena y Snacks y lo convierte en la compra.
        Lo que no aguanta el periodo entero se reparte en varias compras pequenas, con su fecha.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        <Field
          label="Dias que cubre"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={dias}
          onChange={(e) => setDias(Math.min(60, Math.max(1, Number(e.target.value))))}
        />
      </div>

      <label className="flex items-center gap-3 text-sm text-fg">
        <input
          type="checkbox"
          checked={conFrutaVerdura}
          onChange={(e) => setConFrutaVerdura(e.target.checked)}
          className="h-5 w-5 rounded border-border accent-[var(--color-primary)]"
        />
        Anadir fruta y verdura del dia a dia
      </label>

      <label className={`flex items-center gap-3 text-sm ${conFrutaVerdura ? 'text-fg' : 'text-fg-subtle'}`}>
        <input
          type="checkbox"
          checked={conFrutaRoja && conFrutaVerdura}
          disabled={!conFrutaVerdura}
          onChange={(e) => setConFrutaRoja(e.target.checked)}
          className="h-5 w-5 rounded border-border accent-[var(--color-primary)]"
        />
        Incluir fruta roja (moras, fresas, arandanos)
      </label>
      {conFrutaVerdura && conFrutaRoja ? (
        <p className="text-xs text-fg-subtle">
          La fruta roja se compra poca y a menudo: aguanta 2-3 dias en la nevera.
        </p>
      ) : null}

      <Button type="button" full onClick={onGenerar} disabled={generar.isPending || householdId <= 0}>
        <Apple size={16} aria-hidden="true" />
        {generar.isPending ? 'Generando...' : `Generar compra de ${dias} dias`}
      </Button>
      {generar.isError ? (
        <p className="text-sm text-danger">
          No se pudo generar. Comprueba que el plan de nutricion tiene alimentos en sus comidas.
        </p>
      ) : null}
    </Card>
  )
}

export default function ListaPage() {
  const household = useHousehold()
  const householdId = household.data?.id ?? 0
  const listaActiva = useListaActiva(householdId)
  const listaId = listaActiva.data?.id ?? 0
  const listaItems = useListaItems(listaId)
  const marcar = useMarcarComprado()
  const eliminarItem = useEliminarLineaLista()
  const recetas = useRecipes(householdId)
  const generar = useGenerarLista()
  const planSemana = usePlanSemana()

  const [generador, setGenerador] = useState<'ninguno' | 'nutricion' | 'recetas'>('ninguno')
  const [fechaInicio, setFechaInicio] = useState(fechaPorDefectoNuevaCompra())
  const [fechaFin, setFechaFin] = useState(sumarDias(fechaPorDefectoNuevaCompra(), 7))
  const [recetasElegidas, setRecetasElegidas] = useState<number[]>([])
  const [aBorrar, setABorrar] = useState<ShoppingListItem | null>(null)

  function alternarReceta(id: number) {
    setRecetasElegidas((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]))
  }

  async function onGenerar() {
    if (!household.data || recetasElegidas.length === 0) return
    await generar.mutateAsync({
      household: household.data.id,
      start_date: fechaInicio,
      end_date: fechaFin,
      recipe_ids: recetasElegidas,
    })
    setRecetasElegidas([])
    setGenerador('ninguno')
  }

  function onToggleComprado(item: ShoppingListItem) {
    const marcando = !item.purchased
    // Al marcar como comprado, si la linea no tiene supermercado asignado
    // todavia, precarga el de por defecto. El usuario lo puede cambiar luego.
    marcar.mutate({
      id: item.id,
      purchased: marcando,
      ...(marcando && !item.supermarket ? { supermarket: supermercadoDefectoActual() } : {}),
    })
  }

  function onEliminarItem() {
    if (!aBorrar) return
    eliminarItem.mutate({ id: aBorrar.id, shopping_list: aBorrar.shopping_list })
  }

  const items = listaItems.data ?? []
  const comprados = items.filter((i) => i.purchased).length
  const totalEstimadoCentimos = sumarCentimos(items.map((i) => eurosACentimos(i.estimated_price)))
  // "Real" es lo ya gastado: la suma de lo marcado como comprado. El contrato
  // no guarda un precio pagado aparte, asi que se usa el precio estimado de
  // las lineas ya compradas.
  const totalRealCentimos = sumarCentimos(
    items.filter((i) => i.purchased).map((i) => eurosACentimos(i.estimated_price)),
  )
  const tandas = agruparPorTanda(items)

  const cargando = household.isLoading || listaActiva.isLoading || (listaId > 0 && listaItems.isLoading)
  const error = household.isError || listaActiva.isError || listaItems.isError

  return (
    <div className="animate-rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Lista de la compra</SectionLabel>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={generador === 'nutricion' ? 'primary' : 'secondary'}
            onClick={() => setGenerador((v) => (v === 'nutricion' ? 'ninguno' : 'nutricion'))}
          >
            <Apple size={16} aria-hidden="true" />
            Desde nutricion
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setGenerador((v) => (v === 'recetas' ? 'ninguno' : 'recetas'))}
          >
            <ListPlus size={16} aria-hidden="true" />
            Desde recetas
          </Button>
        </div>
      </div>

      {generador === 'nutricion' ? (
        <GeneradorNutricion householdId={householdId} onHecho={() => setGenerador('ninguno')} />
      ) : null}

      {generador === 'recetas' ? (
        <Card className="space-y-3">
          <SectionLabel>Recetas para la nueva lista</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            <Field label="Hasta" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>

          {recetas.isLoading ? (
            <SkeletonList rows={2} height="h-12" />
          ) : (recetas.data ?? []).length === 0 ? (
            <p className="py-2 text-sm text-fg-muted">Todavia no hay recetas para generar una lista.</p>
          ) : (
            <ul className="space-y-2">
              {(recetas.data ?? []).map((r) => {
                const elegida = recetasElegidas.includes(r.id)
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={elegida}
                      onClick={() => alternarReceta(r.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left text-sm transition-colors duration-150 ${
                        elegida ? 'border-primary bg-primary/10 text-fg' : 'border-border bg-surface-2 text-fg-muted hover:text-fg'
                      }`}
                    >
                      {r.name}
                      {elegida ? <Check size={18} aria-hidden="true" className="text-primary" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setGenerador('ninguno')}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={onGenerar} disabled={recetasElegidas.length === 0 || generar.isPending}>
              {generar.isPending ? 'Generando...' : 'Generar lista'}
            </Button>
          </div>
          {generar.isError ? <p className="text-sm text-danger">No se pudo generar la lista.</p> : null}
        </Card>
      ) : null}

      {cargando ? (
        <SkeletonList rows={4} height="h-16" />
      ) : error ? (
        <ErrorState onRetry={() => listaItems.refetch()} />
      ) : !listaActiva.data ? (
        <EmptyState
          icon={ShoppingCart}
          title="Sin lista activa"
          description="Genera la compra a partir de tu plan de nutricion: lo que comes es lo que hay que comprar."
          action={{ label: 'Generar desde nutricion', onClick: () => setGenerador('nutricion') }}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="La lista esta vacia" description="Todavia no tiene productos." />
      ) : (
        <>
          <AvisoDeHoy items={items} />

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Comprados" value={`${comprados} de ${items.length}`} accent="primary" />
            <StatCard label="Estimado" value={eur(totalEstimadoCentimos / 100)} accent="violet" />
          </div>
          <Card className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">
              {listaActiva.data.days > 0 ? `${listaActiva.data.days} dias · ` : ''}
              Estimado vs gastado
            </span>
            <span className="tnum text-sm font-medium text-fg">
              {eur(totalEstimadoCentimos / 100)} · {eur(totalRealCentimos / 100)}
            </span>
          </Card>

          {eliminarItem.isError ? <p className="text-sm text-danger">No se pudo quitar la linea.</p> : null}

          {tandas.map((tanda) => (
            <section key={tanda.trip} className="space-y-2">
              {/* Con una sola tanda no hay nada que separar: la cabecera solo
                  estorbaria en una lista generada a mano o desde recetas. */}
              {tandas.length > 1 ? (
                <CabeceraTanda
                  trip={tanda.trip}
                  fecha={tanda.fecha}
                  items={tanda.items.length}
                  comprados={tanda.items.filter((i) => i.purchased).length}
                  estimado={sumarCentimos(tanda.items.map((i) => eurosACentimos(i.estimated_price)))}
                />
              ) : null}

              <ul className="space-y-2">
                {tanda.items.map((item) => {
                  // El origen viene del backend (`source`) en las listas nuevas.
                  // En las que se generaron desde el planificador de recetas
                  // sigue estando solo en localStorage, asi que se usa de reserva.
                  const origenesLocales = origenesDeIngrediente(planSemana, item.ingredient)
                  const conOrigen =
                    item.source || origenesLocales.length === 0
                      ? item
                      : { ...item, source: origenesLocales.join(', ') }
                  return (
                    <li key={item.id}>
                      <Card className={`flex items-center gap-3 transition-opacity duration-150 ${item.purchased ? 'opacity-60' : ''}`}>
                        <Casilla
                          marcado={item.purchased}
                          ariaLabel={`Marcar ${item.name} como comprado`}
                          onToggle={() => onToggleComprado(item)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-fg ${item.purchased ? 'line-through' : ''}`}>{item.name}</p>
                          <PistasFrescura item={conOrigen} />
                        </div>
                        <p className="tnum shrink-0 font-medium text-fg">{eur(item.estimated_price)}</p>
                        <button
                          type="button"
                          aria-label={`Quitar ${item.name} de la lista`}
                          onClick={() => setABorrar(item)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-fg-subtle hover:bg-surface-2 hover:text-danger"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      <ConfirmModal
        open={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={onEliminarItem}
        title="Quitar de la lista"
        description={aBorrar ? `Se quitara "${aBorrar.name}" de la lista de la compra.` : undefined}
      />
    </div>
  )
}
