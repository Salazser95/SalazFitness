import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Pencil, Trash2, UtensilsCrossed } from 'lucide-react'

import { Button, Card, ConfirmModal, ErrorState, SectionLabel, SkeletonList, Thumbnail } from '../../components/ui'
import { eur, int, num } from '../../lib/format'
import { centimosAEur, eurosACentimos, repartirProporcional } from './calculo'
import { AnotarRecetaModal } from './componentes/AnotarRecetaModal'
import { RecetaIlustracion } from './componentes/RecetaIlustracion'
import {
  useDuplicarReceta,
  useEliminarReceta,
  useIngredienteWger,
  useRecipe,
  useRecipeCost,
  useRecipeIngredients,
} from './datos'
import type { RecipeIngredient } from './tipos'

function LineaIngrediente({ ri, costeCentimos }: { ri: RecipeIngredient; costeCentimos: number }) {
  const info = useIngredienteWger(ri.ingredient)
  const nombre = info.data?.name ?? (info.isLoading ? 'Cargando...' : `Ingrediente #${ri.ingredient}`)

  return (
    <li className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-fg">{nombre}</p>
        <p className="text-sm text-fg-muted">{int(ri.amount)} g</p>
      </div>
      <p className="tnum shrink-0 font-medium text-fg">{centimosAEur(costeCentimos)}</p>
    </li>
  )
}

export default function RecetaDetalle() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id: string }>()
  const id = Number(idParam) || 0

  const receta = useRecipe(id)
  const ingredientes = useRecipeIngredients(id)
  const coste = useRecipeCost(id)
  const eliminar = useEliminarReceta()
  const duplicar = useDuplicarReceta()

  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [anotarAbierto, setAnotarAbierto] = useState(false)

  const cargando = receta.isLoading || ingredientes.isLoading || coste.isLoading
  const error = receta.isError || ingredientes.isError || coste.isError

  if (cargando) return <SkeletonList rows={5} height="h-14" />
  if (error || !receta.data || !coste.data) {
    return (
      <ErrorState
        onRetry={() => {
          receta.refetch()
          ingredientes.refetch()
          coste.refetch()
        }}
      />
    )
  }

  const lista = ingredientes.data ?? []
  // El contrato no guarda un precio por linea de receta (solo el total de la
  // receta, ver RecipeCost en tipos.ts). Se reparte el total real entre las
  // lineas segun su peso en gramos, con el mismo metodo del mayor resto que
  // usa el reparto entre personas: la suma de las lineas da EXACTO el total.
  const totalCentimos = eurosACentimos(coste.data.total_cost)
  const costesPorLinea = repartirProporcional(
    totalCentimos,
    lista.map((ri) => Math.max(0, ri.amount)),
  )

  function onDuplicar() {
    duplicar.mutate(id, { onSuccess: (nueva) => navigate(`/compra/recetas/${nueva.id}`) })
  }

  function onEliminar() {
    if (!receta.data) return
    eliminar.mutate(
      { id, household: receta.data.household },
      { onSuccess: () => navigate('/compra/recetas') },
    )
  }

  return (
    <div className="animate-rise space-y-5">
      <div className="space-y-3">
        <Link
          to="/compra/recetas"
          className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver a recetas
        </Link>

        <Button size="lg" full onClick={() => setAnotarAbierto(true)}>
          <UtensilsCrossed size={18} aria-hidden="true" />
          Anotar en el diario
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/compra/recetas/${id}/editar`)}>
            <Pencil size={16} aria-hidden="true" />
            Editar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDuplicar}
            disabled={duplicar.isPending}
            aria-label="Duplicar esta receta"
          >
            <Copy size={16} aria-hidden="true" />
            {duplicar.isPending ? 'Duplicando...' : 'Duplicar'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmarBorrado(true)} disabled={eliminar.isPending}>
            <Trash2 size={16} aria-hidden="true" />
            Eliminar
          </Button>
        </div>

        {duplicar.isError ? <p className="text-sm text-danger">No se pudo duplicar la receta.</p> : null}
        {eliminar.isError ? <p className="text-sm text-danger">No se pudo eliminar la receta.</p> : null}
      </div>

      {receta.data.image ? (
        <Thumbnail src={receta.data.image} alt={receta.data.name} className="aspect-video" />
      ) : (
        <RecetaIlustracion className="aspect-video" iconSize={48} />
      )}

      <Card>
        <p className="font-display text-2xl text-fg">{receta.data.name}</p>
        <p className="mt-1 text-sm text-fg-muted">{receta.data.servings} raciones</p>
        <p className="tnum mt-3 text-sm text-fg">
          {int(coste.data.macros_per_serving.energy)} kcal · {num(coste.data.macros_per_serving.protein)} g proteína ·{' '}
          {num(coste.data.macros_per_serving.carbohydrates)} g hidratos · {num(coste.data.macros_per_serving.fat)} g grasa ·{' '}
          {eur(coste.data.cost_per_serving)}/persona
        </p>
      </Card>

      <div>
        <SectionLabel>Ingredientes</SectionLabel>
        <Card>
          {lista.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">Esta receta no tiene ingredientes todavía.</p>
          ) : (
            <ul>
              {lista.map((ri, i) => (
                <LineaIngrediente key={ri.id} ri={ri} costeCentimos={costesPorLinea[i] ?? 0} />
              ))}
            </ul>
          )}
        </Card>
        <p className="mt-2 text-xs text-fg-subtle">
          Coste de cada ingrediente repartido a partir del coste total real de la receta, en proporción a su peso.
          Para añadir, editar o quitar ingredientes, usa "Editar" arriba.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Coste total</p>
          <p className="tnum mt-1 font-display text-3xl text-violet">{eur(coste.data.total_cost)}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Coste por ración</p>
          <p className="tnum mt-1 font-display text-3xl text-violet">{eur(coste.data.cost_per_serving)}</p>
        </Card>
      </div>

      {receta.data.instructions ? (
        <Card>
          <SectionLabel>Instrucciones</SectionLabel>
          <p className="text-sm leading-relaxed text-fg">{receta.data.instructions}</p>
        </Card>
      ) : null}

      <ConfirmModal
        open={confirmarBorrado}
        onClose={() => setConfirmarBorrado(false)}
        onConfirm={onEliminar}
        title="Eliminar receta"
        description="Se borrarán también todos sus ingredientes. Esta acción no se puede deshacer."
      />

      <AnotarRecetaModal recipeId={id} open={anotarAbierto} onClose={() => setAnotarAbierto(false)} />
    </div>
  )
}
