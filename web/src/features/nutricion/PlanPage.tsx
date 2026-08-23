import { useEffect, useRef, useState } from 'react'
import { Apple } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, Field, SectionLabel, SkeletonList } from '../../components/ui'
import { useActualizarPlan, useCrearPlan, usePlan } from './api'

const PRESETS = [
  { id: 'normal', label: 'Normal', protein: 30, carbs: 40, fat: 30 },
  { id: 'alta-proteina', label: 'Alto en proteina', protein: 40, carbs: 30, fat: 30 },
  { id: 'definicion', label: 'Definicion', protein: 35, carbs: 35, fat: 30 },
  { id: 'volumen', label: 'Volumen', protein: 25, carbs: 50, fat: 25 },
] as const

function gramosDesdePct(kcal: number, pct: number, kcalPorGramo: 4 | 9): number {
  return Math.max(0, Math.round((kcal * pct) / 100 / kcalPorGramo))
}

export default function PlanPage() {
  const plan = usePlan()
  const crearPlan = useCrearPlan()
  const actualizar = useActualizarPlan()

  const [energy, setEnergy] = useState(2200)
  const [fiber, setFiber] = useState(30)
  const [pctProtein, setPctProtein] = useState<number>(PRESETS[0].protein)
  const [pctCarbs, setPctCarbs] = useState<number>(PRESETS[0].carbs)
  const [pctFat, setPctFat] = useState<number>(PRESETS[0].fat)

  const inicializadoRef = useRef(false)

  useEffect(() => {
    if (!plan.data || inicializadoRef.current) return
    inicializadoRef.current = true

    const kcal = plan.data.goal_energy ?? 2200
    setEnergy(kcal)
    setFiber(plan.data.goal_fiber ?? 30)

    const { goal_protein, goal_carbohydrates, goal_fat } = plan.data
    if (goal_protein !== null && goal_carbohydrates !== null && goal_fat !== null && kcal > 0) {
      setPctProtein(Math.round(((goal_protein * 4) / kcal) * 100))
      setPctCarbs(Math.round(((goal_carbohydrates * 4) / kcal) * 100))
      setPctFat(Math.round(((goal_fat * 9) / kcal) * 100))
    } else {
      setPctProtein(PRESETS[0].protein)
      setPctCarbs(PRESETS[0].carbs)
      setPctFat(PRESETS[0].fat)
    }
  }, [plan.data])

  if (plan.isLoading) return <SkeletonList rows={4} height="h-16" />
  if (plan.isError) return <ErrorState onRetry={() => plan.refetch()} />

  if (!plan.data) {
    return (
      <EmptyState
        icon={Apple}
        title="Todavia no tienes un plan nutricional"
        description="Crea uno de registro para poder fijar tus objetivos de calorias y macros."
        action={{
          label: crearPlan.isPending ? 'Creando...' : 'Crear plan',
          onClick: () => crearPlan.mutate(),
        }}
      />
    )
  }

  const gramosProteina = gramosDesdePct(energy, pctProtein, 4)
  const gramosCarbs = gramosDesdePct(energy, pctCarbs, 4)
  const gramosGrasa = gramosDesdePct(energy, pctFat, 9)
  const totalPct = pctProtein + pctCarbs + pctFat
  const sumaValida = totalPct === 100

  function aplicarPreset(preset: (typeof PRESETS)[number]) {
    setPctProtein(preset.protein)
    setPctCarbs(preset.carbs)
    setPctFat(preset.fat)
  }

  function guardar() {
    if (!plan.data || !sumaValida) return
    actualizar.mutate({
      id: plan.data.id,
      goal_energy: Math.round(energy),
      goal_fiber: Math.round(fiber),
      goal_protein: gramosProteina,
      goal_carbohydrates: gramosCarbs,
      goal_fat: gramosGrasa,
    })
  }

  return (
    <div className="animate-rise space-y-5">
      <Card>
        <SectionLabel>Calorias y fibra</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Calorias objetivo (kcal)"
            type="number"
            inputMode="decimal"
            min={0}
            value={energy}
            onChange={(e) => setEnergy(Math.max(0, Number(e.target.value)))}
          />
          <Field
            label="Fibra objetivo (g)"
            type="number"
            inputMode="decimal"
            min={0}
            value={fiber}
            onChange={(e) => setFiber(Math.max(0, Number(e.target.value)))}
          />
        </div>
      </Card>

      <Card>
        <SectionLabel>Reparto de macros</SectionLabel>
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.id} variant="secondary" size="sm" onClick={() => aplicarPreset(p)}>
              {p.label} · {p.protein}/{p.carbs}/{p.fat}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Proteina (%)"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={pctProtein}
            hint={`${gramosProteina} g`}
            onChange={(e) => setPctProtein(Math.max(0, Number(e.target.value)))}
          />
          <Field
            label="Hidratos (%)"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={pctCarbs}
            hint={`${gramosCarbs} g`}
            onChange={(e) => setPctCarbs(Math.max(0, Number(e.target.value)))}
          />
          <Field
            label="Grasa (%)"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={pctFat}
            hint={`${gramosGrasa} g`}
            onChange={(e) => setPctFat(Math.max(0, Number(e.target.value)))}
          />
        </div>

        <p className={`mt-3 text-sm tnum ${sumaValida ? 'text-success' : 'text-danger'}`}>
          Total: {totalPct}%{sumaValida ? '' : ' · debe sumar 100% para poder guardar'}
        </p>
      </Card>

      <Button full size="lg" disabled={!sumaValida || actualizar.isPending} onClick={guardar}>
        {actualizar.isPending ? 'Guardando...' : 'Guardar objetivos'}
      </Button>
      {actualizar.isSuccess ? <p className="text-center text-sm text-success">Objetivos guardados.</p> : null}
      {actualizar.isError ? (
        <p className="text-center text-sm text-danger">No se pudo guardar. Intentalo de nuevo.</p>
      ) : null}
    </div>
  )
}
