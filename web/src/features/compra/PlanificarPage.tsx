/**
 * "Planificar": el usuario elige que recetas va a comer y cuantas tandas de
 * cada una para un rango de dias (7, 12 o 14), y de ahi salen dos cosas:
 *
 * 1. La lista de la compra, con las cantidades de cada ingrediente ya sumadas
 *    entre todas las recetas y tandas elegidas (`useGenerarListaDesdePlan`,
 *    en datos.ts: no usa `/generate/` porque ese endpoint deduplica ids
 *    repetidos y no sirve para representar "varias tandas de la misma
 *    receta").
 * 2. La planificacion dia a dia (que receta toca comer cada dia), guardada en
 *    `localStorage` bajo `salaz.plan.semana` (ver planLocal.ts) porque el
 *    backend no tiene ningun concepto de planificacion todavia. DiarioPage
 *    (nutricion) la lee para ofrecer "Anotar la receta de hoy".
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChefHat, ClipboardList, Minus, Plus } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, Field, SectionLabel, SkeletonList } from '../../components/ui'
import { today } from '../../lib/format'
import { useGenerarListaDesdePlan, useHousehold, useRecipes } from './datos'
import { escribirPlanSemana } from './planLocal'
import type { AsignacionDia, RecetaEnPlan } from './planLocal'

const DIAS_PRESET = [7, 12, 14] as const

/** Suma dias a una fecha ISO YYYY-MM-DD sin desplazarse de zona horaria. */
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Lista de fechas ISO entre inicio y fin, ambas incluidas. */
function rangoFechas(inicio: string, fin: string): string[] {
  const out: string[] = []
  let cursor = inicio
  let guarda = 0
  while (cursor <= fin && guarda < 31) {
    out.push(cursor)
    cursor = sumarDias(cursor, 1)
    guarda += 1
  }
  return out
}

function etiquetaDia(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

const selectClass =
  'h-11 w-full rounded-[14px] border border-border bg-surface-2 px-3 text-sm text-fg transition-colors focus:border-primary'

export default function PlanificarPage() {
  const navigate = useNavigate()
  const household = useHousehold()
  const householdId = household.data?.id ?? 0
  const recetas = useRecipes(householdId)
  const generar = useGenerarListaDesdePlan()

  const [fechaInicio, setFechaInicio] = useState(today())
  const [fechaFin, setFechaFin] = useState(sumarDias(today(), 6))
  const [tandasPorReceta, setTandasPorReceta] = useState<Record<number, number>>({})
  const [porDia, setPorDia] = useState<Record<string, number>>({})

  const fechas = useMemo(() => rangoFechas(fechaInicio, fechaFin), [fechaInicio, fechaFin])
  const seleccionadas = Object.entries(tandasPorReceta)
    .filter(([, tandas]) => tandas > 0)
    .map(([id]) => Number(id))

  function elegirRango(dias: number) {
    setFechaFin(sumarDias(fechaInicio, dias - 1))
  }

  function alternarReceta(id: number) {
    setTandasPorReceta((prev) => {
      const siguiente = { ...prev }
      if (siguiente[id]) {
        delete siguiente[id]
        // Si se quita del planificador, tambien se quita de los dias asignados.
        setPorDia((pd) => {
          const pdSiguiente = { ...pd }
          for (const fecha of Object.keys(pdSiguiente)) {
            if (pdSiguiente[fecha] === id) delete pdSiguiente[fecha]
          }
          return pdSiguiente
        })
      } else {
        siguiente[id] = 1
      }
      return siguiente
    })
  }

  function cambiarTandas(id: number, delta: number) {
    setTandasPorReceta((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) }))
  }

  function asignarDia(fecha: string, recipeId: number) {
    setPorDia((prev) => {
      const siguiente = { ...prev }
      if (recipeId === 0) delete siguiente[fecha]
      else siguiente[fecha] = recipeId
      return siguiente
    })
  }

  async function onGenerar() {
    if (!household.data || seleccionadas.length === 0) return
    const listaRecetas = recetas.data ?? []
    const nombreDe = (id: number) => listaRecetas.find((r) => r.id === id)?.name ?? `Receta #${id}`

    const seleccion = seleccionadas.map((id) => ({ recipeId: id, tandas: tandasPorReceta[id] ?? 1 }))

    const resultado = await generar.mutateAsync({
      household: household.data.id,
      start_date: fechaInicio,
      end_date: fechaFin,
      seleccion,
    })

    const seleccionConNombre: RecetaEnPlan[] = seleccion.map((s) => ({
      recipeId: s.recipeId,
      recipeName: nombreDe(s.recipeId),
      tandas: s.tandas,
    }))

    const porDiaConNombre: AsignacionDia[] = Object.entries(porDia).map(([fecha, recipeId]) => ({
      fecha,
      recipeId,
      recipeName: nombreDe(recipeId),
    }))

    escribirPlanSemana({
      household: household.data.id,
      inicio: fechaInicio,
      fin: fechaFin,
      seleccion: seleccionConNombre,
      porDia: porDiaConNombre,
      origenPorIngrediente: resultado.origenPorIngrediente,
    })

    navigate('/compra/lista')
  }

  if (household.isLoading || recetas.isLoading) return <SkeletonList rows={4} height="h-16" />
  if (household.isError || recetas.isError) return <ErrorState onRetry={() => recetas.refetch()} />

  const listaRecetas = recetas.data ?? []

  if (listaRecetas.length === 0) {
    return (
      <EmptyState
        icon={ChefHat}
        title="Sin recetas todavia"
        description="Crea alguna receta primero: el planificador reparte sus ingredientes en la lista de la compra."
      />
    )
  }

  return (
    <div className="animate-rise space-y-5">
      <div>
        <SectionLabel>Rango de dias</SectionLabel>
        <Card className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {DIAS_PRESET.map((dias) => (
              <Button key={dias} type="button" variant="secondary" size="sm" onClick={() => elegirRango(dias)}>
                {dias} dias
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            <Field label="Hasta" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
        </Card>
      </div>

      <div>
        <SectionLabel>Recetas y tandas</SectionLabel>
        <Card className="space-y-2">
          {listaRecetas.map((r) => {
            const elegida = !!tandasPorReceta[r.id]
            return (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-3 rounded-[14px] border px-3 py-2.5 transition-colors duration-150 ${
                  elegida ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => alternarReceta(r.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-fg"
                >
                  {elegida ? (
                    <Check size={16} aria-hidden="true" className="shrink-0 text-primary" />
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {r.name} <span className="text-fg-subtle">· {r.servings} raciones</span>
                  </span>
                </button>
                {elegida ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Quitar una tanda de ${r.name}`}
                      onClick={() => cambiarTandas(r.id, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface-3 text-fg-muted hover:text-fg"
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span className="tnum w-6 text-center text-sm text-fg">{tandasPorReceta[r.id]}</span>
                    <button
                      type="button"
                      aria-label={`Anadir una tanda de ${r.name}`}
                      onClick={() => cambiarTandas(r.id, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface-3 text-fg-muted hover:text-fg"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </Card>
        <p className="mt-2 text-xs text-fg-subtle">Una tanda = una vez la receta completa (todas sus raciones).</p>
      </div>

      {seleccionadas.length > 0 ? (
        <div>
          <SectionLabel>Que se come cada dia (opcional)</SectionLabel>
          <Card className="space-y-2">
            {fechas.map((fecha) => (
              <div key={fecha} className="flex items-center justify-between gap-3">
                <span className="w-24 shrink-0 text-sm capitalize text-fg-muted">{etiquetaDia(fecha)}</span>
                <select
                  className={selectClass}
                  value={porDia[fecha] ?? 0}
                  onChange={(e) => asignarDia(fecha, Number(e.target.value))}
                  aria-label={`Receta del ${etiquetaDia(fecha)}`}
                >
                  <option value={0}>Sin asignar</option>
                  {seleccionadas.map((id) => (
                    <option key={id} value={id}>
                      {listaRecetas.find((r) => r.id === id)?.name ?? `Receta #${id}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-fg-subtle">
            Se guarda en este dispositivo. En el Diario de nutricion, el dia que tenga receta asignada mostrara un
            boton directo para anotarla.
          </p>
        </div>
      ) : null}

      {generar.isError ? <p className="text-sm text-danger">No se pudo generar la lista. Intentalo de nuevo.</p> : null}

      <Button full size="lg" onClick={onGenerar} disabled={seleccionadas.length === 0 || generar.isPending}>
        <ClipboardList size={18} aria-hidden="true" />
        {generar.isPending ? 'Generando lista...' : 'Generar lista y guardar plan'}
      </Button>
    </div>
  )
}
