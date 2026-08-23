import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Apple, ChevronLeft, ChevronRight, Copy, GlassWater, Plus, Trash2 } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, SectionLabel, SkeletonList } from '../../components/ui'
import {
  MEAL_NAMES,
  macrosFor,
  mapaComidas,
  sumMacros,
  useAsegurarComidas,
  useCopiarDia,
  useCrearPlan,
  useDiario,
  useEliminarEntrada,
  useIngredientesPorIds,
  usePlan,
  usePlanInfo,
} from './api'
import type { DiaryEntry, Ingredient, Macros, MealName } from './api'
import { AGUA_OBJETIVO_ML_DEFECTO, AGUA_VASO_ML, escribirAgua, leerAgua } from './local'
import { int, num, shortDate, today } from '../../lib/format'

const MACRO_COLOR: Record<'protein' | 'carbohydrates' | 'fat', string> = {
  protein: '#22D3EE',
  carbohydrates: '#C6F135',
  fat: '#A78BFA',
}

const MACRO_LABEL: Record<'protein' | 'carbohydrates' | 'fat', string> = {
  protein: 'Proteina',
  carbohydrates: 'Hidratos',
  fat: 'Grasa',
}

const MACROS_VACIOS: Macros = { energy: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 }

function sumarDias(fechaIso: string, delta: number): string {
  const d = new Date(`${fechaIso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

type EntradaConMacros = {
  entrada: DiaryEntry
  ingrediente: Ingredient | undefined
  macros: Macros | null
}

function SelectorFecha({
  fecha,
  onCambiar,
}: {
  fecha: string
  onCambiar: (siguiente: string) => void
}) {
  return (
    <Card className="flex items-center justify-between gap-2 px-3 py-2.5">
      <button
        type="button"
        className="rounded-[10px] p-2 text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
        aria-label="Dia anterior"
        onClick={() => onCambiar(sumarDias(fecha, -1))}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <div className="text-center">
        <p className="font-display text-lg capitalize leading-tight text-fg">
          {shortDate(`${fecha}T00:00:00`)}
        </p>
        {fecha !== today() ? (
          <button
            type="button"
            className="text-xs font-medium text-accent hover:underline"
            onClick={() => onCambiar(today())}
          >
            Hoy
          </button>
        ) : (
          <span className="text-xs text-fg-subtle">Hoy</span>
        )}
      </div>
      <button
        type="button"
        className="rounded-[10px] p-2 text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
        aria-label="Dia siguiente"
        onClick={() => onCambiar(sumarDias(fecha, 1))}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </Card>
  )
}

function BotonCopiarDia({ planId, fecha }: { planId: string | undefined; fecha: string }) {
  const anterior = sumarDias(fecha, -1)
  const copiar = useCopiarDia(planId, fecha)
  const [mensaje, setMensaje] = useState<string | null>(null)

  function copiarDiaAnterior() {
    setMensaje(null)
    copiar.mutate(anterior, {
      onSuccess: (cantidad) => {
        setMensaje(
          cantidad > 0 ? `Copiados ${cantidad} alimentos.` : 'El dia anterior no tiene registros.',
        )
      },
    })
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button variant="ghost" size="sm" onClick={copiarDiaAnterior} disabled={copiar.isPending}>
        <Copy size={16} aria-hidden="true" />
        {copiar.isPending
          ? 'Copiando...'
          : fecha === today()
            ? 'Copiar el dia de ayer'
            : 'Copiar el dia anterior'}
      </Button>
      {mensaje ? <p className="text-xs text-fg-subtle">{mensaje}</p> : null}
      {copiar.isError ? (
        <p className="text-xs text-danger">No se pudo copiar. Intentalo de nuevo.</p>
      ) : null}
    </div>
  )
}

function BarraMacro({
  tipo,
  gramos,
  objetivo,
}: {
  tipo: 'protein' | 'carbohydrates' | 'fat'
  gramos: number
  objetivo: number | null
}) {
  const pct = objetivo && objetivo > 0 ? Math.min(100, (gramos / objetivo) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-[0.08em] text-fg-muted">
          {MACRO_LABEL[tipo]}
        </span>
        <span className="tnum text-fg-muted">
          {num(gramos)} / {objetivo ? int(objetivo) : '-'} g
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: MACRO_COLOR[tipo] }}
        />
      </div>
    </div>
  )
}

function FilaAlimento({ item, onEliminar }: { item: EntradaConMacros; onEliminar: (id: string) => void }) {
  const { entrada, ingrediente, macros } = item
  return (
    <li className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-fg">{ingrediente?.name ?? 'Alimento'}</p>
        <p className="tnum text-xs text-fg-subtle">
          {num(entrada.amount)} g · {macros ? int(macros.energy) : '-'} kcal
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-danger"
        aria-label={`Eliminar ${ingrediente?.name ?? 'alimento'}`}
        onClick={() => onEliminar(entrada.id)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  )
}

function SeccionComida({
  nombre,
  mealId,
  items,
  onAgregar,
  onEliminar,
}: {
  nombre: MealName
  mealId: string | undefined
  items: EntradaConMacros[]
  onAgregar: () => void
  onEliminar: (id: string) => void
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>{nombre}</SectionLabel>
        <Button variant="ghost" size="sm" onClick={onAgregar} disabled={!mealId}>
          <Plus size={16} aria-hidden="true" />
          Anadir
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-fg-subtle">Sin alimentos todavia.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <FilaAlimento key={item.entrada.id} item={item} onEliminar={onEliminar} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function TarjetaAgua({ fecha }: { fecha: string }) {
  const [aguaMl, setAguaMl] = useState(0)

  useEffect(() => {
    setAguaMl(leerAgua(fecha))
  }, [fecha])

  function cambiar(delta: number) {
    setAguaMl(escribirAgua(fecha, aguaMl + delta))
  }

  const pct = Math.min(100, (aguaMl / AGUA_OBJETIVO_ML_DEFECTO) * 100)

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Agua</SectionLabel>
        <span className="tnum text-sm text-fg-muted">
          {num(aguaMl / 1000)} / {num(AGUA_OBJETIVO_ML_DEFECTO / 1000)} l
        </span>
      </div>
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => cambiar(-AGUA_VASO_ML)}
          disabled={aguaMl <= 0}
        >
          -1 vaso
        </Button>
        <Button variant="accent" size="sm" onClick={() => cambiar(AGUA_VASO_ML)}>
          <GlassWater size={16} aria-hidden="true" />
          +1 vaso (250 ml)
        </Button>
      </div>
    </Card>
  )
}

export default function DiarioPage() {
  const navigate = useNavigate()
  const [fecha, setFecha] = useState(today())

  const plan = usePlan()
  const planId = plan.data?.id
  const planInfo = usePlanInfo(planId)
  useAsegurarComidas(planInfo.data)
  const diario = useDiario(planId, fecha)
  const crearPlan = useCrearPlan()
  const eliminar = useEliminarEntrada(planId, fecha)

  const idsIngredientes = useMemo(() => (diario.data ?? []).map((e) => e.ingredient), [diario.data])
  const ingredientes = useIngredientesPorIds(idsIngredientes)

  if (plan.isLoading) return <SkeletonList rows={4} height="h-24" />
  if (plan.isError) return <ErrorState onRetry={() => plan.refetch()} />

  if (!plan.data) {
    return (
      <EmptyState
        icon={Apple}
        title="Todavia no tienes un plan nutricional"
        description="Crea uno de registro para empezar a apuntar lo que comes. Los objetivos parten de tus calorias de perfil y se pueden ajustar despues en Objetivos."
        action={{
          label: crearPlan.isPending ? 'Creando...' : 'Crear plan',
          onClick: () => crearPlan.mutate(),
        }}
      />
    )
  }

  if (planInfo.isLoading || diario.isLoading) return <SkeletonList rows={5} height="h-24" />
  if (planInfo.isError || diario.isError) {
    return <ErrorState onRetry={() => { planInfo.refetch(); diario.refetch() }} />
  }

  const comidas = mapaComidas(planInfo.data)
  const mapaIngr = ingredientes.data

  const entradasConMacros: EntradaConMacros[] = (diario.data ?? []).map((entrada) => {
    const ingrediente = mapaIngr?.get(entrada.ingredient)
    const macros = ingrediente ? macrosFor(ingrediente, Number(entrada.amount)) : null
    return { entrada, ingrediente, macros }
  })

  const totalDia = sumMacros(entradasConMacros.map((x) => x.macros ?? MACROS_VACIOS))

  return (
    <div className="animate-rise space-y-5">
      <SelectorFecha fecha={fecha} onCambiar={setFecha} />

      <BotonCopiarDia planId={planId} fecha={fecha} />

      <Card className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
          Calorias de hoy
        </p>
        <p className="font-display text-6xl leading-none tnum text-fg">
          {int(totalDia.energy)}
          <span className="ml-2 text-2xl text-fg-muted">
            {plan.data.goal_energy ? `/ ${int(plan.data.goal_energy)} kcal` : 'kcal'}
          </span>
        </p>
        <div className="mt-5 space-y-3 text-left">
          <BarraMacro tipo="protein" gramos={totalDia.protein} objetivo={plan.data.goal_protein} />
          <BarraMacro
            tipo="carbohydrates"
            gramos={totalDia.carbohydrates}
            objetivo={plan.data.goal_carbohydrates}
          />
          <BarraMacro tipo="fat" gramos={totalDia.fat} objetivo={plan.data.goal_fat} />
        </div>
      </Card>

      {MEAL_NAMES.map((nombre) => {
        const meal = comidas.get(nombre)
        const items = entradasConMacros.filter((x) => meal && x.entrada.meal === meal.id)
        return (
          <SeccionComida
            key={nombre}
            nombre={nombre}
            mealId={meal?.id}
            items={items}
            onAgregar={() => meal && navigate(`/nutricion/buscar?meal=${meal.id}&fecha=${fecha}`)}
            onEliminar={(id) => eliminar.mutate(id)}
          />
        )
      })}

      <TarjetaAgua fecha={fecha} />
    </div>
  )
}
