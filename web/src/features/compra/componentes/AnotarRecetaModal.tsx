/**
 * Modal "Anotar en el diario": convierte una receta (modulo compra) en
 * entradas del diario de nutricion. Cruza los dos modulos a proposito (ver
 * encargo): lee los RecipeIngredient de la receta, los divide entre
 * `servings` y los multiplica por las raciones elegidas, y los manda al
 * diario con `useAnotarRecetaEnDiario` (nutricion/api.ts), que reutiliza el
 * mismo POST que `useAgregarAlimento` sin duplicar la resolucion del plan
 * activo ni la creacion de comidas.
 *
 * Usado desde RecetaDetalle.tsx (compra) y desde DiarioPage.tsx (nutricion,
 * boton "Anotar la receta de hoy" cuando el dia tiene una receta planificada).
 */

import { useState } from 'react'

import { Button, Field, Modal } from '../../../components/ui'
import { today } from '../../../lib/format'
import {
  MEAL_NAMES,
  mapaComidas,
  useAnotarRecetaEnDiario,
  useAsegurarComidas,
  usePlan,
  usePlanInfo,
} from '../../nutricion/api'
import type { MealName } from '../../nutricion/api'
import { useRecipe, useRecipeIngredients } from '../datos'

export function AnotarRecetaModal({
  recipeId,
  open,
  onClose,
  fecha = today(),
}: {
  recipeId: number
  open: boolean
  onClose: () => void
  /** Fecha del diario en la que se anota (YYYY-MM-DD). Por defecto, hoy. */
  fecha?: string
}) {
  const receta = useRecipe(recipeId)
  const ingredientes = useRecipeIngredients(recipeId)
  const plan = usePlan()
  const planInfo = usePlanInfo(plan.data?.id)
  useAsegurarComidas(planInfo.data)
  const anotar = useAnotarRecetaEnDiario(plan.data?.id, fecha)

  const [comida, setComida] = useState<MealName>('Comida')
  const [raciones, setRaciones] = useState(1)
  const [hecho, setHecho] = useState(false)

  function cerrar() {
    setHecho(false)
    anotar.reset()
    onClose()
  }

  if (!open) return null

  const comidas = mapaComidas(planInfo.data)
  const mealId = comidas.get(comida)?.id
  const lista = ingredientes.data ?? []
  const servings = receta.data?.servings || 1
  const cargando = plan.isLoading || (!!plan.data && (planInfo.isLoading || receta.isLoading || ingredientes.isLoading))

  function onConfirmar() {
    if (!mealId || lista.length === 0) return
    const items = lista.map((ri) => ({
      ingredient: ri.ingredient,
      amount: (ri.amount / servings) * raciones,
    }))
    anotar.mutate({ meal: mealId, items }, { onSuccess: () => setHecho(true) })
  }

  return (
    <Modal open={open} onClose={cerrar} title="Anotar en el diario">
      {cargando ? (
        <p className="text-sm text-fg-muted">Cargando...</p>
      ) : !plan.data ? (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Todavia no tienes un plan nutricional. Crea uno primero en Nutricion &gt; Diario.
          </p>
          <Button full variant="secondary" onClick={cerrar}>
            Cerrar
          </Button>
        </div>
      ) : hecho ? (
        <div className="space-y-4">
          <p className="text-sm text-fg">
            Anotados {lista.length} {lista.length === 1 ? 'alimento' : 'alimentos'} de &quot;{receta.data?.name}&quot;
            en {comida}.
          </p>
          <Button full onClick={cerrar}>
            Cerrar
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            {receta.data?.name} · {raciones} de {servings} raciones
          </p>

          <div>
            <p className="mb-1.5 text-sm font-medium text-fg-muted">Comida</p>
            <div className="grid grid-cols-2 gap-2">
              {MEAL_NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={comida === n}
                  onClick={() => setComida(n)}
                  className={`rounded-[14px] border px-3 py-2.5 text-sm transition-colors duration-150 ${
                    comida === n
                      ? 'border-primary bg-primary/10 text-fg'
                      : 'border-border bg-surface-2 text-fg-muted hover:text-fg'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <Field
            label="Raciones"
            type="number"
            min={0.25}
            step={0.25}
            value={raciones}
            onChange={(e) => setRaciones(Math.max(0.25, Number(e.target.value) || 1))}
          />

          {lista.length === 0 ? (
            <p className="text-sm text-danger">Esta receta no tiene ingredientes todavia.</p>
          ) : null}
          {anotar.isError ? <p className="text-sm text-danger">No se pudo anotar. Intentalo de nuevo.</p> : null}

          <Button full onClick={onConfirmar} disabled={anotar.isPending || !mealId || lista.length === 0}>
            {anotar.isPending ? 'Anotando...' : 'Anotar en el diario'}
          </Button>
        </div>
      )}
    </Modal>
  )
}
