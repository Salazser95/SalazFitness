import { Link } from 'react-router-dom'
import { ChefHat } from 'lucide-react'

import { Card, EmptyState, ErrorState, SectionLabel, Skeleton, SkeletonList, Thumbnail } from '../../components/ui'
import { eur, int, num } from '../../lib/format'
import { RecetaIlustracion } from './componentes/RecetaIlustracion'
import { useHousehold, useRecipeCost, useRecipes } from './datos'
import type { Recipe } from './tipos'

function RecetaFila({ recipe }: { recipe: Recipe }) {
  const coste = useRecipeCost(recipe.id)

  return (
    <Link to={`/compra/recetas/${recipe.id}`}>
      <Card className="transition-colors hover:bg-surface-2">
        <div className="flex items-center justify-between gap-3">
          <div className="h-14 w-14 shrink-0">
            {recipe.image ? (
              <Thumbnail src={recipe.image} alt={recipe.name} className="aspect-square" />
            ) : (
              <RecetaIlustracion className="aspect-square" iconSize={22} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg text-fg">{recipe.name}</p>
            <p className="mt-0.5 text-sm text-fg-muted">{recipe.servings} raciones</p>
          </div>
          {coste.isLoading ? (
            <Skeleton className="h-8 w-16 shrink-0" />
          ) : coste.data ? (
            <p className="tnum shrink-0 font-display text-2xl text-violet">{eur(coste.data.cost_per_serving)}</p>
          ) : null}
        </div>
        {coste.data ? (
          <p className="mt-2 text-sm text-fg-muted">
            {int(coste.data.macros_per_serving.energy)} kcal · {num(coste.data.macros_per_serving.protein)} g proteína ·{' '}
            {num(coste.data.macros_per_serving.carbohydrates)} g hidratos · {num(coste.data.macros_per_serving.fat)} g grasa
          </p>
        ) : null}
      </Card>
    </Link>
  )
}

export default function RecetasPage() {
  const household = useHousehold()
  const householdId = household.data?.id ?? 0
  const recetas = useRecipes(householdId)

  return (
    <div className="animate-rise space-y-4">
      <SectionLabel>Recetas</SectionLabel>

      {household.isLoading || recetas.isLoading ? (
        <SkeletonList rows={4} height="h-24" />
      ) : household.isError || recetas.isError ? (
        <ErrorState onRetry={() => recetas.refetch()} />
      ) : (recetas.data ?? []).length === 0 ? (
        <EmptyState icon={ChefHat} title="Sin recetas todavía" description="Las recetas del hogar aparecerán aquí." />
      ) : (
        <ul className="space-y-3">
          {(recetas.data ?? []).map((r) => (
            <li key={r.id}>
              <RecetaFila recipe={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
