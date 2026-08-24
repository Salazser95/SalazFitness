import { useState } from 'react'
import { Check, ListPlus, ShoppingCart, Trash2 } from 'lucide-react'

import { Button, Card, ConfirmModal, EmptyState, ErrorState, Field, SectionLabel, SkeletonList, StatCard } from '../../components/ui'
import { eur } from '../../lib/format'
import { supermercadoDefectoActual } from '../../lib/settings'
import { eurosACentimos, sumarCentimos } from './calculo'
import {
  fechaPorDefectoNuevaCompra,
  useEliminarLineaLista,
  useGenerarLista,
  useHousehold,
  useListaActiva,
  useListaItems,
  useMarcarComprado,
  useRecipes,
} from './datos'
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

  const [mostrarGenerador, setMostrarGenerador] = useState(false)
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
    setMostrarGenerador(false)
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

  const cargando = household.isLoading || listaActiva.isLoading || (listaId > 0 && listaItems.isLoading)
  const error = household.isError || listaActiva.isError || listaItems.isError

  return (
    <div className="animate-rise space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Lista de la compra</SectionLabel>
        <Button size="sm" variant="secondary" onClick={() => setMostrarGenerador((v) => !v)}>
          <ListPlus size={16} aria-hidden="true" />
          Generar desde recetas
        </Button>
      </div>

      {mostrarGenerador ? (
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
            <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarGenerador(false)}>
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
          description="Genera una lista a partir de tus recetas para empezar."
          action={{ label: 'Generar desde recetas', onClick: () => setMostrarGenerador(true) }}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="La lista esta vacia" description="Todavia no tiene productos." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Comprados" value={`${comprados} de ${items.length}`} accent="primary" />
            <StatCard label="Estimado" value={eur(totalEstimadoCentimos / 100)} accent="violet" />
          </div>
          <Card className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Estimado vs gastado</span>
            <span className="tnum text-sm font-medium text-fg">
              {eur(totalEstimadoCentimos / 100)} · {eur(totalRealCentimos / 100)}
            </span>
          </Card>

          {eliminarItem.isError ? <p className="text-sm text-danger">No se pudo quitar la linea.</p> : null}

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <Card className={`flex items-center gap-3 transition-opacity duration-150 ${item.purchased ? 'opacity-60' : ''}`}>
                  <Casilla
                    marcado={item.purchased}
                    ariaLabel={`Marcar ${item.name} como comprado`}
                    onToggle={() => onToggleComprado(item)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-fg ${item.purchased ? 'line-through' : ''}`}>{item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
                      <span>
                        {item.amount} {item.unit}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.supermarket ?? 'Sin asignar'}</span>
                    </p>
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
            ))}
          </ul>
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
