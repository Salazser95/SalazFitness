import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Apple, Clock, Copy, GlassWater, Minus, Plus, Trash2, UtensilsCrossed } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, HeroStat, Pill, SectionLabel, SkeletonList } from '../../components/ui'
import { DayNavigator } from '../../components/DayNavigator'
import { AnotarRecetaModal } from '../compra/componentes/AnotarRecetaModal'
import { recetaDelDia, usePlanSemana } from '../compra/planLocal'
import {
  comidasOrdenadas,
  macrosFor,
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
import type { DiaryEntry, Ingredient, Macros } from './api'
import type { CoberturaComida } from '../compra/tipos'
import { EtiquetaCompra, useEstadoCompraPorComida } from './EstadoCompra'
import { AGUA_OBJETIVO_ML_DEFECTO, AGUA_VASO_ML, useAgua, useEscribirAgua } from './local'
import { addDays, int, num, today } from '../../lib/format'

const MACRO_COLOR: Record<'protein' | 'carbohydrates' | 'fat', string> = {
  protein: '#22D3EE',
  carbohydrates: '#C6F135',
  fat: '#A78BFA',
}

const MACRO_LABEL: Record<'protein' | 'carbohydrates' | 'fat', string> = {
  protein: 'Proteína',
  carbohydrates: 'Hidratos',
  fat: 'Grasa',
}

const MACROS_VACIOS: Macros = { energy: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0 }

type EntradaConMacros = {
  entrada: DiaryEntry
  ingrediente: Ingredient | undefined
  macros: Macros | null
}

function BotonCopiarDia({ planId, fecha }: { planId: string | undefined; fecha: string }) {
  const anterior = addDays(fecha, -1)
  const copiar = useCopiarDia(planId, fecha)
  const [mensaje, setMensaje] = useState<string | null>(null)

  function copiarDiaAnterior() {
    setMensaje(null)
    copiar.mutate(anterior, {
      onSuccess: (cantidad) => {
        setMensaje(
          cantidad > 0 ? `Copiados ${cantidad} alimentos.` : 'El día anterior no tiene registros.',
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
            ? 'Copiar el día de ayer'
            : 'Copiar el día anterior'}
      </Button>
      {mensaje ? <p className="text-xs text-fg-subtle">{mensaje}</p> : null}
      {copiar.isError ? (
        <p className="text-xs text-danger">No se pudo copiar. Inténtalo de nuevo.</p>
      ) : null}
    </div>
  )
}

/**
 * Si el planificador de compra (features/compra/PlanificarPage.tsx) asigno
 * una receta a este dia, ofrece anotarla de golpe. La planificacion vive en
 * localStorage (planLocal.ts, salaz.plan.semana): pendiente de backend.
 */
function TarjetaRecetaDelDia({ fecha }: { fecha: string }) {
  const plan = usePlanSemana()
  const asignacion = recetaDelDia(plan, fecha)
  const [abierto, setAbierto] = useState(false)

  if (!asignacion) return null

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Receta planificada</p>
          <p className="truncate text-fg">{asignacion.recipeName}</p>
        </div>
        <Button size="sm" onClick={() => setAbierto(true)}>
          <UtensilsCrossed size={16} aria-hidden="true" />
          {fecha === today() ? 'Anotar la receta de hoy' : 'Anotar la receta de este día'}
        </Button>
      </div>
      <AnotarRecetaModal recipeId={asignacion.recipeId} open={abierto} onClose={() => setAbierto(false)} fecha={fecha} />
    </>
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
      <p className="min-w-0 truncate text-sm text-fg">{ingrediente?.name ?? 'Alimento'}</p>
      <div className="flex shrink-0 items-center gap-3">
        <p className="tnum text-right text-xs text-fg-subtle">
          <span className="block">{num(entrada.amount)} g</span>
          <span className="block">{macros ? int(macros.energy) : '-'} kcal</span>
        </p>
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-danger"
          aria-label={`Eliminar ${ingrediente?.name ?? 'alimento'}`}
          onClick={() => onEliminar(entrada.id)}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

function SeccionComida({
  nombre,
  hora,
  mealId,
  items,
  kcal,
  estadoCompra,
  onAgregar,
  onEliminar,
}: {
  nombre: string
  hora: string | null
  mealId: string | undefined
  items: EntradaConMacros[]
  kcal: number
  /** Si sus alimentos estan comprados. Undefined si no hay lista de la compra. */
  estadoCompra: CoberturaComida | undefined
  onAgregar: () => void
  onEliminar: (id: string) => void
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-xl leading-tight text-fg">{nombre}</p>
            {hora ? <Pill icon={Clock}>{hora.slice(0, 5)}</Pill> : null}
            <EtiquetaCompra estado={estadoCompra} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 ? (
            <p className="font-display text-2xl tnum leading-none text-fg-muted">{int(kcal)}</p>
          ) : null}
          <div className="hidden lg:block">
            <Button variant="ghost" size="sm" onClick={onAgregar} disabled={!mealId}>
              <Plus size={16} aria-hidden="true" />
              Añadir
            </Button>
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border py-3 text-center text-sm text-fg-subtle">
          Sin alimentos todavía.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <FilaAlimento key={item.entrada.id} item={item} onEliminar={onEliminar} />
          ))}
        </ul>
      )}
      <Button variant="ghost" size="sm" full onClick={onAgregar} disabled={!mealId} className="mt-3 lg:hidden">
        <Plus size={16} aria-hidden="true" />
        Añadir
      </Button>
    </Card>
  )
}

function TarjetaAgua({ fecha }: { fecha: string }) {
  // Del servidor (ver salaz/models/water_log.py): antes vivia en
  // localStorage y por eso no se veia igual en el PC y en el iPhone.
  const agua = useAgua(fecha)
  const escribir = useEscribirAgua(fecha)
  const aguaMl = agua.data ?? 0

  function cambiar(delta: number) {
    escribir.mutate(Math.max(0, aguaMl + delta))
  }

  const pct = Math.min(100, (aguaMl / AGUA_OBJETIVO_ML_DEFECTO) * 100)

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionLabel>Agua</SectionLabel>
        <GlassWater size={16} className="text-accent" aria-hidden="true" />
      </div>
      <div className="mt-3 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => cambiar(-AGUA_VASO_ML)}
          disabled={aguaMl <= 0}
          aria-label="Quitar un vaso de 250 ml"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-fg transition-colors duration-150 hover:bg-surface-3 disabled:opacity-30"
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <p className="font-display text-4xl leading-none tnum text-accent">
          {num(aguaMl / 1000)}
          <span className="ml-1 text-lg text-fg-muted">/ {num(AGUA_OBJETIVO_ML_DEFECTO / 1000)} l</span>
        </p>
        <button
          type="button"
          onClick={() => cambiar(AGUA_VASO_ML)}
          aria-label="Añadir un vaso de 250 ml"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-fg transition-colors duration-150 hover:bg-surface-3"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 text-center text-xs text-fg-subtle">1 vaso = 250 ml</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {escribir.isError ? (
        <p className="mt-2 text-sm text-danger">No se pudo guardar. Inténtalo de nuevo.</p>
      ) : null}
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
  // Antes de los returns tempranos: es un hook y tiene que llamarse siempre.
  const estadoCompra = useEstadoCompraPorComida(fecha)

  if (plan.isLoading) return <SkeletonList rows={4} height="h-24" />
  if (plan.isError) return <ErrorState onRetry={() => plan.refetch()} />

  if (!plan.data) {
    return (
      <EmptyState
        icon={Apple}
        title="Todavía no tienes un plan nutricional"
        description="Crea uno de registro para empezar a apuntar lo que comes. Los objetivos parten de tus calorías de perfil y se pueden ajustar después en Objetivos."
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

  const comidas = comidasOrdenadas(planInfo.data)
  const mapaIngr = ingredientes.data

  const entradasConMacros: EntradaConMacros[] = (diario.data ?? []).map((entrada) => {
    const ingrediente = mapaIngr?.get(entrada.ingredient)
    const macros = ingrediente ? macrosFor(ingrediente, Number(entrada.amount)) : null
    return { entrada, ingrediente, macros }
  })

  const totalDia = sumMacros(entradasConMacros.map((x) => x.macros ?? MACROS_VACIOS))
  const restantes = plan.data.goal_energy ? plan.data.goal_energy - totalDia.energy : null
  const pctEnergia =
    plan.data.goal_energy && plan.data.goal_energy > 0
      ? Math.min(100, (totalDia.energy / plan.data.goal_energy) * 100)
      : 0

  return (
    <div className="animate-rise space-y-5">
      <DayNavigator fecha={fecha} onFechaChange={setFecha} />

      <Card className="p-5">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center lg:gap-6">
          <div>
            <HeroStat label="Calorías" value={int(totalDia.energy)} unit="kcal" accent="fg" />
            {restantes !== null ? (
              <p
                className={`mt-1 font-display text-3xl leading-none tnum ${restantes >= 0 ? 'text-primary' : 'text-warning'}`}
              >
                {restantes >= 0 ? restantes : Math.abs(restantes)}
                <span className="ml-1 text-base text-fg-muted">
                  kcal {restantes >= 0 ? 'restantes' : 'de más'}
                </span>
              </p>
            ) : null}
          </div>
          <div className="mt-4 space-y-3 lg:mt-0">
            {plan.data.goal_energy ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pctEnergia}%` }} />
              </div>
            ) : null}
            <BarraMacro tipo="protein" gramos={totalDia.protein} objetivo={plan.data.goal_protein} />
            <BarraMacro
              tipo="carbohydrates"
              gramos={totalDia.carbohydrates}
              objetivo={plan.data.goal_carbohydrates}
            />
            <BarraMacro tipo="fat" gramos={totalDia.fat} objetivo={plan.data.goal_fat} />
          </div>
        </div>
      </Card>

      {comidas.map((meal, i) => {
        const items = entradasConMacros.filter((x) => x.entrada.meal === meal.id)
        const kcal = sumMacros(items.map((x) => x.macros ?? MACROS_VACIOS)).energy
        return (
          <div key={meal.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
            <SeccionComida
              nombre={meal.name}
              hora={meal.time}
              mealId={meal.id}
              items={items}
              kcal={kcal}
              estadoCompra={estadoCompra?.get(meal.id)}
              onAgregar={() => navigate(`/nutricion/buscar?meal=${meal.id}&fecha=${fecha}`)}
              onEliminar={(id) => eliminar.mutate(id)}
            />
          </div>
        )
      })}

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <TarjetaAgua fecha={fecha} />
        <Card className="space-y-3">
          <SectionLabel>Atajos</SectionLabel>
          <BotonCopiarDia planId={planId} fecha={fecha} />
          <TarjetaRecetaDelDia fecha={fecha} />
        </Card>
      </div>
    </div>
  )
}
