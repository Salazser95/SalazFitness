import { useEffect, useRef, useState } from 'react'
import { Apple, Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react'

import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  SectionLabel,
  SkeletonList,
} from '../../components/ui'
import {
  comidasOrdenadas,
  useActualizarComida,
  useActualizarPlan,
  useCrearComida,
  useCrearPlan,
  useDuplicarPlan,
  useEliminarComida,
  useEliminarPlan,
  useElegirPlanActivo,
  usePlan,
  usePlanInfo,
  usePlanes,
} from './api'
import type { MealConItems, NutritionPlan } from './api'
import { int } from '../../lib/format'

const PRESETS = [
  { id: 'normal', label: 'Normal', protein: 30, carbs: 40, fat: 30 },
  { id: 'alta-proteina', label: 'Alto en proteína', protein: 40, carbs: 30, fat: 30 },
  { id: 'definicion', label: 'Definición', protein: 35, carbs: 35, fat: 30 },
  { id: 'volumen', label: 'Volumen', protein: 25, carbs: 50, fat: 25 },
] as const

function gramosDesdePct(kcal: number, pct: number, kcalPorGramo: 4 | 9): number {
  return Math.max(0, Math.round((kcal * pct) / 100 / kcalPorGramo))
}

function formatearFecha(fechaIso: string): string {
  return new Date(`${fechaIso}T00:00:00`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// -------------------------------------------------------------- lista de planes

function FilaPlan({
  plan,
  activo,
  onActivar,
  onDuplicar,
  onEliminar,
  duplicando,
}: {
  plan: NutritionPlan
  activo: boolean
  onActivar: () => void
  onDuplicar: () => void
  onEliminar: () => void
  duplicando: boolean
}) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 ${
        activo ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface-2'
      }`}
    >
      <button
        type="button"
        className="min-w-0 flex-1 text-left disabled:cursor-default"
        onClick={onActivar}
        disabled={activo}
      >
        <p className="truncate text-sm text-fg">{plan.description || 'Plan nutricional'}</p>
        <p className="tnum text-xs text-fg-subtle">
          Creado el {formatearFecha(plan.creation_date)}
          {plan.goal_energy ? ` · ${int(plan.goal_energy)} kcal` : ''}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {activo ? (
          <span className="whitespace-nowrap rounded-full bg-primary/20 px-2 py-1 text-xs font-semibold text-primary">
            Activo
          </span>
        ) : null}
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-fg disabled:opacity-40"
          aria-label={`Duplicar ${plan.description || 'plan'}`}
          onClick={onDuplicar}
          disabled={duplicando}
        >
          <Copy size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-danger"
          aria-label={`Eliminar ${plan.description || 'plan'}`}
          onClick={onEliminar}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

// -------------------------------------------------------- comidas del plan

function FilaComida({
  comida,
  puedeEliminar,
  onGuardarNombre,
  onEliminar,
}: {
  comida: MealConItems
  /** Un plan tiene que tener al menos una comida: se oculta el borrado si es la única. */
  puedeEliminar: boolean
  onGuardarNombre: (nombre: string) => void
  onEliminar: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(comida.name)

  useEffect(() => {
    setNombre(comida.name)
  }, [comida.name])

  if (editando) {
    return (
      <li className="flex items-center gap-2 rounded-[14px] bg-surface-2 px-3 py-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 text-sm text-fg transition-colors focus:border-primary"
          value={nombre}
          maxLength={25}
          autoFocus
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setNombre(comida.name)
              setEditando(false)
            }
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded-[10px] p-2 text-primary transition-colors duration-150 hover:bg-surface-3 disabled:opacity-40"
          aria-label="Guardar nombre"
          disabled={!nombre.trim()}
          onClick={() => {
            const limpio = nombre.trim()
            if (limpio && limpio !== comida.name) onGuardarNombre(limpio)
            setEditando(false)
          }}
        >
          <Check size={16} aria-hidden="true" />
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-fg">{comida.name}</p>
        <p className="text-xs text-fg-subtle">
          {comida.meal_items.length} {comida.meal_items.length === 1 ? 'alimento' : 'alimentos'} en
          la plantilla
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
          aria-label={`Renombrar ${comida.name}`}
          onClick={() => setEditando(true)}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
        {puedeEliminar ? (
          <button
            type="button"
            className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-danger"
            aria-label={`Eliminar ${comida.name}`}
            onClick={onEliminar}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </li>
  )
}

// -------------------------------------------------------------------- pagina

export default function PlanPage() {
  const planes = usePlanes()
  const plan = usePlan()
  const planInfo = usePlanInfo(plan.data?.id)

  const crearPlan = useCrearPlan()
  const actualizar = useActualizarPlan()
  const elegirActivo = useElegirPlanActivo()
  const eliminarPlan = useEliminarPlan()
  const duplicarPlan = useDuplicarPlan()
  const actualizarComida = useActualizarComida(plan.data?.id)
  const eliminarComida = useEliminarComida(plan.data?.id)
  const crearComida = useCrearComida(plan.data?.id)

  const [energy, setEnergy] = useState(2200)
  const [fiber, setFiber] = useState(30)
  const [nuevaComida, setNuevaComida] = useState('')
  const [pctProtein, setPctProtein] = useState<number>(PRESETS[0].protein)
  const [pctCarbs, setPctCarbs] = useState<number>(PRESETS[0].carbs)
  const [pctFat, setPctFat] = useState<number>(PRESETS[0].fat)

  const [planAEliminar, setPlanAEliminar] = useState<NutritionPlan | null>(null)
  const [comidaAEliminar, setComidaAEliminar] = useState<MealConItems | null>(null)

  // Guarda el id del plan ya cargado en el formulario. Se reinicializa cuando
  // el plan activo cambia (crear, duplicar o elegir otro), no en cada refetch.
  const inicializadoRef = useRef<string | null>(null)

  useEffect(() => {
    if (!plan.data || inicializadoRef.current === plan.data.id) return
    inicializadoRef.current = plan.data.id

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

  if (planes.isLoading) return <SkeletonList rows={4} height="h-16" />
  if (planes.isError) return <ErrorState onRetry={() => planes.refetch()} />

  if (!planes.data || planes.data.length === 0) {
    return (
      <EmptyState
        icon={Apple}
        title="Todavía no tienes un plan nutricional"
        description="Crea uno de registro para poder fijar tus objetivos de calorías y macros."
        action={{
          label: crearPlan.isPending ? 'Creando...' : 'Crear plan',
          onClick: () => crearPlan.mutate(),
        }}
      />
    )
  }

  const activoId = plan.data?.id

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

  function anadirComida() {
    const nombre = nuevaComida.trim()
    if (!nombre) return
    crearComida.mutate(nombre, { onSuccess: () => setNuevaComida('') })
  }

  return (
    <div className="animate-rise space-y-5">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Tus planes</SectionLabel>
          <Button
            variant="ghost"
            size="sm"
            disabled={crearPlan.isPending}
            onClick={() => crearPlan.mutate()}
          >
            {crearPlan.isPending ? 'Creando...' : '+ Nuevo plan'}
          </Button>
        </div>
        <ul className="space-y-2">
          {planes.data.map((p) => (
            <FilaPlan
              key={p.id}
              plan={p}
              activo={p.id === activoId}
              onActivar={() => elegirActivo(p.id)}
              onDuplicar={() => duplicarPlan.mutate(p.id)}
              onEliminar={() => setPlanAEliminar(p)}
              duplicando={duplicarPlan.isPending && duplicarPlan.variables === p.id}
            />
          ))}
        </ul>
        {duplicarPlan.isError ? (
          <p className="mt-3 text-sm text-danger">No se pudo duplicar el plan. Inténtalo de nuevo.</p>
        ) : null}
      </Card>

      {plan.data ? (
        <>
          <Card>
            <SectionLabel>Calorías y fibra</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Calorías objetivo (kcal)"
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
                label="Proteína (%)"
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
          {actualizar.isSuccess ? (
            <p className="text-center text-sm text-success">Objetivos guardados.</p>
          ) : null}
          {actualizar.isError ? (
            <p className="text-center text-sm text-danger">No se pudo guardar. Inténtalo de nuevo.</p>
          ) : null}

          <Card>
            <SectionLabel>Comidas del plan</SectionLabel>
            {planInfo.isLoading ? (
              <SkeletonList rows={4} height="h-14" />
            ) : planInfo.isError ? (
              <ErrorState onRetry={() => planInfo.refetch()} />
            ) : (
              <ul className="space-y-2">
                {comidasOrdenadas(planInfo.data).map((comida) => (
                  <FilaComida
                    key={comida.id}
                    comida={comida}
                    puedeEliminar={(planInfo.data?.meals.length ?? 0) > 1}
                    onGuardarNombre={(name) => actualizarComida.mutate({ id: comida.id, name })}
                    onEliminar={() => setComidaAEliminar(comida)}
                  />
                ))}
              </ul>
            )}

            <div className="mt-3 flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-primary"
                placeholder="Nombre de la comida nueva (p. ej. Merienda)"
                value={nuevaComida}
                maxLength={25}
                onChange={(e) => setNuevaComida(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    anadirComida()
                  }
                }}
              />
              <Button
                size="sm"
                disabled={!nuevaComida.trim() || crearComida.isPending}
                onClick={anadirComida}
              >
                <Plus size={16} aria-hidden="true" />
                Añadir
              </Button>
            </div>
            {crearComida.isError ? (
              <p className="mt-2 text-sm text-danger">No se pudo crear la comida. Inténtalo de nuevo.</p>
            ) : null}

            <p className="mt-3 text-xs text-fg-subtle">
              Puedes tener las comidas que quieras (3, 4, 5...): añade, renombra o borra según te
              convenga. Al borrar una, sus registros del diario no se pierden, se quedan sin agrupar.
            </p>
          </Card>
        </>
      ) : null}

      <ConfirmModal
        open={planAEliminar !== null}
        onClose={() => setPlanAEliminar(null)}
        onConfirm={() => {
          if (planAEliminar) eliminarPlan.mutate(planAEliminar.id)
        }}
        title={`Eliminar "${planAEliminar?.description || 'plan'}"`}
        description="Se borrarán también sus comidas y TODO el registro diario asociado a este plan. Esta acción no se puede deshacer."
        confirmLabel="Eliminar plan"
      />

      <ConfirmModal
        open={comidaAEliminar !== null}
        onClose={() => setComidaAEliminar(null)}
        onConfirm={() => {
          if (comidaAEliminar) eliminarComida.mutate(comidaAEliminar.id)
        }}
        title={`Eliminar "${comidaAEliminar?.name ?? 'comida'}"`}
        description="Se borran los alimentos de su plantilla. Las entradas ya registradas en el diario no se pierden."
        confirmLabel="Eliminar comida"
      />
    </div>
  )
}
