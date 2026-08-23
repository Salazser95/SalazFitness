import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { Card, ErrorState, SectionLabel, SkeletonList } from '../../components/ui'
import { api } from '../../lib/api'
import { eur, int, num } from '../../lib/format'
import { centimosAEur, eurosACentimos, repartirProporcional } from './calculo'
import { useRecipe, useRecipeCost, useRecipeIngredients } from './datos'
import type { IngredientWger, RecipeIngredient } from './tipos'

/**
 * Nombre del ingrediente contra el endpoint real de wger, igual que hace
 * `useBuscarIngredientesWger` en datos.ts: no depende de BACKEND_LISTO porque
 * no es parte del modulo nuevo, es la base de alimentos de wger.
 */
function useIngredienteWger(id: number) {
  return useQuery({
    queryKey: ['wger', 'ingredient', id],
    queryFn: () => api.get<IngredientWger>(`/api/v2/ingredient/${id}/`),
    enabled: id > 0,
    staleTime: 5 * 60_000,
  })
}

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
  const { id: idParam } = useParams<{ id: string }>()
  const id = Number(idParam) || 0

  const receta = useRecipe(id)
  const ingredientes = useRecipeIngredients(id)
  const coste = useRecipeCost(id)

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

  return (
    <div className="animate-rise space-y-5">
      <Link
        to="/compra/recetas"
        className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a recetas
      </Link>

      <Card>
        <p className="font-display text-2xl text-fg">{receta.data.name}</p>
        <p className="mt-1 text-sm text-fg-muted">{receta.data.servings} raciones</p>
        <p className="tnum mt-3 text-sm text-fg">
          {int(coste.data.energy)} kcal · {num(coste.data.protein)} g proteina · {num(coste.data.carbohydrates)} g hidratos ·{' '}
          {num(coste.data.fat)} g grasa · {eur(coste.data.cost_per_serving)}/persona
        </p>
      </Card>

      <div>
        <SectionLabel>Ingredientes</SectionLabel>
        <Card>
          {lista.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">Esta receta no tiene ingredientes todavia.</p>
          ) : (
            <ul>
              {lista.map((ri, i) => (
                <LineaIngrediente key={ri.id} ri={ri} costeCentimos={costesPorLinea[i] ?? 0} />
              ))}
            </ul>
          )}
        </Card>
        <p className="mt-2 text-xs text-fg-subtle">
          Coste de cada ingrediente repartido a partir del coste total real de la receta, en proporcion a su peso.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Coste total</p>
          <p className="tnum mt-1 font-display text-3xl text-violet">{eur(coste.data.total_cost)}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Coste por racion</p>
          <p className="tnum mt-1 font-display text-3xl text-violet">{eur(coste.data.cost_per_serving)}</p>
        </Card>
      </div>

      {receta.data.instructions ? (
        <Card>
          <SectionLabel>Instrucciones</SectionLabel>
          <p className="text-sm leading-relaxed text-fg">{receta.data.instructions}</p>
        </Card>
      ) : null}
    </div>
  )
}
